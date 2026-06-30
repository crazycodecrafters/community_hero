import { Router, Request, Response } from 'express';
import { firestore } from '../config/firebase';
import { AuthRequest, verifyToken } from '../middleware/auth';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

const BADGES = [
  { badge_id: 'first_report', name: 'First Reporter', description: 'Reported first issue', xp_reward: 50, icon_name: 'award' },
  { badge_id: 'civic_hero', name: 'Civic Hero', description: 'Resolved 10 issues', xp_reward: 200, icon_name: 'star' },
  { badge_id: 'verifier', name: 'Truth Seeker', description: 'Verified 5 issues', xp_reward: 100, icon_name: 'check-circle' }
];

// GET /api/gamification/profile - user's XP, badges, streaks
router.get('/profile', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const userDoc = await firestore.collection('users').doc(req.user!.uid).get();
    if (!userDoc.exists) return res.status(404).json(apiResponse(false, null, 'User not found'));
    
    const user = userDoc.data() as any;
    const userBadgeIds: string[] = user.badge_ids || [];
    const userBadges = BADGES.filter(b => userBadgeIds.includes(b.badge_id));

    // Leaderboard rank approximation
    const snapshot = await firestore.collection('users')
      .where('xp_points', '>', user.xp_points || 0)
      .get();
    const rank = snapshot.size + 1;

    res.json(apiResponse(true, {
      xp_points: user.xp_points || 0,
      streak_days: user.streak_days || 0,
      trust_score: user.trust_score || 1.0,
      false_report_count: user.false_report_count || 0,
      badges: userBadges,
      badge_count: userBadges.length,
      rank: rank,
    }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/leaderboard - top contributors
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { limit = '20' } = req.query;
    
    // Firestore composite query
    const snapshot = await firestore.collection('users')
      .orderBy('xp_points', 'desc')
      .limit(parseInt(limit as string))
      .get();

    const users = snapshot.docs.map(doc => ({
      user_id: doc.id,
      name: doc.data().name,
      xp_points: doc.data().xp_points || 0,
      streak_days: doc.data().streak_days || 0,
      trust_score: doc.data().trust_score || 1.0,
      badge_ids: doc.data().badge_ids || [],
      avatar_url: doc.data().avatar_url,
      role: doc.data().role,
      ward_id: doc.data().ward_id
    }));

    res.json(apiResponse(true, users));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/badges - all available badges
router.get('/badges', async (_req: Request, res: Response) => {
  try {
    res.json(apiResponse(true, BADGES));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/challenges - active weekly challenges
router.get('/challenges', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    // Return empty challenges for NoSQL MVP
    res.json(apiResponse(true, []));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/impact - civic impact metrics
router.get('/impact', async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore.collection('issues')
      .where('status', 'in', ['resolved', 'closed'])
      .get();

    let total_resolved = 0;
    let potholes_fixed = 0;
    let leaks_fixed = 0;
    let garbage_cleared = 0;
    let lights_fixed = 0;

    snapshot.forEach(doc => {
      total_resolved++;
      const type = doc.data().issue_type;
      if (type === 'pothole') potholes_fixed++;
      else if (type === 'water_leakage') leaks_fixed++;
      else if (type === 'garbage_overflow') garbage_cleared++;
      else if (type === 'broken_streetlight') lights_fixed++;
    });

    res.json(apiResponse(true, {
      total_resolved,
      potholes_fixed,
      leaks_fixed,
      garbage_cleared,
      lights_fixed,
      active_citizens: 0, // Simplified for MVP
      active_verifiers: 0
    }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
