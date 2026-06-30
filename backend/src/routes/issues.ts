import { Router, Request, Response } from 'express';
import { db } from '../config/db';
import { AuthRequest, verifyToken, verifyOfficerOrAdmin } from '../middleware/auth';
import { classifyIssue, guardrailsCheck } from '../services/ai-service';
import { AIStructuredOutput } from '../types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null, meta: any = null) {
  const resp: any = { success, data, error };
  if (meta) resp.meta = meta;
  return resp;
}

async function logHistory(client: any, issueId: string, changedBy: string | null, fromStatus: string | null, toStatus: string, note?: string) {
  await client.query(
    `INSERT INTO issue_history (history_id, issue_id, changed_by, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), issueId, changedBy, fromStatus, toStatus, note || null]
  );
}

async function sendNotification(userId: string, title: string, body: string, type: string, issueId?: string) {
  if (!userId || userId === 'anonymous') return;
  try {
    await db.query(
      `INSERT INTO notifications (notification_id, user_id, issue_id, title, body, notification_type, channel, deep_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuidv4(), userId, issueId || null, title, body, type, 'in_app', issueId ? `/issues/${issueId}` : null]
    );
  } catch (err) {
    console.error('Notification error:', err);
  }
}

async function awardXP(userId: string, points: number) {
  if (!userId || userId === 'anonymous') return;
  try {
    await db.query(
      `UPDATE users SET xp_points = xp_points + $1, streak_last_active = CURRENT_DATE,
       streak_days = CASE WHEN streak_last_active = CURRENT_DATE - 1 THEN streak_days + 1 ELSE 1 END
       WHERE user_id = $2`,
      [points, userId]
    );
  } catch (err) {
    console.error('XP award error:', err);
  }
}

