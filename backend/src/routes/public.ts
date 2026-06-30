import { Router, Request, Response } from 'express';
import { db } from '../config/db';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

// GET /api/public/dashboard - public-facing metrics
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [overview, topCategories, wardRankings, recentResolved, impactStats] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('closed','resolved')) as open_count,
          COUNT(*) FILTER (WHERE status IN ('resolved','closed')) as resolved_count,
          AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours,
          COUNT(DISTINCT reporter_id) FILTER (WHERE reporter_id IS NOT NULL) as unique_reporters
        FROM issues
      `),
      db.query(`
        SELECT issue_type, COUNT(*) as count
        FROM issues
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY issue_type ORDER BY count DESC LIMIT 5
      `),
      db.query(`
        SELECT w.name as ward_name,
          COUNT(i.issue_id) as total,
          COUNT(i.issue_id) FILTER (WHERE i.status IN ('resolved','closed')) as resolved,
          ROUND(100.0 * COUNT(i.issue_id) FILTER (WHERE i.status IN ('resolved','closed')) / NULLIF(COUNT(i.issue_id), 0), 1) as resolution_rate
        FROM wards w LEFT JOIN issues i ON w.ward_id = i.ward_id
        GROUP BY w.ward_id, w.name
        HAVING COUNT(i.issue_id) > 0
        ORDER BY resolution_rate DESC NULLS LAST LIMIT 5
      `),
      db.query(`
        SELECT issue_id, title, issue_type, severity, resolved_at, address_text
        FROM issues WHERE status = 'resolved'
        ORDER BY resolved_at DESC LIMIT 5
      `),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE issue_type = 'pothole' AND status IN ('resolved','closed')) as potholes_fixed,
          COUNT(*) FILTER (WHERE issue_type = 'water_leakage' AND status IN ('resolved','closed')) as leaks_fixed,
          COUNT(*) FILTER (WHERE issue_type = 'garbage_overflow' AND status IN ('resolved','closed')) as garbage_cleared,
          COUNT(*) FILTER (WHERE issue_type = 'broken_streetlight' AND status IN ('resolved','closed')) as lights_fixed,
          COUNT(DISTINCT v.citizen_id) as active_verifiers
        FROM issues LEFT JOIN verifications v ON issues.issue_id = v.issue_id
      `),
    ]);

    res.json(apiResponse(true, {
      overview: overview.rows[0],
      top_categories: topCategories.rows,
      ward_rankings: wardRankings.rows,
      recently_resolved: recentResolved.rows,
      impact: impactStats.rows[0],
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
