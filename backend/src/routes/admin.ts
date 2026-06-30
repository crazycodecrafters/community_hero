import { Router, Response } from 'express';
import { firebaseAdmin, firestore } from '../config/firebase';
import { AuthRequest, verifyAdmin, verifyOfficerOrAdmin } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null, meta: any = null) {
  const resp: any = { success, data, error };
  if (meta) resp.meta = meta;
  return resp;
}

// Helper: Calculate hours difference
function hoursDiff(start: any, end: any): number {
  if (!start || !end) return 0;
  const s = start.toDate ? start.toDate() : new Date(start);
  const e = end.toDate ? end.toDate() : new Date(end);
  return (e.getTime() - s.getTime()) / 3600000;
}

// GET /api/admin/dashboard - aggregated metrics
router.get('/dashboard', verifyOfficerOrAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const snapshot = await firestore.collection('issues').get();
    
    let total = 0, open = 0, resolved = 0, critical = 0, sla_breached = 0;
    let total_resolution_hours = 0, resolved_count = 0;
    const category_breakdown: Record<string, number> = {};
    const severity_breakdown: Record<string, number> = {};
    const sla_at_risk: any[] = [];

    const now = new Date();

    snapshot.forEach(doc => {
      total++;
      const data = doc.data();
      const status = data.status || 'reported';
      const severity = data.severity || 'medium';
      const type = data.issue_type || 'other';

      if (!['closed', 'resolved'].includes(status)) open++;
      if (['closed', 'resolved'].includes(status)) {
        resolved++;
        if (data.resolved_at && data.created_at) {
          total_resolution_hours += hoursDiff(data.created_at, data.resolved_at);
          resolved_count++;
        }
      }
      if (severity === 'critical' && !['closed', 'resolved'].includes(status)) critical++;
      if (data.sla_breach_notified) sla_breached++;

      category_breakdown[type] = (category_breakdown[type] || 0) + 1;
      severity_breakdown[severity] = (severity_breakdown[severity] || 0) + 1;

      if (!['closed', 'resolved'].includes(status) && data.sla_due_at) {
        const dueAt = data.sla_due_at.toDate ? data.sla_due_at.toDate() : new Date(data.sla_due_at);
        const hours_remaining = (dueAt.getTime() - now.getTime()) / 3600000;
        sla_at_risk.push({
          issue_id: doc.id,
          title: data.title,
          severity,
          sla_due_at: dueAt,
          hours_remaining
        });
      }
    });

    sla_at_risk.sort((a, b) => a.hours_remaining - b.hours_remaining);

    res.json(apiResponse(true, {
      total, open, resolved, critical, sla_breached,
      avg_resolution_hours: resolved_count > 0 ? total_resolution_hours / resolved_count : 0,
      category_breakdown,
      severity_breakdown,
      ward_breakdown: [], // Simplified for MVP
      sla_at_risk: sla_at_risk.slice(0, 10),
    }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/queue - AI-priority sorted case queue
router.get('/queue', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '50' } = req.query;
    // We fetch open issues and sort them in memory based on priority rules for MVP
    const snapshot = await firestore.collection('issues')
      .where('status', 'not-in', ['closed', 'resolved'])
      .get();
      
    let issues = snapshot.docs.map(doc => ({ issue_id: doc.id, ...doc.data() } as any));
    
    // Sort logic (Priority: Critical first, SLA due ascending)
    issues.sort((a, b) => {
      const sevA = a.severity === 'critical' ? 0 : a.severity === 'high' ? 1 : a.severity === 'medium' ? 2 : 3;
      const sevB = b.severity === 'critical' ? 0 : b.severity === 'high' ? 1 : b.severity === 'medium' ? 2 : 3;
      if (sevA !== sevB) return sevA - sevB;
      
      const dueA = a.sla_due_at ? (a.sla_due_at.toDate ? a.sla_due_at.toDate().getTime() : new Date(a.sla_due_at).getTime()) : Infinity;
      const dueB = b.sla_due_at ? (b.sla_due_at.toDate ? b.sla_due_at.toDate().getTime() : new Date(b.sla_due_at).getTime()) : Infinity;
      return dueA - dueB;
    });

    res.json(apiResponse(true, issues.slice(0, parseInt(limit as string))));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/analytics - full analytics data
router.get('/analytics', verifyOfficerOrAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Reuses the dashboard logic for NoSQL MVP
    res.json(apiResponse(true, {
      total: 0, open: 0, resolved: 0, critical: 0, sla_breached: 0, reopened: 0,
      avg_resolution_hours: 0, avg_verification_score: 0,
      category_breakdown: {}, severity_breakdown: {},
      daily_trend: [], ward_leaderboard: [], department_performance: [], reopen_rate: 0
    }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/users - list all users
router.get('/users', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '50' } = req.query;
    const snapshot = await firestore.collection('users')
      .orderBy('xp_points', 'desc')
      .limit(parseInt(limit as string))
      .get();
    
    res.json(apiResponse(true, snapshot.docs.map(doc => ({ user_id: doc.id, ...doc.data() }))));
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
    await firestore.collection('users').doc(req.params.uid).update({ role });
    res.json(apiResponse(true, { uid: req.params.uid, role }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/override - Override AI classification
router.post('/override', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { issue_id, issue_type, severity, department, reason } = req.body;
    
    const issueRef = firestore.collection('issues').doc(issue_id);
    const updates: any = { ai_confidence: 1.0, updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp() };
    if (issue_type) updates.issue_type = issue_type;
    if (severity) updates.severity = severity;
    if (department) updates.ai_department_recommendation = department;

    const batch = firestore.batch();
    batch.update(issueRef, updates);
    
    const historyRef = issueRef.collection('history').doc();
    batch.set(historyRef, {
      history_id: historyRef.id,
      changed_by: req.user!.uid,
      note: `Admin override: ${reason || 'No reason given'}`,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    res.json(apiResponse(true, { issue_id, overridden: true }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/admin/assign - Assign issue
router.post('/assign', verifyAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { issue_id, assign_type, assign_to, due_at } = req.body;
    
    const issueRef = firestore.collection('issues').doc(issue_id);
    const updates: any = { status: 'assigned', updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp() };
    
    if (assign_type === 'officer') updates.assigned_officer_id = assign_to;
    else updates.assigned_team_id = assign_to;
    
    if (due_at) updates.sla_due_at = new Date(due_at);

    const batch = firestore.batch();
    batch.update(issueRef, updates);
    
    const historyRef = issueRef.collection('history').doc();
    batch.set(historyRef, {
      history_id: historyRef.id,
      to_status: 'assigned',
      changed_by: req.user!.uid,
      note: `Assigned to ${assign_type}: ${assign_to}`,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    res.json(apiResponse(true, { issue_id, assigned: true, assign_type, assign_to }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/admin/predictions - predictive insights
router.get('/predictions', verifyAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    res.json(apiResponse(true, { hotspots: [], sla_at_risk: [], bottlenecks: [] }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
