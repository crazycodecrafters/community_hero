import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Icon } from 'leaflet';
import { MapPin, ArrowLeft, Clock, Shield, ThumbsUp, ThumbsDown, Copy, ArrowClockwise } from 'phosphor-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { getIssue, verifyIssue, updateIssueStatus, reopenIssue } from '../services/issues';
import { getIdToken } from '../services/auth';
import { useStore } from '../store';
import { Issue, IssueStatus, CATEGORY_LABELS, CATEGORY_ICONS, SEVERITY_COLORS, STATUS_LABELS } from '../types';
import { SeverityBadge } from '../components/ui/SeverityBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { NeuCard } from '../components/ui/NeuCard';
import { NeuButton } from '../components/ui/NeuButton';
import { XpPop } from '../components/ui/XpPop';
import { NeuInput } from '../components/ui/NeuInput';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const markerIcon = new Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const statusFlow: IssueStatus[] = ['reported', 'ai_triaged', 'verification', 'assigned', 'in_progress', 'resolved', 'closed'];

function computeSlaTime(slaDueAt: number): { label: string; urgent: boolean } {
  const now = Date.now();
  const diff = slaDueAt - now;
  if (diff <= 0) return { label: 'Overdue', urgent: true };
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return { label: `${hours}h ${minutes}m remaining`, urgent: hours < 4 };
}

