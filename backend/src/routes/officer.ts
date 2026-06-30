import { Router, Response } from 'express';
import { db } from '../config/db';
import { AuthRequest, verifyOfficerOrAdmin } from '../middleware/auth';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null, meta: any = null) {
  const resp: any = { success, data, error };
  if (meta) resp.meta = meta;
  return resp;
}

// GET /api/officer/queue - Priority-sorted queue scoped to officer's department/wards
router.get('/queue', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, severity, category, sla_state, ward_id } = req.query;
    
    // First, fetch the officer's profile
    const profileRes = await db.query('SELECT department_id, ward_ids FROM officer_profiles WHERE officer_id = $1', [req.user!.uid]);
    if (profileRes.rows.length === 0) {
      return res.status(403).json(apiResponse(false, null, 'Officer profile not found'));
    }
    const officer = profileRes.rows[0];
    
    let conditions = [`i.ai_department_recommendation = (SELECT code FROM departments WHERE department_id = $1)`];
    let values: any[] = [officer.department_id];
    let idx = 2;
    
    // Optional ward filtering, but constrained by officer's assigned wards
    if (ward_id) {
      conditions.push(`i.ward_id = $${idx++}`);
      values.push(ward_id);
    } else if (officer.ward_ids && officer.ward_ids.length > 0) {
      conditions.push(`i.ward_id = ANY($${idx++})`);
      values.push(officer.ward_ids);
    }
    
    if (status) { conditions.push(`i.status = $${idx++}`); values.push(status); }
    if (severity) { conditions.push(`i.severity = $${idx++}`); values.push(severity); }
    if (category) { conditions.push(`i.issue_type = $${idx++}`); values.push(category); }
    
    if (sla_state === 'breached') conditions.push(`i.sla_breach_notified = true`);
    if (sla_state === 'at_risk') conditions.push(`i.sla_due_at < NOW() + INTERVAL '8 hours' AND i.sla_breach_notified = false`);
    
    const whereClause = conditions.join(' AND ');
    
    // priority score = (severity_weight × 0.4) + (verification_score × 0.3) + (SLA_urgency × 0.3).
    const query = `
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
      WHERE ${whereClause}
      GROUP BY i.issue_id, u.name, o.name, w.name
      ORDER BY 
        CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        i.sla_due_at ASC NULLS LAST
      LIMIT 100
    `;
    
    const result = await db.query(query, values);
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/officer/issues/:id/assign
router.post('/issues/:id/assign', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const issueId = req.params.id;
    const { assignee_id, priority_flag, instructions } = req.body;
    
    await db.query(
      `UPDATE issues SET assigned_officer_id = $1, status = 'assigned', updated_at = NOW() WHERE issue_id = $2`,
      [assignee_id || req.user!.uid, issueId]
    );
    
    await db.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, from_status, to_status, details) 
       VALUES ($1, $2, 'assigned', 'verification', 'assigned', $3)`,
      [issueId, req.user!.uid, instructions || 'Issue assigned']
    );
    
    res.json(apiResponse(true, { message: 'Assigned successfully' }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/officer/issues/:id/status
router.post('/issues/:id/status', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const issueId = req.params.id;
    const { new_status, note, proof_media_urls } = req.body;
    
    if (new_status === 'resolved' && (!proof_media_urls || proof_media_urls.length === 0)) {
      return res.status(400).json(apiResponse(false, null, 'Proof media is required to resolve an issue'));
    }
    
    const currentRes = await db.query('SELECT status FROM issues WHERE issue_id = $1', [issueId]);
    if (currentRes.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const old_status = currentRes.rows[0].status;
    
    const updateQuery = new_status === 'resolved' 
      ? `UPDATE issues SET status = $1, resolved_at = NOW(), updated_at = NOW() WHERE issue_id = $2`
      : `UPDATE issues SET status = $1, updated_at = NOW() WHERE issue_id = $2`;
      
    await db.query(updateQuery, [new_status, issueId]);
    
    await db.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, from_status, to_status, details) 
       VALUES ($1, $2, 'status_change', $3, $4, $5)`,
      [issueId, req.user!.uid, old_status, new_status, note || '']
    );
    
    if (proof_media_urls && proof_media_urls.length > 0) {
      for (const url of proof_media_urls) {
         await db.query(
           `INSERT INTO issue_media (issue_id, media_url, media_type, upload_type) VALUES ($1, $2, 'image', 'officer_proof')`,
           [issueId, url]
         );
      }
    }
    
    res.json(apiResponse(true, { message: 'Status updated successfully' }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/officer/issues/:id/override-ai
router.post('/issues/:id/override-ai', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const issueId = req.params.id;
    const { field, old_value, new_value, reason } = req.body;
    
    const allowedFields = ['severity', 'issue_type', 'ai_department_recommendation'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json(apiResponse(false, null, 'Invalid field for override'));
    }
    
    await db.query(`UPDATE issues SET ${field} = $1, updated_at = NOW() WHERE issue_id = $2`, [new_value, issueId]);
    
    await db.query(
      `INSERT INTO issue_history (issue_id, actor_id, action, details) 
       VALUES ($1, $2, 'ai_override', $3)`,
      [issueId, req.user!.uid, JSON.stringify({ field, old_value, new_value, reason })]
    );
    
    res.json(apiResponse(true, { message: 'Override applied successfully' }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
