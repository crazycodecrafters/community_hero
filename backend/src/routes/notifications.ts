import { Router, Request, Response } from 'express';
import { db } from '../config/db';
import { AuthRequest, verifyToken } from '../middleware/auth';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

// GET /api/notifications - Get user's notifications
router.get('/', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '30', offset = '0' } = req.query;
    const result = await db.query(
      `SELECT * FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user!.uid, parseInt(limit as string), parseInt(offset as string)]
    );
    const countResult = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user!.uid]
    );
    res.json(apiResponse(true, {
      notifications: result.rows,
      unread_count: parseInt(countResult.rows[0].count),
    }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false`,
      [req.user!.uid]
    );
    res.json(apiResponse(true, { count: parseInt(result.rows[0].count) }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/notifications/:id/read - Mark as read
router.post('/:id/read', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE notification_id = $1 AND user_id = $2`,
      [req.params.id, req.user!.uid]
    );
    res.json(apiResponse(true, { notification_id: req.params.id, is_read: true }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// POST /api/notifications/read-all - Mark all read
router.post('/read-all', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [req.user!.uid]
    );
    res.json(apiResponse(true, { marked: true }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
