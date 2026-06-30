import { Router, Request, Response } from 'express';
import { firebaseAdmin, firestore } from '../config/firebase';
import { AuthRequest, verifyToken } from '../middleware/auth';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

// GET /api/notifications - Get user's notifications
router.get('/', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '30' } = req.query;
    
    const snapshot = await firestore.collection('notifications')
      .where('user_id', '==', req.user!.uid)
      .orderBy('created_at', 'desc')
      .limit(parseInt(limit as string))
      .get();
      
    const notifications = snapshot.docs.map(doc => ({ notification_id: doc.id, ...doc.data() }));
    const unread_count = notifications.filter((n: any) => !n.is_read).length;

    res.json(apiResponse(true, { notifications, unread_count }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await firestore.collection('notifications')
      .where('user_id', '==', req.user!.uid)
      .where('is_read', '==', false)
      .get();
      
    res.json(apiResponse(true, { count: snapshot.size }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/notifications/:id/read - Mark as read
router.post('/:id/read', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    await firestore.collection('notifications').doc(req.params.id).update({
      is_read: true
    });
    res.json(apiResponse(true, { notification_id: req.params.id, is_read: true }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/notifications/read-all - Mark all read
router.post('/read-all', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await firestore.collection('notifications')
      .where('user_id', '==', req.user!.uid)
      .where('is_read', '==', false)
      .get();
      
    const batch = firestore.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { is_read: true });
    });
    await batch.commit();

    res.json(apiResponse(true, { marked: true }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