export const IssueDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, addXp } = useStore();

  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [showXp, setShowXp] = useState(false);
  const [xpAmount, setXpAmount] = useState(0);
  const [slaLabel, setSlaLabel] = useState('');
  const [slaUrgent, setSlaUrgent] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [merging, setMerging] = useState(false);
  const [targetIssueId, setTargetIssueId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [proofMediaUrl, setProofMediaUrl] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getIssue(id)
      .then((data) => {
        setIssue(data);
        if (data.sla_due_at) {
          const sla = computeSlaTime(data.sla_due_at);
          setSlaLabel(sla.label);
          setSlaUrgent(sla.urgent);
        }
      })
      .catch((err) => {
        toast.error(err.message);
        navigate(-1);
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    if (!issue?.sla_due_at) return;
    const interval = setInterval(() => {
      const sla = computeSlaTime(issue.sla_due_at!);
      setSlaLabel(sla.label);
      setSlaUrgent(sla.urgent);
    }, 60000);
    return () => clearInterval(interval);
  }, [issue?.sla_due_at]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary-DEFAULT border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!issue) return null;

  const isReporter = user?.user_id === issue.reporter_id;
  const isOfficerOrAdmin = user?.role === 'officer' || user?.role === 'admin' || user?.role === 'moderator';
  const canVerify = !isReporter && issue.status === 'verification';
  const canReopen = isReporter && (issue.status === 'resolved' || issue.status === 'closed');

  const handleVerify = async (action: string) => {
    if (!id) return;
    setVerifying(true);
    try {
      await verifyIssue(id, action);
      const updated = await getIssue(id);
      setIssue(updated);
      setXpAmount(10);
      setShowXp(true);
      addXp(10);
      toast.success('Verification submitted');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleStatusUpdate = async (newStatus: IssueStatus) => {
    if (!user || (user.role !== 'admin' && user.role !== 'officer' && user.role !== 'moderator')) return;
    if (newStatus === 'resolved' && !proofMediaUrl) {
      toast.error('Proof media URL is required to resolve this issue');
      return;
    }
    setUpdatingStatus(true);
    try {
      // If the backend has officer endpoints, we could call that, but fallback to general issue update
      const token = await getIdToken();
      let res;
      if (user.role === 'officer' || user.role === 'admin') {
        res = await fetch(`${API_URL}/officer/issues/${id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ new_status: newStatus, proof_media_urls: proofMediaUrl ? [proofMediaUrl] : [] })
        });
      } else {
        await updateIssueStatus(id!, newStatus);
      }
      
      if (res && !(await res.clone().json()).success) throw new Error((await res.json()).error);

      setIssue((prev) => (prev ? { ...prev, status: newStatus } : null));
      toast.success('Status updated successfully');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!user) return;
    setAssigning(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_URL}/officer/issues/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ assignee_id: user.user_id })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Assigned to you');
      setIssue(prev => prev ? { ...prev, assigned_officer_id: user.user_id, status: 'assigned' } : null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleMerge = async () => {
    if (!user || user.role !== 'admin' || !targetIssueId) return;
    setMerging(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`${API_URL}/admin/issues/${id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_issue_id: targetIssueId, reason: mergeReason })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('Issue merged successfully');
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMerging(false);
    }
  };

  const handleReopen = async () => {
    if (!id) return;
    setReopening(true);
    try {
      await reopenIssue(id, 'Issue not fully resolved');
      const updated = await getIssue(id);
      setIssue(updated);
      toast.success('Issue reopened');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setReopening(false);
    }
  };

  const currentStatusIndex = statusFlow.indexOf(issue.status);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl mx-auto px-4 py-6 space-y-5"
    >
      <XpPop points={xpAmount} trigger={showXp} />

      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="neu-button p-2.5 rounded-neup">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-neu-800 truncate">{issue.title}</h1>
      </motion.div>

      <motion.div variants={itemVariants}>
        <NeuCard>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="text-2xl">{CATEGORY_ICONS[issue.issue_type]}</span>
            <span className="font-medium text-neu-700">{CATEGORY_LABELS[issue.issue_type]}</span>
            <SeverityBadge severity={issue.severity} />
            <StatusBadge status={issue.status} />
          </div>

          {issue.sla_due_at && (
            <div className={`flex items-center gap-2 text-sm font-semibold ${slaUrgent ? 'text-red-500' : 'text-neu-500'}`}>
              <Clock size={16} weight="fill" />
              <span>SLA: {slaLabel}</span>
            </div>
          )}

          {issue.description && (
            <p className="text-neu-600 mt-3 leading-relaxed">{issue.description}</p>
          )}

          <div className="flex items-center gap-2 mt-3 text-xs text-neu-400">
            <MapPin size={14} />
            <span>{issue.address_text || `${issue.latitude.toFixed(4)}, ${issue.longitude.toFixed(4)}`}</span>
          </div>
        </NeuCard>
      </motion.div>

      {issue.ai_summary && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-2 flex items-center gap-2">
              <Shield size={18} weight="fill" className="text-purple-500" />
              AI Analysis
            </h3>
            <p className="text-neu-600 text-sm leading-relaxed mb-3">{issue.ai_summary}</p>
            {issue.ai_confidence !== undefined && (
              <div>
                <div className="flex justify-between text-xs text-neu-500 mb-1">
                  <span>Confidence</span>
                  <span>{Math.round(issue.ai_confidence * 100)}%</span>
                </div>
                <div className="h-2 bg-neu-200 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${issue.ai_confidence * 100}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  />
                </div>
              </div>
            )}
          </NeuCard>
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <NeuCard padded={false}>
          <div className="p-4 sm:p-6">
            <h3 className="font-semibold text-neu-700 mb-4">Timeline</h3>
          </div>
          {issue.history && issue.history.length > 0 ? (
            <div className="px-4 sm:px-6 pb-6">
              {issue.history.map((h, i) => (
                <div key={h.history_id} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full border-2 ${i === issue.history!.length - 1 ? 'bg-primary-DEFAULT border-primary-DEFAULT' : 'bg-neu-50 border-neu-300'}`} />
                    {i < issue.history!.length - 1 && <div className="w-0.5 flex-1 bg-neu-200 mt-1" />}
                  </div>
                  <div className="flex-1 -mt-0.5">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={h.to_status as IssueStatus} />
                      <span className="text-xs text-neu-400">
                        {formatDistanceToNow(h.created_at, { addSuffix: true })}
                      </span>
                    </div>
                    {h.note && <p className="text-sm text-neu-500 mt-1">{h.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 sm:px-6 pb-6 text-sm text-neu-400">No history recorded yet</div>
          )}
        </NeuCard>
      </motion.div>

      <motion.div variants={itemVariants} className="h-56 rounded-neup overflow-hidden neu-card">
        <MapContainer
          center={[issue.latitude, issue.longitude]}
          zoom={15}
          scrollWheelZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[issue.latitude, issue.longitude]} icon={markerIcon}>
            <Popup>
              <span className="font-medium">{issue.title}</span>
            </Popup>
          </Marker>
        </MapContainer>
      </motion.div>

      {(issue as any).proof_media_url && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-3">Resolution Proof</h3>
            {(issue as any).proof_media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
              <img
                src={(issue as any).proof_media_url}
                alt="Resolution proof"
                className="w-full rounded-neup_sm object-cover max-h-64"
              />
            ) : (
              <a
                href={(issue as any).proof_media_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-DEFAULT underline"
              >
                View proof media
              </a>
            )}
          </NeuCard>
        </motion.div>
      )}

      {canVerify && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-3">Community Verification</h3>
            <div className="flex flex-wrap gap-2">
              <NeuButton
                variant="success"
                size="sm"
                icon={<ThumbsUp size={16} weight="fill" />}
                onClick={() => handleVerify('confirm')}
                loading={verifying}
              >
                Confirm
              </NeuButton>
              <NeuButton
                variant="danger"
                size="sm"
                icon={<ThumbsDown size={16} weight="fill" />}
                onClick={() => handleVerify('dispute')}
                loading={verifying}
              >
                Dispute
              </NeuButton>
              <NeuButton
                variant="default"
                size="sm"
                icon={<Copy size={16} />}
                onClick={() => handleVerify('corroborate')}
                loading={verifying}
              >
                Corroborate
              </NeuButton>
            </div>
            {issue.verification_score > 0 && (
              <p className="text-sm text-neu-500 mt-2">
                Verification score: {issue.verification_score} ({issue.verification_count} votes)
              </p>
            )}
          </NeuCard>
        </motion.div>
      )}

      {isOfficerOrAdmin && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-3">Officer Actions</h3>
            {!issue.assigned_officer_id && (
              <div className="mb-4">
                <NeuButton size="sm" variant="primary" onClick={handleAssignToMe} loading={assigning}>
                  Assign to Me
                </NeuButton>
              </div>
            )}
            
            <h4 className="font-medium text-neu-600 mb-2">Update Status</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['assigned', 'in_progress', 'resolved', 'closed'] as IssueStatus[]).map((s) => (
                <NeuButton
                  key={s}
                  size="sm"
                  variant={s === 'resolved' ? 'success' : s === 'closed' ? 'default' : 'primary'}
                  onClick={() => handleStatusUpdate(s)}
                  loading={updatingStatus}
                  disabled={currentStatusIndex >= statusFlow.indexOf(s)}
                >
                  {STATUS_LABELS[s]}
                </NeuButton>
              ))}
            </div>
            
            <div className="mt-2">
              <label className="block text-sm font-medium text-neu-600 mb-1">Proof Media URL (required for Resolved)</label>
              <NeuInput 
                value={proofMediaUrl} 
                onChange={(e) => setProofMediaUrl(e.target.value)} 
                placeholder="https://example.com/proof.jpg" 
              />
            </div>
          </NeuCard>
        </motion.div>
      )}

      {user?.role === 'admin' && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
              Admin Controls
            </h3>
            
            <div className="space-y-4">
              <div className="border border-red-200 rounded p-3">
                <h4 className="font-medium text-sm mb-2 text-red-700">Merge Duplicate</h4>
                <div className="flex flex-col gap-2">
                  <NeuInput 
                    value={targetIssueId} 
                    onChange={(e) => setTargetIssueId(e.target.value)} 
                    placeholder="Target Issue ID" 
                  />
                  <NeuInput 
                    value={mergeReason} 
                    onChange={(e) => setMergeReason(e.target.value)} 
                    placeholder="Reason for merge" 
                  />
                  <NeuButton variant="danger" size="sm" onClick={handleMerge} loading={merging} disabled={!targetIssueId}>
                    Merge Issue
                  </NeuButton>
                </div>
              </div>
            </div>
          </NeuCard>
        </motion.div>
      )}

      {canReopen && (
        <motion.div variants={itemVariants}>
          <NeuButton
            variant="danger"
            icon={<ArrowClockwise size={18} weight="fill" />}
            onClick={handleReopen}
            loading={reopening}
            className="w-full"
          >
            Reopen Issue
          </NeuButton>
        </motion.div>
      )}

      {issue.verifications && issue.verifications.length > 0 && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-3">Comments & Verifications</h3>
            <div className="space-y-3">
              {issue.verifications.map((v) => (
                <div key={v.verification_id} className="text-sm text-neu-600 border-l-2 border-neu-200 pl-3">
                  <span className="font-medium capitalize">{v.action_type}</span>
                  {v.comment && <p className="text-neu-500 mt-0.5">{v.comment}</p>}
                  <span className="text-xs text-neu-400 block mt-0.5">
                    {formatDistanceToNow(v.created_at, { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </NeuCard>
        </motion.div>
      )}
    </motion.div>
  );
};
