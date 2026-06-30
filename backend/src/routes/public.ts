import { Router, Request, Response } from 'express';
import { firestore } from '../config/firebase';

const router = Router();

function apiResponse(success: boolean, data: any = null, error: string | null = null) {
  return { success, data, error };
}

// Helper: Calculate hours difference
function hoursDiff(start: any, end: any): number {
  if (!start || !end) return 0;
  const s = start.toDate ? start.toDate() : new Date(start);
  const e = end.toDate ? end.toDate() : new Date(end);
  return (e.getTime() - s.getTime()) / 3600000;
}

// GET /api/public/dashboard - public-facing metrics
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore.collection('issues').get();
    
    let open_count = 0, resolved_count = 0, total_resolution_hours = 0, resolution_records = 0;
    const category_counts: Record<string, number> = {};
    const reporter_set = new Set<string>();
    
    let potholes_fixed = 0, leaks_fixed = 0, garbage_cleared = 0, lights_fixed = 0;
    const recently_resolved: any[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      const status = data.status || 'reported';
      const type = data.issue_type || 'other';

      if (!['closed', 'resolved'].includes(status)) {
        open_count++;
      } else {
        resolved_count++;
        if (data.resolved_at && data.created_at) {
          total_resolution_hours += hoursDiff(data.created_at, data.resolved_at);
          resolution_records++;
        }
        if (type === 'pothole') potholes_fixed++;
        if (type === 'water_leakage') leaks_fixed++;
        if (type === 'garbage_overflow') garbage_cleared++;
        if (type === 'broken_streetlight') lights_fixed++;

        recently_resolved.push({
          issue_id: doc.id,
          title: data.title,
          issue_type: type,
          severity: data.severity,
          resolved_at: data.resolved_at,
          address_text: data.address_text
        });
      }

      if (data.reporter_id && data.reporter_id !== 'anonymous') reporter_set.add(data.reporter_id);

      category_counts[type] = (category_counts[type] || 0) + 1;
    });

    const top_categories = Object.entries(category_counts)
      .map(([type, count]) => ({ issue_type: type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    recently_resolved.sort((a, b) => {
      const timeA = a.resolved_at?.toDate ? a.resolved_at.toDate().getTime() : 0;
      const timeB = b.resolved_at?.toDate ? b.resolved_at.toDate().getTime() : 0;
      return timeB - timeA;
    });

    res.json(apiResponse(true, {
      overview: {
        open_count,
        resolved_count,
        avg_resolution_hours: resolution_records > 0 ? total_resolution_hours / resolution_records : 0,
        unique_reporters: reporter_set.size
      },
      top_categories,
      ward_rankings: [], // Ward rankings skipped for NoSQL MVP
      recently_resolved: recently_resolved.slice(0, 5),
      impact: {
        potholes_fixed,
        leaks_fixed,
        garbage_cleared,
        lights_fixed,
        active_verifiers: 0
      },
    }));
  } catch (err: any) {
    console.error(err);
    res.status(500).json(apiResponse(false, null, err.message));
  }
});

export default router;
