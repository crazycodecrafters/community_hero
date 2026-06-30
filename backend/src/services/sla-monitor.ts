import { firestore, firebaseAdmin } from '../config/firebase';

// Helper: Calculate distance in meters using Haversine
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function startSLAMonitoring(intervalMs = 60000) {
  console.log('⏱️  SLA monitoring started');

  const run = async () => {
    try {
      const now = new Date();
      const snapshot = await firestore.collection('issues')
        .where('status', 'not-in', ['closed'])
        .get();

      const batch = firestore.batch();
      let operationsCount = 0;
      let breachedCount = 0;

      const issues: any[] = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        issues.push({ id: doc.id, ...data });

        if (data.status === 'resolved') {
          // Auto-close issues resolved 7+ days ago
          if (data.resolved_at) {
            const resolvedTime = data.resolved_at.toDate ? data.resolved_at.toDate().getTime() : new Date(data.resolved_at).getTime();
            if (now.getTime() - resolvedTime > 7 * 24 * 3600000) {
              batch.update(doc.ref, {
                status: 'closed',
                closed_at: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
                updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
              });
              operationsCount++;
            }
          }
        } else {
          // SLA Checks
          if (data.sla_due_at) {
            const dueTime = data.sla_due_at.toDate ? data.sla_due_at.toDate().getTime() : new Date(data.sla_due_at).getTime();
            
            if (now.getTime() > dueTime && !data.sla_breach_notified) {
              batch.update(doc.ref, {
                sla_breach_notified: true,
                updated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
              });
              
              if (data.assigned_officer_id) {
                const notifRef = firestore.collection('notifications').doc();
                batch.set(notifRef, {
                  notification_id: notifRef.id,
                  user_id: data.assigned_officer_id,
                  issue_id: doc.id,
                  title: '🚨 SLA Breached',
                  body: `Issue "${data.title}" has exceeded its SLA deadline.`,
                  notification_type: 'sla_breach',
                  channel: 'in_app',
                  is_read: false,
                  created_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
                });
              }
              breachedCount++;
              operationsCount += 2;
            }
          }
        }
      });

      if (operationsCount > 0) {
        await batch.commit();
      }
      
      if (breachedCount > 0) {
        console.log(`⚠️  SLA monitor: ${breachedCount} issues now breached`);
      }

      await generateClusterInsights(issues);
    } catch (err) {
      console.error('SLA monitor error:', err);
    }
  };

  run();
  setInterval(run, intervalMs);
}

async function generateClusterInsights(issues: any[]) {
  try {
    const activeIssues = issues.filter(i => 
      !['closed'].includes(i.status) && i.latitude && i.longitude
    );

    // Naive clustering: group by issue_type, then find nearby points (radius 200m)
    const processed = new Set<string>();
    const clusters: any[] = [];

    for (const issue of activeIssues) {
      if (processed.has(issue.id)) continue;
      
      const clusterMembers = activeIssues.filter(other => 
        !processed.has(other.id) &&
        other.issue_type === issue.issue_type &&
        getDistanceMeters(issue.latitude, issue.longitude, other.latitude, other.longitude) <= 200
      );

      if (clusterMembers.length >= 3) {
        clusterMembers.forEach(m => processed.add(m.id));
        
        const sumLat = clusterMembers.reduce((sum, m) => sum + m.latitude, 0);
        const sumLng = clusterMembers.reduce((sum, m) => sum + m.longitude, 0);
        
        let sevSum = 0;
        clusterMembers.forEach(m => {
          sevSum += m.severity === 'critical' ? 4 : m.severity === 'high' ? 3 : m.severity === 'medium' ? 2 : 1;
        });

        clusters.push({
          cluster_id: firestore.collection('cluster_insights').doc().id,
          issue_type: issue.issue_type,
          center_lat: sumLat / clusterMembers.length,
          center_lng: sumLng / clusterMembers.length,
          issue_count: clusterMembers.length,
          avg_severity_score: sevSum / clusterMembers.length,
          generated_at: firebaseAdmin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    if (clusters.length > 0) {
      // Clear old insights
      const oldSnap = await firestore.collection('cluster_insights').get();
      const batch = firestore.batch();
      oldSnap.forEach(doc => batch.delete(doc.ref));
      
      clusters.forEach(c => {
        const action = c.avg_severity_score >= 3
          ? `Urgent: Schedule immediate repair team dispatch for ${c.issue_type.replace(/_/g, ' ')} cluster`
          : `Monitor: Increase verification checks for ${c.issue_type.replace(/_/g, ' ')} cluster`;
          
        c.recommended_action = action;
        c.recurrence_score = Math.min(1.0, c.issue_count / 10);
        batch.set(firestore.collection('cluster_insights').doc(c.cluster_id), c);
      });
      
      await batch.commit();
    }
  } catch (err) {
    console.error('Cluster insight generation error:', err);
  }
}
