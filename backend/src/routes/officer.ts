import { Router, Response } from 'express';
import { firebaseAdmin, firestore } from '../config/firebase';
import { AuthRequest, verifyOfficerOrAdmin } from '../middleware/auth';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null, meta: any = null) {
  const resp: any = { success, data, error };
  if (meta) resp.meta = meta;
  return resp;
}

// GET /api/officer/queue - Priority-sorted queue scoped to officer
router.get('/queue', verifyOfficerOrAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status, severity, category, sla_state, ward_id } = req.query;
    
    // In a NoSQL setup without department mapping in users, we just fetch all active issues 
    // and filter them based on query parameters for the MVP.
    // A proper implementation would fetch the officer's profile to get their assigned department_id.

    const snapshot = await firestore.collection('issues')
      .where('status', 'not-in', ['closed', 'resolved'])
      .get();
      
    let issues = snapshot.docs.map(doc => ({ issue_id: doc.id, ...doc.data() } as any));

    // Client-side filtering
    if (status) issues = issues.filter(i => i.status === status);
    if (severity) issues = issues.filter(i => i.severity === severity);
    if (category) issues = issues.filter(i => i.issue_type === category);
    if (ward_id) issues = issues.filter(i => i.ward_id === ward_id);
    
    const now = new Date().getTime();
    if (sla_state === 'breached') issues = issues.filter(i => i.sla_breach_notified === true);
    if (sla_state === 'at_risk') {
      issues = issues.filter(i => {
        if (!i.sla_due_at || i.sla_breach_notified) return false;
        const due = i.sla_due_at.toDate ? i.sla_due_at.toDate().getTime() : new Date(i.sla_due_at).getTime();
        return due < now + (8 * 3600000); // within 8 hours
      });
    }
    
    // Sort logic
    issues.sort((a, b) => {
      const sevA = a.severity === 'critical' ? 0 : a.severity === 'high' ? 1 : a.severity === 'medium' ? 2 : 3;
      const sevB = b.severity === 'critical' ? 0 : b.severity === 'high' ? 1 : b.severity === 'medium' ? 2 : 3;
      if (sevA !== sevB) return sevA - sevB;
      
      const dueA = a.sla_due_at ? (a.sla_due_at.toDate ? a.sla_due_at.toDate().getTime() : new Date(a.sla_due_at).getTime()) : Infinity;
      const dueB = b.sla_due_at ? (b.sla_due_at.toDate ? b.sla_due_at.toDate().getTime() : new Date(b.sla_due_at).getTime()) : Infinity;
      return dueA - dueB;
    });

    res.json(apiResponse(true, issues.slice(0, 100)));
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
    
    const issueRef = firestore.collection('issues').doc(issueId);
    const batch = firestore.batch();
    
    batch.update(issueRef, {
      assigned_officer_id: assignee_id || req.user!.uid,
      status: 'assigned',
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    
    const historyRef = issueRef.collection('history').doc();
    batch.set(historyRef, {
      history_id: historyRef.id,
      changed_by: req.user!.uid,
      from_status: 'verification',
      to_status: 'assigned',
      action: 'assigned',
      note: instructions || 'Issue assigned',
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
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
    
    const issueRef = firestore.collection('issues').doc(issueId);
    const issueDoc = await issueRef.get();
    if (!issueDoc.exists) return res.status(404).json(apiResponse(false, null, 'Issue not found'));
    
    const old_status = issueDoc.data()?.status;
    const batch = firestore.batch();
    
    const updates: any = { 
      status: new_status, 
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp() 
    };
    
    if (new_status === 'resolved') {
      updates.resolved_at = firebaseAdmin.firestore.FieldValue.serverTimestamp();
      if (proof_media_urls && proof_media_urls.length > 0) {
        updates.media = firebaseAdmin.firestore.FieldValue.arrayUnion(...proof_media_urls.map((url: string) => ({
          media_url: url,
          media_type: 'image',
          upload_type: 'officer_proof'
        })));
      }
    }
    
    batch.update(issueRef, updates);
    
    const historyRef = issueRef.collection('history').doc();
    batch.set(historyRef, {
      history_id: historyRef.id,
      changed_by: req.user!.uid,
      from_status: old_status,
      to_status: new_status,
      action: 'status_change',
      note: note || '',
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
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
    
    const issueRef = firestore.collection('issues').doc(issueId);
    const batch = firestore.batch();
    
    batch.update(issueRef, {
      [field]: new_value,
      updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    
    const historyRef = issueRef.collection('history').doc();
    batch.set(historyRef, {
      history_id: historyRef.id,
      changed_by: req.user!.uid,
      action: 'ai_override',
      note: JSON.stringify({ field, old_value, new_value, reason }),
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    
    await batch.commit();
    res.json(apiResponse(true, { message: 'Override applied successfully' }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
