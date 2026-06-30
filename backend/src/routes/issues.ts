import { Router, Request, Response } from 'express';
import { firebaseAdmin, firestore } from '../config/firebase';
import { AuthRequest, verifyToken, verifyOfficerOrAdmin } from '../middleware/auth';
import { classifyIssue, guardrailsCheck } from '../services/ai-service';
import { AIStructuredOutput } from '../types';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';

const router = Router();

const issueSubmissionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 submissions per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'You are submitting issues too quickly. Please wait a minute.' },
});

function apiResponse(success: boolean, data: any = null, error: string | null = null, meta: any = null) {
  const resp: any = { success, data, error };
  if (meta) resp.meta = meta;
  return resp;
}

// Haversine formula for distance in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function logHistory(batch: any, issueId: string, changedBy: string | null, fromStatus: string | null, toStatus: string, note?: string) {
  const ref = firestore.collection('issues').doc(issueId).collection('history').doc();
  batch.set(ref, {
    history_id: ref.id,
    changed_by: changedBy,
    from_status: fromStatus,
    to_status: toStatus,
    note: note || null,
    created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
  });
}

async function sendNotification(userId: string, title: string, body: string, type: string, issueId?: string) {
  if (!userId || userId === 'anonymous') return;
  try {
    const ref = firestore.collection('notifications').doc();
    await ref.set({
      notification_id: ref.id,
      user_id: userId,
      issue_id: issueId || null,
      title,
      body,
      notification_type: type,
      channel: 'in_app',
      deep_link: issueId ? `/issues/${issueId}` : null,
      is_read: false,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Notification error:', err);
  }
}

async function awardXP(userId: string, points: number) {
  if (!userId || userId === 'anonymous') return;
  try {
    const userRef = firestore.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return;
    
    const data = userDoc.data()!;
    let streak = data.streak_days || 0;
    // Simplified streak logic for NoSQL: just increment XP
    await userRef.update({
      xp_points: firebaseAdmin.firestore.FieldValue.increment(points)
    });
  } catch (err) {
    console.error('XP award error:', err);
  }
}

// GET /api/issues - List issues with filters
router.get('/', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { status, category, severity, ward_id, lat, lng, radius_m, limit = '50' } = req.query;
    
    let query: any = firestore.collection('issues');

    if (status) query = query.where('status', '==', status);
    if (category) query = query.where('issue_type', '==', category);
    if (severity) query = query.where('severity', '==', severity);
    if (ward_id) query = query.where('ward_id', '==', ward_id);

    // orderBy requires compound indexes if mixed with where, so we sort in memory for now or just order by created_at if no complex filters
    query = query.orderBy('created_at', 'desc').limit(parseInt(limit as string, 10));

    const snapshot = await query.get();
    let issues = snapshot.docs.map((doc: any) => ({ issue_id: doc.id, ...doc.data() }));

    // In-memory Geospatial Filtering (Haversine)
    if (lat && lng && radius_m) {
      const centerLat = parseFloat(lat as string);
      const centerLng = parseFloat(lng as string);
      const radius = parseFloat(radius_m as string);
      issues = issues.filter((i: any) => {
        if (!i.latitude || !i.longitude) return false;
        const dist = getDistanceMeters(centerLat, centerLng, i.latitude, i.longitude);
        return dist <= radius;
      });
    }

    res.json(apiResponse(true, issues, null, { total: issues.length }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/issues/heatmap/public - public heatmap GeoJSON
router.get('/heatmap/public', async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore.collection('issues')
      .where('status', 'in', ['reported', 'verification', 'assigned', 'in_progress'])
      .limit(1000)
      .get();
      
    const features = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [data.longitude, data.latitude] },
        properties: {
          issue_id: doc.id,
          issue_type: data.issue_type,
          severity: data.severity,
          status: data.status,
          weight: data.severity === 'critical' ? 4 : data.severity === 'high' ? 3 : data.severity === 'medium' ? 2 : 1,
        },
      };
    });
    res.json(apiResponse(true, { type: 'FeatureCollection', features }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/issues/clusters - cluster insights
router.get('/clusters', verifyToken, async (_req: AuthRequest, res: Response) => {
  try {
    const snapshot = await firestore.collection('cluster_insights').orderBy('issue_count', 'desc').limit(20).get();
    res.json(apiResponse(true, snapshot.docs.map(d => ({ cluster_id: d.id, ...d.data() }))));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/issues/:id - Get single issue with full timeline
router.get('/:id', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const issueDoc = await firestore.collection('issues').doc(id).get();
    if (!issueDoc.exists) return res.status(404).json(apiResponse(false, null, 'Issue not found'));

    const issue = { issue_id: id, ...issueDoc.data() } as any;

    // Fetch reporter name
    if (issue.reporter_id) {
      const reporterDoc = await firestore.collection('users').doc(issue.reporter_id).get();
      if (reporterDoc.exists) {
        issue.reporter_name = reporterDoc.data()?.name;
        issue.reporter_trust = reporterDoc.data()?.trust_score;
      }
    }

    // Fetch Subcollections
    const historySnap = await firestore.collection('issues').doc(id).collection('history').orderBy('created_at', 'asc').get();
    const verificationsSnap = await firestore.collection('issues').doc(id).collection('verifications').orderBy('created_at', 'desc').get();
    const commentsSnap = await firestore.collection('issues').doc(id).collection('comments').orderBy('created_at', 'asc').get();

    res.json(apiResponse(true, {
      ...issue,
      history: historySnap.docs.map(d => d.data()),
      verifications: verificationsSnap.docs.map(d => d.data()),
      comments: commentsSnap.docs.map(d => d.data()),
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues - Create new issue
router.post('/', verifyToken, issueSubmissionLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, latitude, longitude, address_text, is_anonymous, device_fingerprint, base64_images } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json(apiResponse(false, null, 'Latitude and longitude are required'));
    }

    if (description) {
      const guardrail = await guardrailsCheck(description);
      if (!guardrail.pass) return res.status(400).json(apiResponse(false, null, `Content blocked: ${guardrail.reason}`));
    }

    const aiResult: AIStructuredOutput = await classifyIssue(
      base64_images || [],
      description || title || ''
    );

    const issueId = firestore.collection('issues').doc().id;
    const reporterId = is_anonymous ? null : req.user!.uid;
    const initialStatus = aiResult.confidence >= 0.65 ? 'verification' : 'reported';

    const batch = firestore.batch();
    const issueRef = firestore.collection('issues').doc(issueId);

    const mediaArr = [];
    if (base64_images && base64_images.length > 0) {
      mediaArr.push({
        media_url: `data:image/jpeg;base64,${base64_images[0].slice(0, 50)}...`,
        media_type: 'image',
        upload_type: 'citizen_report'
      });
    }

    const issueData = {
      reporter_id: reporterId,
      is_anonymous: is_anonymous || false,
      device_fingerprint: device_fingerprint || null,
      title: title || aiResult.summary || 'Civic Issue',
      description: description || '',
      issue_type: aiResult.issue_type,
      subcategory: aiResult.subcategory || null,
      severity: aiResult.severity,
      status: initialStatus,
      latitude,
      longitude,
      address_text: address_text || null,
      ai_confidence: aiResult.confidence,
      ai_summary: aiResult.summary,
      ai_department_recommendation: aiResult.department,
      ai_raw_response: JSON.stringify(aiResult),
      public_safety_risk: aiResult.public_safety_risk || false,
      environmental_risk: aiResult.environmental_risk || false,
      media: mediaArr,
      verification_score: 0,
      verification_count: 0,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    };

    batch.set(issueRef, issueData);

    await logHistory(batch, issueId, reporterId, null, initialStatus, 'Issue submitted');
    await batch.commit();

    if (!is_anonymous && req.user?.uid) {
      awardXP(req.user.uid, 20).catch(console.error);
      sendNotification(req.user.uid, 'Issue Submitted!', `Your report "${issueData.title}" is being processed.`, 'submission', issueId).catch(console.error);
    }

    // Duplicate Check (Haversine in memory)
    const activeIssuesSnap = await firestore.collection('issues')
      .where('issue_type', '==', aiResult.issue_type)
      .where('status', 'in', ['reported', 'verification', 'assigned', 'in_progress'])
      .get();
      
    const nearby_duplicates = activeIssuesSnap.docs
      .map(d => ({ issue_id: d.id, ...d.data() } as any))
      .filter(i => i.issue_id !== issueId && getDistanceMeters(latitude, longitude, i.latitude, i.longitude) <= 300)
      .slice(0, 3);

    res.status(201).json(apiResponse(true, {
      issue_id: issueId,
      ...issueData,
      nearby_duplicates,
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues/:id/verify - Verify an issue
router.post('/:id/verify', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { action_type, comment } = req.body;
    const validActions = ['confirm', 'dispute', 'corroborate', 'still_unresolved', 'false_report_flag'];
    if (!validActions.includes(action_type)) return res.status(400).json(apiResponse(false, null, 'Invalid action type'));

    const issueRef = firestore.collection('issues').doc(req.params.id);
    const issueDoc = await issueRef.get();
    if (!issueDoc.exists) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueDoc.data() as any;

    const userDoc = await firestore.collection('users').doc(req.user!.uid).get();
    const user = userDoc.exists ? userDoc.data() : { trust_score: 1.0, role: 'citizen' };
    const trustWeight = user?.trust_score || 1.0;
    const weightedContribution = action_type === 'confirm' ? trustWeight : (action_type === 'dispute' ? -trustWeight * 0.5 : 0);

    if (comment) {
      const guardrail = await guardrailsCheck(comment);
      if (!guardrail.pass) return res.status(400).json(apiResponse(false, null, `Comment blocked: ${guardrail.reason}`));
    }

    const batch = firestore.batch();
    const verificationRef = issueRef.collection('verifications').doc();
    batch.set(verificationRef, {
      verification_id: verificationRef.id,
      citizen_id: req.user!.uid,
      action_type,
      trust_weight: trustWeight,
      weighted_contribution: weightedContribution,
      comment: comment || null,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });

    const newScore = (issue.verification_score || 0) + (action_type === 'confirm' ? trustWeight : 0);
    const newCount = (issue.verification_count || 0) + 1;
    
    let newStatus = issue.status;
    const isModOrAdmin = user?.role === 'moderator' || user?.role === 'admin';
    const fastTrack = isModOrAdmin && action_type === 'confirm';

    if ((newScore >= 5.0 || fastTrack) && issue.status === 'verification') {
      newStatus = 'assigned';
      await logHistory(batch, req.params.id, req.user!.uid, 'verification', 'assigned', 'Verification threshold met — auto-escalated');
      if (issue.reporter_id) {
        sendNotification(issue.reporter_id, 'Issue Verified!', `Your issue "${issue.title}" has been verified and escalated.`, 'escalation', req.params.id);
      }
    }

    batch.update(issueRef, {
      verification_score: newScore,
      verification_count: newCount,
      status: newStatus,
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    await awardXP(req.user!.uid, 5).catch(console.error);

    res.json(apiResponse(true, { verification_id: verificationRef.id, weighted_contribution: weightedContribution, new_score: newScore }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues/:id/comment - Add public comment
router.post('/:id/comment', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json(apiResponse(false, null, 'Comment content required'));

    const guardrail = await guardrailsCheck(content);
    if (!guardrail.pass) return res.status(400).json(apiResponse(false, null, `Comment blocked: ${guardrail.reason}`));

    const commentRef = firestore.collection('issues').doc(req.params.id).collection('comments').doc();
    const commentData = {
      comment_id: commentRef.id,
      user_id: req.user!.uid,
      content: content.trim(),
      is_visible: true,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    };
    await commentRef.set(commentData);
    res.status(201).json(apiResponse(true, commentData));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues/:id/status - Update issue status (officer/admin)
router.post('/:id/status', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, note, proof_media_url } = req.body;
    const validStatuses = ['assigned', 'in_progress', 'resolved', 'closed', 'reopened'];
    if (!validStatuses.includes(status)) return res.status(400).json(apiResponse(false, null, 'Invalid status'));

    const issueRef = firestore.collection('issues').doc(req.params.id);
    const issueDoc = await issueRef.get();
    if (!issueDoc.exists) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueDoc.data() as any;

    if (status === 'resolved' && !proof_media_url) {
      return res.status(400).json(apiResponse(false, null, 'Proof media URL required for resolution'));
    }

    const batch = firestore.batch();
    const updates: any = { status, updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp() };

    if (status === 'resolved') {
      updates.resolved_at = firebaseAdmin.firestore.FieldValue.serverTimestamp();
      updates.resolution_proof_uploaded = true;
      updates.media = firebaseAdmin.firestore.FieldValue.arrayUnion({
        media_url: proof_media_url,
        media_type: 'image',
        upload_type: 'officer_proof'
      });
    }
    if (status === 'closed') updates.closed_at = firebaseAdmin.firestore.FieldValue.serverTimestamp();

    batch.update(issueRef, updates);
    await logHistory(batch, req.params.id, req.user!.uid, issue.status, status, note);
    await batch.commit();

    if (issue.reporter_id && !issue.is_anonymous) {
      const msgMap: any = {
        assigned: `Your issue "${issue.title}" has been assigned to a team.`,
        in_progress: `A team is working on your issue "${issue.title}".`,
        resolved: `Your issue "${issue.title}" has been marked resolved. Please confirm.`,
        closed: `Your issue "${issue.title}" has been closed.`,
      };
      if (msgMap[status]) {
        sendNotification(issue.reporter_id, `Issue ${status.replace('_', ' ')}`, msgMap[status], 'status_update', req.params.id);
      }
    }

    res.json(apiResponse(true, { issue_id: req.params.id, status }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues/:id/assign - Assign issue to officer/team
router.post('/:id/assign', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { officer_id, team_id, due_date } = req.body;

    const issueRef = firestore.collection('issues').doc(req.params.id);
    const issueDoc = await issueRef.get();
    if (!issueDoc.exists) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueDoc.data() as any;

    const batch = firestore.batch();
    batch.update(issueRef, {
      assigned_officer_id: officer_id || null,
      assigned_team_id: team_id || null,
      status: 'assigned',
      sla_due_at: due_date || issue.sla_due_at || null,
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });

    await logHistory(batch, req.params.id, req.user!.uid, issue.status, 'assigned', `Assigned to ${officer_id || team_id}`);
    await batch.commit();

    if (issue.reporter_id && !issue.is_anonymous) {
      sendNotification(issue.reporter_id, 'Issue Assigned', `Your issue has been assigned.`, 'assignment', req.params.id);
    }
    if (officer_id) {
      sendNotification(officer_id, 'Issue Assigned to You', `Issue "${issue.title}" has been assigned to you.`, 'assignment', req.params.id);
    }

    res.json(apiResponse(true, { issue_id: req.params.id, status: 'assigned', officer_id, team_id }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/issues/:id/reopen - Reopen a resolved/closed issue
router.post('/:id/reopen', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    const issueRef = firestore.collection('issues').doc(req.params.id);
    const issueDoc = await issueRef.get();
    if (!issueDoc.exists) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    const issue = issueDoc.data() as any;

    if (!['resolved', 'closed'].includes(issue.status)) {
      return res.status(400).json(apiResponse(false, null, 'Issue must be resolved or closed to reopen'));
    }

    const batch = firestore.batch();
    const reopen_count = (issue.reopen_count || 0) + 1;
    batch.update(issueRef, {
      status: 'reopened',
      reopen_count,
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      resolved_at: null,
      closed_at: null
    });

    await logHistory(batch, req.params.id, req.user!.uid, issue.status, 'reopened', reason || 'Reopened by citizen');
    await batch.commit();

    await awardXP(req.user!.uid, 8).catch(console.error);

    if (reopen_count >= 3 && issue.assigned_officer_id) {
      sendNotification(issue.assigned_officer_id, 'Issue Reopened (3rd time)', `Issue "${issue.title}" has been reopened multiple times.`, 'escalation', req.params.id);
    }

    res.json(apiResponse(true, { issue_id: req.params.id, status: 'reopened', reopen_count }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
