import { Router, Request, Response } from 'express';
import { db } from '../config/db';
import { AuthRequest, verifyToken } from '../middleware/auth';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

// GET /api/gamification/profile - user's XP, badges, streaks
router.get('/profile', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const userResult = await db.query(
      `SELECT xp_points, streak_days, trust_score, badge_ids, false_report_count
       FROM users WHERE user_id = $1`,
      [req.user!.uid]
    );
    if (userResult.rows.length === 0) return res.status(404).json(apiResponse(false, null, 'User not found'));
    const user = userResult.rows[0];

    const badgesResult = await db.query(`SELECT * FROM badges ORDER BY xp_reward DESC`);
    const allBadges = badgesResult.rows;
    const userBadgeIds: string[] = user.badge_ids || [];
    const userBadges = allBadges.filter(b => userBadgeIds.includes(b.badge_id) || userBadgeIds.includes(b.icon_name));

    // Leaderboard rank
    const rankResult = await db.query(
      `SELECT COUNT(*) + 1 as rank FROM users WHERE xp_points > $1`,
      [user.xp_points]
    );

    res.json(apiResponse(true, {
      xp_points: user.xp_points || 0,
      streak_days: user.streak_days || 0,
      trust_score: user.trust_score || 1.0,
      false_report_count: user.false_report_count || 0,
      badges: userBadges,
      badge_count: userBadges.length,
      rank: parseInt(rankResult.rows[0].rank),
    }));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/leaderboard - top contributors
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const { ward_id, limit = '20' } = req.query;
    const conditions: string[] = ['xp_points > 0'];
    const values: any[] = [];
    let idx = 1;
    if (ward_id) { conditions.push(`ward_id = $${idx++}`); values.push(ward_id); }
    values.push(parseInt(limit as string));

    const result = await db.query(
      `SELECT user_id, name, xp_points, streak_days, trust_score, badge_ids, avatar_url, role, ward_id
       FROM users WHERE ${conditions.join(' AND ')}
       ORDER BY xp_points DESC LIMIT $${idx}`,
      values
    );
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/badges - all available badges
router.get('/badges', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`SELECT * FROM badges ORDER BY xp_reward DESC`);
    res.json(apiResponse(true, result.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/challenges - active weekly challenges
router.get('/challenges', verifyToken, async (req: AuthRequest, res: Response) => {
  try {
    const challengesResult = await db.query(
      `SELECT wc.*,
        COALESCE(ucp.current_count, 0) as user_progress,
        COALESCE(ucp.is_completed, false) as user_completed
       FROM weekly_challenges wc
       LEFT JOIN user_challenge_progress ucp ON wc.challenge_id = ucp.challenge_id AND ucp.user_id = $1
       WHERE wc.starts_at <= NOW() AND wc.ends_at >= NOW()
       ORDER BY wc.xp_multiplier DESC`,
      [req.user!.uid]
    );
    res.json(apiResponse(true, challengesResult.rows));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

// GET /api/gamification/impact - civic impact metrics
router.get('/impact', async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as total_resolved,
        COUNT(*) FILTER (WHERE issue_type = 'pothole' AND status IN ('resolved','closed')) as potholes_fixed,
        COUNT(*) FILTER (WHERE issue_type = 'water_leakage' AND status IN ('resolved','closed')) as leaks_fixed,
        COUNT(*) FILTER (WHERE issue_type = 'garbage_overflow' AND status IN ('resolved','closed')) as garbage_cleared,
        COUNT(*) FILTER (WHERE issue_type = 'broken_streetlight' AND status IN ('resolved','closed')) as lights_fixed,
        COUNT(DISTINCT reporter_id) FILTER (WHERE reporter_id IS NOT NULL) as active_citizens,
        COUNT(DISTINCT v.citizen_id) as active_verifiers
      FROM issues
      LEFT JOIN verifications v ON issues.issue_id = v.issue_id
    `);
    res.json(apiResponse(true, result.rows[0]));
  } catch (err: any) {
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