// GET /api/issues - List issues with filters
router.get('/', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { status, category, severity, ward_id, lat, lng, radius_m, limit = '50', offset = '0' } = req.query;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`i.status = $${idx++}`); values.push(status); }
    if (category) { conditions.push(`i.issue_type = $${idx++}`); values.push(category); }
    if (severity) { conditions.push(`i.severity = $${idx++}`); values.push(severity); }
    if (ward_id) { conditions.push(`i.ward_id = $${idx++}`); values.push(ward_id); }
    if (lat && lng && radius_m) {
      conditions.push(`ST_DWithin(i.geometry::geography, ST_SetSRID(ST_MakePoint($${idx++}, $${idx++}), 4326)::geography, $${idx++})`);
      values.push(parseFloat(lng as string), parseFloat(lat as string), parseFloat(radius_m as string));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await db.query(`SELECT COUNT(*) FROM issues i ${where}`, values);
    const total = parseInt(countResult.rows[0].count, 10);

    values.push(parseInt(limit as string, 10), parseInt(offset as string, 10));
    const result = await db.query(
      `SELECT i.*, u.name as reporter_name,
        COALESCE(json_agg(DISTINCT jsonb_build_object('media_url', m.media_url, 'media_type', m.media_type, 'upload_type', m.upload_type)) FILTER (WHERE m.media_id IS NOT NULL), '[]') as media
       FROM issues i
       LEFT JOIN users u ON i.reporter_id = u.user_id
       LEFT JOIN issue_media m ON i.issue_id = m.issue_id
       ${where}
       GROUP BY i.issue_id, u.name
       ORDER BY
         CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         i.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      values
    );

    res.json(apiResponse(true, result.rows, null, { total, offset: parseInt(offset as string), limit: parseInt(limit as string) }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/issues/heatmap/public - public heatmap GeoJSON
router.get('/heatmap/public', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT issue_id, issue_type, severity, status, latitude, longitude
       FROM issues WHERE status NOT IN ('closed') LIMIT 2000`
    );
    const features = result.rows.map(row => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      properties: {
        issue_id: row.issue_id,
        issue_type: row.issue_type,
        severity: row.severity,
        status: row.status,
        weight: row.severity === 'critical' ? 4 : row.severity === 'high' ? 3 : row.severity === 'medium' ? 2 : 1,
      },
    }));
    res.json(apiResponse(true, { type: 'FeatureCollection', features }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/issues/clusters - cluster insights
router.get('/clusters', verifyToken, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT * FROM cluster_insights ORDER BY issue_count DESC, generated_at DESC LIMIT 20`
    );
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/issues/:id - Get single issue with full timeline
router.get('/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const issueResult = await db.query(
      `SELECT i.*, u.name as reporter_name, u.trust_score as reporter_trust,
        COALESCE(json_agg(DISTINCT jsonb_build_object('media_url', m.media_url, 'media_type', m.media_type, 'upload_type', m.upload_type, 'uploaded_by', m.uploaded_by)) FILTER (WHERE m.media_id IS NOT NULL), '[]') as media
       FROM issues i
       LEFT JOIN users u ON i.reporter_id = u.user_id
       LEFT JOIN issue_media m ON i.issue_id = m.issue_id
       WHERE i.issue_id = $1
       GROUP BY i.issue_id, u.name, u.trust_score`,
      [id]
    );
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));

    const historyResult = await db.query(
      `SELECT h.*, u.name as changed_by_name FROM issue_history h
       LEFT JOIN users u ON h.changed_by = u.user_id
       WHERE h.issue_id = $1 ORDER BY h.created_at ASC`,
      [id]
    );
    const verificationResult = await db.query(
      `SELECT v.*, u.name as verifier_name FROM verifications v
       LEFT JOIN users u ON v.citizen_id = u.user_id
       WHERE v.issue_id = $1 ORDER BY v.created_at DESC`,
      [id]
    );
    const commentsResult = await db.query(
      `SELECT c.*, u.name as author_name FROM comment_moderation c
       LEFT JOIN users u ON c.user_id = u.user_id
       WHERE c.issue_id = $1 AND c.is_visible = true ORDER BY c.created_at ASC`,
      [id]
    );

    res.json(apiResponse(true, {
      ...issueResult.rows[0],
      history: historyResult.rows,
      verifications: verificationResult.rows,
      comments: commentsResult.rows,
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues - Create new issue
router.post('/', verifyToken, async (req: AuthRequest, res: Response) => {
  const client = await db.connect();
  try {
    const { title, description, latitude, longitude, address_text, is_anonymous, device_fingerprint, base64_images } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json(apiResponse(false, null, 'Latitude and longitude are required'));
    }

    // Guardrails check
    if (description) {
      const guardrail = await guardrailsCheck(description);
      if (!guardrail.pass) {
        return res.status(400).json(apiResponse(false, null, `Content blocked: ${guardrail.reason}`));
      }
    }

    // AI classification
    const aiResult: AIStructuredOutput = await classifyIssue(
      base64_images || [],
      description || title || ''
    );

    const issueId = uuidv4();
    const reporterId = is_anonymous ? null : req.user!.uid;
    const initialStatus = aiResult.confidence >= 0.65 ? 'verification' : 'reported';

    await client.query('BEGIN');

    const issueResult = await client.query(
      `INSERT INTO issues (
        issue_id, reporter_id, is_anonymous, device_fingerprint, title, description,
        issue_type, subcategory, severity, status, latitude, longitude,
        address_text, ai_confidence, ai_summary, ai_department_recommendation, ai_raw_response,
        public_safety_risk, environmental_risk
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        issueId, reporterId, is_anonymous || false, device_fingerprint || null,
        title || aiResult.summary || 'Civic Issue', description || '',
        aiResult.issue_type, aiResult.subcategory || null, aiResult.severity, initialStatus,
        latitude, longitude, address_text || null,
        aiResult.confidence, aiResult.summary, aiResult.department, JSON.stringify(aiResult),
        aiResult.public_safety_risk || false, aiResult.environmental_risk || false,
      ]
    );

    const issue = issueResult.rows[0];

    // Store media if provided
    if (base64_images && base64_images.length > 0) {
      const mediaId = uuidv4();
      await client.query(
        `INSERT INTO issue_media (media_id, issue_id, media_url, media_type, uploaded_by, upload_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [mediaId, issueId, `data:image/jpeg;base64,${base64_images[0].slice(0, 50)}...`, 'image', reporterId, 'citizen_report']
      );
    }

    await logHistory(client, issueId, reporterId, null, initialStatus, 'Issue submitted');

    await client.query('COMMIT');

    // Award XP in background
    if (!is_anonymous && req.user?.uid) {
      awardXP(req.user.uid, 20).catch(console.error);
      sendNotification(req.user.uid, 'Issue Submitted!', `Your report "${issue.title}" is being processed.`, 'submission', issueId).catch(console.error);
    }

    // Check for nearby duplicates
    const dupCheck = await db.query(
      `SELECT issue_id, title, issue_type, status FROM issues
       WHERE issue_id != $1 AND issue_type = $2 AND status NOT IN ('closed', 'resolved')
       AND ST_DWithin(geometry::geography, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, 300)
       LIMIT 3`,
      [issueId, aiResult.issue_type, longitude, latitude]
    );

    res.status(201).json(apiResponse(true, {
      ...issue,
      media: [],
      nearby_duplicates: dupCheck.rows,
    }));
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  } finally {
    client.release();
  }
});

// POST /api/issues/:id/verify - Verify an issue
router.post('/:id/verify', verifyToken, async (req: AuthRequest, res: Response) => {
  const client = await db.connect();
  try {
    const { action_type, comment } = req.body;
    const validActions = ['confirm', 'dispute', 'corroborate', 'still_unresolved', 'false_report_flag'];
    if (!validActions.includes(action_type)) {
      return res.status(400).json(apiResponse(false, null, 'Invalid action type'));
    }

    const issueResult = await db.query('SELECT * FROM issues WHERE issue_id = $1', [req.params.id]);
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueResult.rows[0];

    const userResult = await db.query('SELECT trust_score, role FROM users WHERE user_id = $1', [req.user!.uid]);
    const user = userResult.rows[0] || { trust_score: 1.0, role: 'citizen' };
    const trustWeight = user.trust_score || 1.0;
    const weightedContribution = action_type === 'confirm' ? trustWeight : (action_type === 'dispute' ? -trustWeight * 0.5 : 0);

    // Check guardrails on comment
    if (comment) {
      const guardrail = await guardrailsCheck(comment);
      if (!guardrail.pass) {
        return res.status(400).json(apiResponse(false, null, `Comment blocked: ${guardrail.reason}`));
      }
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO verifications (verification_id, issue_id, citizen_id, action_type, trust_weight, weighted_contribution, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuidv4(), req.params.id, req.user!.uid, action_type, trustWeight, weightedContribution, comment || null]
    );

    const newScore = (issue.verification_score || 0) + (action_type === 'confirm' ? trustWeight : 0);
    const newCount = (issue.verification_count || 0) + 1;
    await client.query(
      `UPDATE issues SET verification_score = $1, verification_count = $2 WHERE issue_id = $3`,
      [newScore, newCount, req.params.id]
    );

    // Check escalation threshold (5.0 trust points)
    const isModOrAdmin = user.role === 'moderator' || user.role === 'admin';
    const fastTrack = isModOrAdmin && action_type === 'confirm';
    if ((newScore >= 5.0 || fastTrack) && issue.status === 'verification') {
      await client.query(
        `UPDATE issues SET status = 'assigned' WHERE issue_id = $1`,
        [req.params.id]
      );
      await logHistory(client, req.params.id, req.user!.uid, 'verification', 'assigned', 'Verification threshold met — auto-escalated');
      // Notify reporter
      if (issue.reporter_id) {
        await sendNotification(issue.reporter_id, 'Issue Verified!', `Your issue "${issue.title}" has been verified and escalated.`, 'escalation', req.params.id);
      }
    }

    await client.query('COMMIT');

    await awardXP(req.user!.uid, 5).catch(console.error);

    res.json(apiResponse(true, { verification_id: uuidv4(), weighted_contribution: weightedContribution, new_score: newScore }));
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  } finally {
    client.release();
  }
});

// POST /api/issues/:id/comment - Add public comment
router.post('/:id/comment', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json(apiResponse(false, null, 'Comment content required'));

    const guardrail = await guardrailsCheck(content);
    if (!guardrail.pass) {
      return res.status(400).json(apiResponse(false, null, `Comment blocked: ${guardrail.reason}`));
    }

    const result = await db.query(
      `INSERT INTO comment_moderation (comment_id, issue_id, user_id, content, guardrail_pass)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [uuidv4(), req.params.id, req.user!.uid, content.trim(), true]
    );
    res.status(201).json(apiResponse(true, result.rows[0]));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues/:id/status - Update issue status (officer/admin)
router.post('/:id/status', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  const client = await db.connect();
  try {
    const { status, note, proof_media_url } = req.body;
    const validStatuses = ['assigned', 'in_progress', 'resolved', 'closed', 'reopened'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json(apiResponse(false, null, 'Invalid status'));
    }

    const issueResult = await db.query('SELECT * FROM issues WHERE issue_id = $1', [req.params.id]);
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueResult.rows[0];

    if (status === 'resolved' && !proof_media_url) {
      return res.status(400).json(apiResponse(false, null, 'Proof media URL required for resolution'));
    }

    await client.query('BEGIN');

    const updateFields: string[] = ['status = $1', 'updated_at = NOW()'];
    const updateValues: any[] = [status];
    let paramIdx = 2;

    if (status === 'resolved') {
      updateFields.push(`resolved_at = NOW()`, `resolution_proof_uploaded = true`);
      // Store proof media
      await client.query(
        `INSERT INTO issue_media (media_id, issue_id, media_url, media_type, uploaded_by, upload_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), req.params.id, proof_media_url, 'image', req.user!.uid, 'officer_proof']
      );
    }
    if (status === 'closed') updateFields.push(`closed_at = NOW()`);

    updateValues.push(req.params.id);
    await client.query(
      `UPDATE issues SET ${updateFields.join(', ')} WHERE issue_id = $${paramIdx}`,
      updateValues
    );

    await logHistory(client, req.params.id, req.user!.uid, issue.status, status, note);
    await client.query('COMMIT');

    // Notifications
    if (issue.reporter_id && !issue.is_anonymous) {
      const msgMap: any = {
        assigned: `Your issue "${issue.title}" has been assigned to a team.`,
        in_progress: `A team is working on your issue "${issue.title}".`,
        resolved: `Your issue "${issue.title}" has been marked resolved. Please confirm.`,
        closed: `Your issue "${issue.title}" has been closed.`,
      };
      if (msgMap[status]) {
        await sendNotification(issue.reporter_id, `Issue ${status.replace('_', ' ')}`, msgMap[status], 'status_update', req.params.id);
      }
    }

    res.json(apiResponse(true, { issue_id: req.params.id, status }));
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  } finally {
    client.release();
  }
});

// POST /api/issues/:id/assign - Assign issue to officer/team
router.post('/:id/assign', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  const client = await db.connect();
  try {
    const { officer_id, team_id, due_date } = req.body;

    const issueResult = await db.query('SELECT * FROM issues WHERE issue_id = $1', [req.params.id]);
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueResult.rows[0];

    await client.query('BEGIN');

    await client.query(
      `UPDATE issues SET assigned_officer_id = $1, assigned_team_id = $2, status = 'assigned',
       sla_due_at = COALESCE($3, sla_due_at), updated_at = NOW()
       WHERE issue_id = $4`,
      [officer_id || null, team_id || null, due_date || null, req.params.id]
    );

    await logHistory(client, req.params.id, req.user!.uid, issue.status, 'assigned',
      `Assigned to ${officer_id ? 'officer' : 'team'} ${officer_id || team_id}`);

    await client.query('COMMIT');

    if (issue.reporter_id && !issue.is_anonymous) {
      await sendNotification(issue.reporter_id, 'Issue Assigned', `Your issue has been assigned.`, 'assignment', req.params.id);
    }
    if (officer_id) {
      await sendNotification(officer_id, 'Issue Assigned to You', `Issue "${issue.title}" has been assigned to you.`, 'assignment', req.params.id);
    }

    res.json(apiResponse(true, { issue_id: req.params.id, status: 'assigned', officer_id, team_id }));
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json(apiResponse(false, null, err.message));
  } finally {
    client.release();
  }
});

// POST /api/issues/:id/reopen - Reopen a resolved/closed issue
router.post('/:id/reopen', verifyToken, async (req: AuthRequest, res: Response) => {
  const client = await db.connect();
  try {
    const { reason } = req.body;
    const issueResult = await db.query('SELECT * FROM issues WHERE issue_id = $1', [req.params.id]);
    if (issueResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueResult.rows[0];

    if (!['resolved', 'closed'].includes(issue.status)) {
      return res.status(400).json(apiResponse(false, null, 'Issue must be resolved or closed to reopen'));
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE issues SET status = 'reopened', reopen_count = reopen_count + 1, updated_at = NOW(), resolved_at = NULL, closed_at = NULL
       WHERE issue_id = $1`,
      [req.params.id]
    );

    await logHistory(client, req.params.id, req.user!.uid, issue.status, 'reopened', reason || 'Reopened by citizen');
    await client.query('COMMIT');

    await awardXP(req.user!.uid, 8).catch(console.error);

    // Escalate if reopened 3+ times
    if ((issue.reopen_count || 0) + 1 >= 3) {
      if (issue.assigned_officer_id) {
        await sendNotification(issue.assigned_officer_id, 'Issue Reopened (3rd time)', `Issue "${issue.title}" has been reopened multiple times.`, 'escalation', req.params.id);
      }
    }

    res.json(apiResponse(true, { issue_id: req.params.id, status: 'reopened', reopen_count: (issue.reopen_count || 0) + 1 }));
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json(apiResponse(false, null, err.message));
  } finally {
    client.release();
  }
});

export default router;
