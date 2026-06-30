import { db } from '../config/db';
import { v4 as uuidv4 } from 'uuid';

// SLA monitoring - checks every intervalMs for breached/at-risk SLAs
export function startSLAMonitoring(intervalMs = 60000) {
  console.log('⏱️  SLA monitoring started');

  const run = async () => {
    try {
      // Mark SLA breached
      const breachedResult = await db.query(`
        UPDATE issues
        SET sla_breach_notified = true, updated_at = NOW()
        WHERE status NOT IN ('resolved', 'closed')
          AND sla_due_at < NOW()
          AND sla_breach_notified = false
        RETURNING issue_id, title, assigned_officer_id, reporter_id
      `);

      for (const issue of breachedResult.rows) {
        // Notify officer
        if (issue.assigned_officer_id) {
          await db.query(
            `INSERT INTO notifications (notification_id, user_id, issue_id, title, body, notification_type, channel)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [
              uuidv4(), issue.assigned_officer_id, issue.issue_id,
              '🚨 SLA Breached',
              `Issue "${issue.title}" has exceeded its SLA deadline.`,
              'sla_breach', 'in_app',
            ]
          );
        }
      }

      if (breachedResult.rowCount && breachedResult.rowCount > 0) {
        console.log(`⚠️  SLA monitor: ${breachedResult.rowCount} issues now breached`);
      }

      // Mark 75% warning
      await db.query(`
        UPDATE issues
        SET sla_75_notified = true, updated_at = NOW()
        WHERE status NOT IN ('resolved', 'closed')
          AND sla_due_at IS NOT NULL
          AND sla_due_at > NOW()
          AND NOW() > sla_due_at - (sla_due_at - created_at) * 0.25
          AND sla_75_notified = false
      `);

      // Auto-close issues resolved 7+ days ago with no reopen
      await db.query(`
        UPDATE issues
        SET status = 'closed', closed_at = NOW(), updated_at = NOW()
        WHERE status = 'resolved'
          AND resolved_at < NOW() - INTERVAL '7 days'
          AND closed_at IS NULL
      `);

      // Generate cluster insights
      await generateClusterInsights();
    } catch (err) {
      console.error('SLA monitor error:', err);
    }
  };

  // Run immediately, then on interval
  run();
  setInterval(run, intervalMs);
}

async function generateClusterInsights() {
  try {
    // Find clusters: 3+ issues of same type within 200m in last 90 days
    const clusters = await db.query(`
      SELECT
        issue_type,
        ST_Y(ST_Centroid(ST_Collect(geometry::geometry))) as center_lat,
        ST_X(ST_Centroid(ST_Collect(geometry::geometry))) as center_lng,
        COUNT(*) as issue_count,
        AVG(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) as avg_severity_score
      FROM issues
      WHERE created_at > NOW() - INTERVAL '90 days'
        AND status NOT IN ('closed')
        AND geometry IS NOT NULL
      GROUP BY issue_type,
        ST_SnapToGrid(geometry::geometry, 0.002)
      HAVING COUNT(*) >= 3
      LIMIT 50
    `);

    if (clusters.rows.length > 0) {
      // Clear old insights
      await db.query(`DELETE FROM cluster_insights WHERE generated_at < NOW() - INTERVAL '24 hours'`);

      for (const cluster of clusters.rows) {
        const recurrenceScore = Math.min(1.0, cluster.issue_count / 10);
        const action = cluster.avg_severity_score >= 3
          ? `Urgent: Schedule immediate repair team dispatch for ${cluster.issue_type.replace(/_/g, ' ')} cluster`
          : `Schedule preventive maintenance for recurring ${cluster.issue_type.replace(/_/g, ' ')} hotspot`;

        await db.query(
          `INSERT INTO cluster_insights
           (cluster_id, center_latitude, center_longitude, issue_type, issue_count, average_severity_score, recurrence_prediction_score, recommended_action)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uuidv4(), cluster.center_lat, cluster.center_lng,
            cluster.issue_type, cluster.issue_count,
            parseFloat(cluster.avg_severity_score), recurrenceScore, action,
          ]
        );
      }
    }
  } catch (err) {
    // Cluster generation is non-critical
    console.error('Cluster generation error:', err);
  }
}
