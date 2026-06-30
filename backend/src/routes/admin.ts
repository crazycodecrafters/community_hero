import { Router, Response } from 'express';
import { db } from '../config/db';
import { AuthRequest, verifyAdmin, verifyOfficerOrAdmin } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { firebaseAuth } from '../config/firebase';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null, meta: any = null) {
  const resp: any = { success, data, error };
  if (meta) resp.meta = meta;
  return resp;
}

// GET /api/admin/dashboard - aggregated metrics
router.get('/dashboard', verifyOfficerOrAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status NOT IN ('closed', 'resolved')) as open,
        COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) as resolved,
        COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('closed', 'resolved')) as critical,
        COUNT(*) FILTER (WHERE sla_breach_notified = true) as sla_breached,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
      FROM issues
    `);

    const categoryBreakdown = await db.query(
      `SELECT issue_type, COUNT(*) as count FROM issues GROUP BY issue_type ORDER BY count DESC`
    );
    const severityBreakdown = await db.query(
      `SELECT severity, COUNT(*) as count FROM issues GROUP BY severity`
    );
    const wardBreakdown = await db.query(`
      SELECT w.name as ward_name, w.ward_id,
        COUNT(i.issue_id) as total,
        COUNT(i.issue_id) FILTER (WHERE i.status IN ('resolved','closed')) as resolved,
        AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at))/3600) FILTER (WHERE i.resolved_at IS NOT NULL) as avg_hours
      FROM wards w LEFT JOIN issues i ON w.ward_id = i.ward_id
      GROUP BY w.ward_id, w.name ORDER BY total DESC
    `);
    const slaAtRisk = await db.query(`
      SELECT issue_id, title, severity, sla_due_at,
        EXTRACT(EPOCH FROM (sla_due_at - NOW()))/3600 as hours_remaining
      FROM issues
      WHERE status NOT IN ('resolved','closed') AND sla_due_at IS NOT NULL
      ORDER BY sla_due_at ASC LIMIT 10
    `);

    const row = stats.rows[0];
    res.json(apiResponse(true, {
      total: parseInt(row.total),
      open: parseInt(row.open),
      resolved: parseInt(row.resolved),
      critical: parseInt(row.critical),
      sla_breached: parseInt(row.sla_breached),
      avg_resolution_hours: parseFloat(row.avg_resolution_hours) || 0,
      category_breakdown: Object.fromEntries(categoryBreakdown.rows.map(r => [r.issue_type, parseInt(r.count)])),
      severity_breakdown: Object.fromEntries(severityBreakdown.rows.map(r => [r.severity, parseInt(r.count)])),
      ward_breakdown: wardBreakdown.rows,
      sla_at_risk: slaAtRisk.rows,
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/queue - AI-priority sorted case queue
router.get('/queue', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, ward_id, severity, sla_status, limit = '50', offset = '0' } = req.query;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`i.status = $${idx++}`); values.push(status); }
    if (ward_id) { conditions.push(`i.ward_id = $${idx++}`); values.push(ward_id); }
    if (severity) { conditions.push(`i.severity = $${idx++}`); values.push(severity); }
    if (sla_status === 'breached') conditions.push(`i.sla_breach_notified = true`);
    if (sla_status === 'at_risk') conditions.push(`i.sla_due_at < NOW() + INTERVAL '8 hours' AND i.sla_breach_notified = false`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(`
      SELECT i.*,
        u.name as reporter_name,
        o.name as officer_name,
        w.name as ward_name,
        COALESCE(json_agg(DISTINCT jsonb_build_object('media_url', m.media_url, 'media_type', m.media_type, 'upload_type', m.upload_type)) FILTER (WHERE m.media_id IS NOT NULL), '[]') as media
      FROM issues i
      LEFT JOIN users u ON i.reporter_id = u.user_id
      LEFT JOIN users o ON i.assigned_officer_id = o.user_id
      LEFT JOIN wards w ON i.ward_id = w.ward_id
      LEFT JOIN issue_media m ON i.issue_id = m.issue_id
      ${where}
      GROUP BY i.issue_id, u.name, o.name, w.name
      ORDER BY
        CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        i.sla_due_at ASC NULLS LAST,
        i.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, values);

    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/analytics - full analytics data
