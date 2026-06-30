import { Router, Request, Response } from 'express';
import { firebaseAuth, firebaseAdmin, firestore } from '../config/firebase';
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

    // Check if user exists in Firestore
    const userDocRef = firestore.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      return res.json({ success: true, data: userDoc.data() });
    }

    const userName = name || decoded.name || 'Citizen';
    const userPhone = phone || decoded.phone_number || null;
    const userEmail = email || decoded.email || null;
    const userAvatar = decoded.picture || null;

    const newUser = {
      user_id: uid,
      google_id: uid, // kept for backwards compatibility in API responses
      name: userName,
      phone: userPhone,
      email: userEmail,
      role: role,
      avatar_url: userAvatar,
      badge_ids: ['first_report'],
      xp_points: 25,
      created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      last_login_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
    };

    await userDocRef.set(newUser);

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

    const userDocRef = firestore.collection('users').doc(uid);
    let userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      // Auto-heal: Register them now
      const userName = decoded.name || 'Citizen';
      const userPhone = decoded.phone_number || null;
      const userEmail = decoded.email || null;
      const userAvatar = decoded.picture || null;
      const role = (decoded.role as string) || 'citizen';

      const newUser = {
        user_id: uid,
        google_id: uid,
        name: userName,
        phone: userPhone,
        email: userEmail,
        role: role,
        avatar_url: userAvatar,
        badge_ids: ['first_report'],
        xp_points: 25,
        created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
        last_login_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      };
      
      await userDocRef.set(newUser);
      userDoc = await userDocRef.get();
    }

    let user = userDoc.data() as any;
    
    // Auto-fix demo account roles
    let needsUpdate = false;
    if (user.email === 'admin@communityhero.dev' && user.role !== 'admin') {
      user.role = 'admin';
      needsUpdate = true;
    } else if (user.email === 'officer@communityhero.dev' && user.role !== 'officer') {
      user.role = 'officer';
      needsUpdate = true;
    }

    if (needsUpdate) {
      await userDocRef.update({ role: user.role, last_login_at: firebaseAdmin.firestore.FieldValue.serverTimestamp() });
    } else {
      await userDocRef.update({ last_login_at: firebaseAdmin.firestore.FieldValue.serverTimestamp() });
    }

    return res.json({ success: true, data: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const userDoc = await firestore.collection('users').doc(req.user!.uid).get();
    if (!userDoc.exists) return res.status(404).json({ success: false, error: 'User not found' });

    return res.json({ success: true, data: userDoc.data() });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/auth/profile - Update profile
router.put('/profile', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, avatar_url } = req.body;
    const updates: any = {};
    
    if (name) updates.name = name;
    if (phone) updates.phone = phone;
    if (avatar_url) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      return res.json({ success: true, message: 'No changes provided' });
    }

    const userDocRef = firestore.collection('users').doc(req.user!.uid);
    await userDocRef.update(updates);
    const updatedDoc = await userDocRef.get();

    return res.json({ success: true, data: updatedDoc.data() });
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
    
    await firestore.collection('users').doc(uid).update({ role });
    return res.json({ success: true, data: { uid, role } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
