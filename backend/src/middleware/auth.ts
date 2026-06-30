import { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '../config/firebase';
import { db } from '../config/db';

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
    
    // Map Firebase UID to internal Postgres UUID
    let internalUid = decoded.uid;
    let internalRole = decoded.role as string || 'citizen';
    try {
      const userRes = await db.query('SELECT user_id, role FROM users WHERE google_id = $1', [decoded.uid]);
      if (userRes.rows.length > 0) {
        internalUid = userRes.rows[0].user_id;
        internalRole = userRes.rows[0].role;
      }
    } catch (e) {
      console.error('Failed to map Firebase UID to Postgres UUID', e);
    }

    req.user = {
      uid: internalUid,
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