router.get('/analytics', verifyOfficerOrAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [stats, categoryBreakdown, severityBreakdown, dailyTrend, wardLeaderboard, departments] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status NOT IN ('closed','resolved')) as open,
          COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as resolved,
          COUNT(*) FILTER (WHERE severity = 'critical' AND status NOT IN ('closed','resolved')) as critical,
          COUNT(*) FILTER (WHERE sla_breach_notified = true) as sla_breached,
          COUNT(*) FILTER (WHERE reopen_count > 0) as reopened,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours,
          AVG(verification_score) as avg_verification_score
        FROM issues
      `),
      db.query(`SELECT issue_type, COUNT(*) as count FROM issues GROUP BY issue_type ORDER BY count DESC`),
      db.query(`SELECT severity, COUNT(*) as count FROM issues GROUP BY severity`),
      db.query(`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM issues WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at) ORDER BY date
      `),
      db.query(`
        SELECT w.name as ward_name,
          COUNT(i.issue_id) as total,
          COUNT(i.issue_id) FILTER (WHERE i.status IN ('resolved','closed')) as resolved,
          ROUND(100.0 * COUNT(i.issue_id) FILTER (WHERE i.status IN ('resolved','closed')) / NULLIF(COUNT(i.issue_id), 0), 1) as resolution_rate
        FROM wards w LEFT JOIN issues i ON w.ward_id = i.ward_id
        GROUP BY w.ward_id, w.name ORDER BY resolution_rate DESC NULLS LAST
      `),
      db.query(`
        SELECT d.name as department_name, d.code,
          COUNT(i.issue_id) as total,
          COUNT(i.issue_id) FILTER (WHERE i.status IN ('resolved','closed')) as resolved,
          AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at))/3600) FILTER (WHERE i.resolved_at IS NOT NULL) as avg_hours
        FROM departments d LEFT JOIN issues i ON d.code = i.ai_department_recommendation
        GROUP BY d.department_id, d.name, d.code ORDER BY total DESC
      `),
    ]);

    const row = stats.rows[0];
    res.json(apiResponse(true, {
      total: parseInt(row.total),
      open: parseInt(row.open),
      resolved: parseInt(row.resolved),
      critical: parseInt(row.critical),
      sla_breached: parseInt(row.sla_breached),
      reopened: parseInt(row.reopened),
      avg_resolution_hours: parseFloat(row.avg_resolution_hours) || 0,
      avg_verification_score: parseFloat(row.avg_verification_score) || 0,
      category_breakdown: Object.fromEntries(categoryBreakdown.rows.map(r => [r.issue_type, parseInt(r.count)])),
      severity_breakdown: Object.fromEntries(severityBreakdown.rows.map(r => [r.severity, parseInt(r.count)])),
      daily_trend: dailyTrend.rows,
      ward_leaderboard: wardLeaderboard.rows,
      department_performance: departments.rows,
      reopen_rate: parseInt(row.total) > 0 ? parseInt(row.reopened) / parseInt(row.total) : 0,
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/users - list all users
router.get('/users', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { search, role, limit = '50', offset = '0' } = req.query;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role) { conditions.push(`role = $${idx++}`); values.push(role); }
    if (search) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit as string), parseInt(offset as string));

    const result = await db.query(
      `SELECT user_id, name, email, role, xp_points, streak_days, trust_score,
        false_report_count, spam_flag_count, badge_ids, avatar_url, created_at, last_login_at
       FROM users ${where}
       ORDER BY xp_points DESC, created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/users/:uid/role - change user role
