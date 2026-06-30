import { Router, Request, Response } from 'express';
import { firebaseAuth, firebaseAdmin } from '../config/firebase';
import { db } from '../config/db';
import { AuthRequest, verifyToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/register - Register or sync user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { idToken, name, phone, email, role = 'citizen' } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, error: 'ID token required' });
    }

    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Check if user exists in PG
    const userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [uid]);
    if (userResult.rows.length > 0) {
      return res.json({ success: true, data: userResult.rows[0] });
    }

    // Set custom claim for role
    // We no longer set custom claims in Firebase because we rely on Postgres
    // for role checking. This avoids ENOTFOUND metadata.google.internal errors.

    const userName = name || decoded.name || 'Citizen';
    const userPhone = phone || decoded.phone_number || null;
    const userEmail = email || decoded.email || null;
    const userAvatar = decoded.picture || null;

    const insertResult = await db.query(`
      INSERT INTO users (
        google_id, name, phone, email, role, avatar_url, badge_ids, xp_points
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [uid, userName, userPhone, userEmail, role, userAvatar, ['first_report'], 25]);

    const newUser = insertResult.rows[0];

    // Dual-write to Firestore
    try {
      await firebaseAdmin.firestore().collection('users').doc(uid).set({
        user_id: newUser.user_id,
        name: userName,
        email: userEmail,
        role: role,
        xp_points: 25,
        created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (fsErr) {
      console.error('Firestore sync error:', fsErr);
    }

    return res.status(201).json({ success: true, data: newUser });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/login - Verify token and return user data
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ success: false, error: 'ID token required' });

    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [uid]);

    if (userResult.rows.length === 0) {
      // Auto-heal: If user exists in Firebase but not in Postgres, register them now
      const userName = decoded.name || 'Citizen';
      const userPhone = decoded.phone_number || null;
      const userEmail = decoded.email || null;
      const userAvatar = decoded.picture || null;
      const role = (decoded.role as string) || 'citizen';

      const insertResult = await db.query(`
        INSERT INTO users (
          google_id, name, phone, email, role, avatar_url, badge_ids, xp_points
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [uid, userName, userPhone, userEmail, role, userAvatar, ['first_report'], 25]);
      
      userResult = { rows: [insertResult.rows[0]], command: 'INSERT', rowCount: 1, oid: 0, fields: [] };
    }

    const user = userResult.rows[0];
    
    // Auto-fix demo account roles if they were previously created as citizens
    if (user.email === 'admin@communityhero.dev' && user.role !== 'admin') {
      await db.query("UPDATE users SET role = 'admin' WHERE user_id = $1", [user.user_id]);
      user.role = 'admin';
    } else if (user.email === 'officer@communityhero.dev' && user.role !== 'officer') {
      await db.query("UPDATE users SET role = 'officer' WHERE user_id = $1", [user.user_id]);
      user.role = 'officer';
    }

    await db.query('UPDATE users SET last_login_at = NOW() WHERE google_id = $1', [uid]);

    return res.json({ success: true, data: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await db.query('SELECT * FROM users WHERE user_id = $1', [req.user!.uid]);
    if (userResult.rows.length === 0) return res.status(404).json({ success: false, error: 'User not found' });

    return res.json({ success: true, data: userResult.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/auth/profile - Update profile
router.put('/profile', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, avatar_url } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name) { updates.push(`name = $${idx++}`); values.push(name); }
    if (phone) { updates.push(`phone = $${idx++}`); values.push(phone); }
    if (avatar_url) { updates.push(`avatar_url = $${idx++}`); values.push(avatar_url); }

    if (updates.length === 0) {
      return res.json({ success: true, message: 'No changes provided' });
    }

    values.push(req.user!.uid);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE user_id = $${idx} RETURNING *`;
    const result = await db.query(query, values);

    return res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/set-role - Admin sets user role
router.post('/set-role', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { uid, role } = req.body;
    if (!['citizen', 'moderator', 'officer', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
    // We no longer set custom claims in Firebase because we rely on Postgres
    // for role checking. This avoids ENOTFOUND metadata.google.internal errors.
    await db.query('UPDATE users SET role = $1 WHERE user_id = $2', [role, uid]);
    return res.json({ success: true, data: { uid, role } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
