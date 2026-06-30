import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../config/firebase';
import { firestore } from '../config/firebase';
export interface AuthRequest extends Request {
  user?: {
    uid: string;
    firebaseUid?: string;
    email?: string;
    phone?: string;
    name?: string;
    role?: string;
  };
  userData?: any;
}

export async function verifyToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    
    // Fetch role from Firestore
    let internalRole = decoded.role as string || 'citizen';
    try {
      const userDoc = await firestore.collection('users').doc(decoded.uid).get();
      if (userDoc.exists) {
        internalRole = userDoc.data()?.role || 'citizen';
      }
    } catch (e) {
      console.error('Failed to fetch user from Firestore', e);
    }

    req.user = {
      uid: decoded.uid,
      firebaseUid: decoded.uid,
      email: decoded.email,
      phone: decoded.phone_number,
      name: decoded.name,
      role: internalRole,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function verifyAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  verifyToken(req, res, () => {
    if (!req.user?.uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
  });
}

export function verifyOfficerOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  verifyToken(req, res, () => {
    if (!req.user?.uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (req.user.role !== 'admin' && req.user.role !== 'officer' && req.user.role !== 'moderator') {
      return res.status(403).json({ success: false, error: 'Officer or admin access required' });
    }
    next();
  });
}