router.post('/users/:uid/role', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    if (!['citizen', 'moderator', 'officer', 'admin'].includes(role)) {
      return res.status(400).json(apiResponse(false, null, 'Invalid role'));
    }
    await db.query('UPDATE users SET role = $1 WHERE user_id = $2', [role, req.params.uid]);

    try {
      // We no longer set custom claims in Firebase because we rely on Postgres
      // for role checking. This avoids ENOTFOUND metadata.google.internal errors.
    } catch {
      // Firebase claims update is best-effort; Postgres is source of truth
    }

    res.json(apiResponse(true, { uid: req.params.uid, role }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/override - Override AI classification
router.post('/override', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { issue_id, issue_type, severity, department, reason } = req.body;

    await db.query(
      `UPDATE issues SET issue_type = COALESCE($1, issue_type), severity = COALESCE($2, severity),
       ai_department_recommendation = COALESCE($3, ai_department_recommendation), ai_confidence = 1.0, updated_at = NOW()
       WHERE issue_id = $4`,
      [issue_type || null, severity || null, department || null, issue_id]
    );
    // Log override
    await db.query(
      `INSERT INTO issue_history (history_id, issue_id, changed_by, from_status, to_status, note)
       SELECT $1, $2, $3, status, status, $4 FROM issues WHERE issue_id = $2`,
      [uuidv4(), issue_id, req.user!.uid, `Admin override: ${reason || 'No reason given'}`]
    );
    res.json(apiResponse(true, { issue_id, overridden: true }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/assign - Assign issue
router.post('/assign', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { issue_id, assign_type, assign_to, due_at } = req.body;

    const updateField = assign_type === 'officer' ? 'assigned_officer_id' : 'assigned_team_id';
    const issueResult = await db.query('SELECT * FROM issues WHERE issue_id = $1', [issue_id]);
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueResult.rows[0];

    await db.query(
      `UPDATE issues SET ${updateField} = $1, status = 'assigned', sla_due_at = COALESCE($2, sla_due_at), updated_at = NOW()
       WHERE issue_id = $3`,
      [assign_to, due_at || null, issue_id]
    );
    await db.query(
      `INSERT INTO issue_history (history_id, issue_id, changed_by, from_status, to_status, note)
       VALUES ($1, $2, $3, $4, 'assigned', $5)`,
      [uuidv4(), issue_id, req.user!.uid, issue.status, `Assigned to ${assign_type}: ${assign_to}`]
    );

    res.json(apiResponse(true, { issue_id, assigned: true, assign_type, assign_to }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/predictions - predictive insights
router.get('/predictions', verifyAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const hotspots = await db.query(`
      SELECT issue_type, ward_id, w.name as ward_name,
        COUNT(*) as count, AVG(verification_score) as avg_verification,
        ST_Y(ST_Centroid(ST_Collect(geometry::geometry))) as center_lat,
        ST_X(ST_Centroid(ST_Collect(geometry::geometry))) as center_lng
      FROM issues i LEFT JOIN wards w ON i.ward_id = w.ward_id
      WHERE created_at > NOW() - INTERVAL '90 days'
        AND status NOT IN ('closed')
      GROUP BY issue_type, ward_id, w.name
      HAVING COUNT(*) >= 3
      ORDER BY count DESC LIMIT 10
    `);

    const slaRisk = await db.query(`
      SELECT i.issue_id, i.title, i.severity, i.sla_due_at,
        u.name as officer_name,
        EXTRACT(EPOCH FROM (i.sla_due_at - NOW()))/3600 as hours_remaining
      FROM issues i
      LEFT JOIN users u ON i.assigned_officer_id = u.user_id
      WHERE i.status NOT IN ('resolved','closed')
        AND i.sla_due_at IS NOT NULL
        AND i.sla_due_at < NOW() + INTERVAL '24 hours'
      ORDER BY i.sla_due_at ASC LIMIT 10
    `);

    const bottlenecks = await db.query(`
      SELECT ai_department_recommendation as department,
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed')) as open_count,
        COUNT(*) FILTER (WHERE sla_breach_notified = true) as breached_count,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_hours
      FROM issues
      WHERE ai_department_recommendation IS NOT NULL
      GROUP BY ai_department_recommendation
      HAVING COUNT(*) FILTER (WHERE sla_breach_notified = true) > 0
      ORDER BY breached_count DESC
    `);

    res.json(apiResponse(true, {
      hotspots: hotspots.rows,
      sla_at_risk: slaRisk.rows,
      bottlenecks: bottlenecks.rows,
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/wards - list all wards
router.get('/wards', verifyAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(`SELECT ward_id, name, city FROM wards ORDER BY name`);
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/teams - list all teams
router.get('/teams', verifyAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(`
      SELECT t.*, d.name as department_name, w.name as ward_name
      FROM teams t
      LEFT JOIN departments d ON t.department_id = d.department_id
      LEFT JOIN wards w ON t.ward_id = w.ward_id
      ORDER BY t.name
    `);
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/issues/:id/status - admin status update
router.post('/issues/:id/status', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, note } = req.body;
    const issueResult = await db.query('SELECT * FROM issues WHERE issue_id = $1', [req.params.id]);
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueResult.rows[0];

    const updates: Record<string, any> = { status, updated_at: new Date() };
    if (status === 'closed') updates.closed_at = new Date();
    if (status === 'resolved') updates.resolved_at = new Date();

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(updates), req.params.id];

    await db.query(`UPDATE issues SET ${setClauses} WHERE issue_id = $${values.length}`, values);
    await db.query(
      `INSERT INTO issue_history (history_id, issue_id, changed_by, from_status, to_status, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), req.params.id, req.user!.uid, issue.status, status, note || null]
    );

    res.json(apiResponse(true, { issue_id: req.params.id, status }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/issues/bulk-reassign
router.post('/issues/bulk-reassign', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { issue_ids, new_officer_id, new_department_id } = req.body;
    if (!issue_ids || !Array.isArray(issue_ids) || issue_ids.length === 0) {
      return res.status(400).json(apiResponse(false, null, 'No issue_ids provided'));
    }

    let setParts = ['updated_at = NOW()'];
    let values = [];
    let idx = 1;

    if (new_officer_id) {
      setParts.push(`assigned_officer_id = $${idx++}`);
      values.push(new_officer_id);
    }
    if (new_department_id) {
      setParts.push(`ai_department_recommendation = (SELECT code FROM departments WHERE department_id = $${idx++})`);
      values.push(new_department_id);
    }

    if (setParts.length === 1) return res.status(400).json(apiResponse(false, null, 'No target specified'));

    const issueIdsList = issue_ids.map((id, i) => `$${idx + i}`).join(',');
    values.push(...issue_ids);

    await db.query(
      `UPDATE issues SET ${setParts.join(', ')} WHERE issue_id IN (${issueIdsList})`,
      values
    );

    res.json(apiResponse(true, { message: 'Bulk reassignment successful' }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/issues/:id/merge
router.post('/issues/:id/merge', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const primaryId = req.params.id;
    const { target_issue_id, reason } = req.body;

    await db.query(`UPDATE issues SET status = 'closed', updated_at = NOW() WHERE issue_id = $1`, [target_issue_id]);
    
    // Log the merge
    await db.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, details) VALUES ($1, $2, 'merged', $3)`,
      [primaryId, req.user!.uid, JSON.stringify({ merged_issue_id: target_issue_id, reason })]
    );

    res.json(apiResponse(true, { message: 'Merge successful' }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/issues/:id/split
router.post('/issues/:id/split', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const issueId = req.params.id;
    const { reason } = req.body;

    // Log the split
    await db.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, details) VALUES ($1, $2, 'split', $3)`,
      [issueId, req.user!.uid, JSON.stringify({ reason })]
    );

    res.json(apiResponse(true, { message: 'Split logged successfully' }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/moderation/queue
router.get('/moderation/queue', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // For now, simulate moderation queue using low AI confidence
    const result = await db.query(`
      SELECT issue_id, title, description, ai_confidence, status, severity, created_at
      FROM issues 
      WHERE ai_confidence < 0.65 OR status = 'verification'
      ORDER BY created_at DESC LIMIT 50
    `);
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
