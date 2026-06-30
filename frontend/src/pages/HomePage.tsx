import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PlusCircle, MapPin, Trophy, Lightning } from 'phosphor-react';
import { useStore } from '../store';
import { getIssues } from '../services/issues';
import { CATEGORY_ICONS } from '../types';
import { NeuCard } from '../components/ui/NeuCard';
import { NeuButton } from '../components/ui/NeuButton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { XpPop } from '../components/ui/XpPop';

export const HomePage: React.FC = () => {
  const { user, issues, setIssues } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [xpTrigger, setXpTrigger] = useState(false);
  const [prevXp, setPrevXp] = useState(user?.xp_points ?? 0);
  const [weeklyChallenge] = useState<{
    title: string;
    description: string;
    progress: number;
    target: number;
    xpReward: number;
  } | null>({
    title: 'Street Watch',
    description: 'Report 5 streetlight issues this week',
    progress: 2,
    target: 5,
    xpReward: 100,
  });

  useEffect(() => {
    loadIssues();
  }, []);

  useEffect(() => {
    if (user && user.xp_points > prevXp) {
      setXpTrigger(true);
      setPrevXp(user.xp_points);
      setTimeout(() => setXpTrigger(false), 800);
    }
  }, [user?.xp_points]);

  const loadIssues = async () => {
    try {
      const result = await getIssues({ limit: 5 });
      setIssues(result.issues);
    } catch (err) {
      console.error('Failed to load issues', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadIssues();
  };

  if (!user) {
    navigate('/', { replace: true });
    return null;
  }

  const openIssues = issues.filter((i) => !['resolved', 'closed'].includes(i.status)).length;
  const resolvedIssues = issues.filter((i) => i.status === 'resolved' || i.status === 'closed').length;
  const verificationScore = user.trust_score ?? 0;

  const statCards = [
    { label: 'Open Issues', value: openIssues, color: 'text-primary-DEFAULT' },
    { label: 'Resolved', value: resolvedIssues, color: 'text-emerald-600' },
    { label: 'Verification Score', value: `${verificationScore}%`, color: 'text-amber-600' },
  ];

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <XpPop points={user.xp_points - prevXp} trigger={xpTrigger} />

      <motion.div
        className="flex items-center justify-between mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-xl font-bold text-neu-800">
            Welcome, {user.name.split(' ')[0]}!
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <Lightning size={16} weight="fill" className="text-amber-500" />
            <span className="text-sm font-semibold text-amber-600">{user.xp_points} XP</span>
          </div>
        </div>
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-light to-primary-dark flex items-center justify-center text-white font-bold text-lg shadow-lg">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 border-2 border-neu-50 rounded-full flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">{'\u2713'}</span>
          </div>
        </div>
      </motion.div>

      <motion.button
        onClick={handleRefresh}
        disabled={refreshing}
        className="w-full text-xs text-neu-400 py-2 flex items-center justify-center gap-1 mb-2"
        whileTap={{ scale: 0.97 }}
      >
        <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {refreshing ? 'Refreshing...' : 'Pull to refresh'}
      </motion.button>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i, duration: 0.4 }}
          >
            <NeuCard padded={false} className="p-3 text-center">
              <p className="text-xs text-neu-400 mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </NeuCard>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="mb-6"
      >
        <NeuButton
          variant="primary"
          size="lg"
          className="w-full"
          icon={<PlusCircle size={22} weight="fill" />}
          onClick={() => navigate('/report')}
        >
          Report an Issue
        </NeuButton>
      </motion.div>

      {weeklyChallenge && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mb-6"
        >
          <NeuCard>
            <div className="flex items-center gap-2 mb-2">
              <Trophy size={18} weight="fill" className="text-amber-500" />
              <h2 className="text-sm font-bold text-neu-700">Weekly Challenge</h2>
            </div>
            <p className="text-sm font-medium text-neu-800">{weeklyChallenge.title}</p>
            <p className="text-xs text-neu-400 mb-3">{weeklyChallenge.description}</p>
            <div className="neu-progress">
              <div className="neu-progress-fill" style={{ width: `${(weeklyChallenge.progress / weeklyChallenge.target) * 100}%` }} />
            </div>
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-xs text-neu-400">{weeklyChallenge.progress}/{weeklyChallenge.target}</span>
              <span className="text-xs font-semibold text-primary-DEFAULT">+{weeklyChallenge.xpReward} XP</span>
            </div>
          </NeuCard>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-neu-700">Nearby Issues</h2>
          <button
            onClick={() => navigate('/map')}
            className="text-xs text-primary-DEFAULT font-medium flex items-center gap-1"
          >
            <MapPin size={14} />
            View map
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <NeuCard key={i} padded={false} className="p-4">
                <div className="animate-pulse space-y-2">
                  <div className="h-4 bg-neu-200 rounded w-3/4" />
                  <div className="h-3 bg-neu-200 rounded w-1/2" />
                </div>
              </NeuCard>
            ))}
          </div>
        ) : issues.length === 0 ? (
          <NeuCard padded={false} className="p-6 text-center">
            <p className="text-sm text-neu-400">No issues reported nearby yet.</p>
          </NeuCard>
        ) : (
          <div className="space-y-3">
            {issues.slice(0, 5).map((issue, i) => (
              <motion.div
                key={issue.issue_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.3 }}
              >
                <NeuCard
                  hoverable
                  padded={false}
                  className="p-4"
                  onClick={() => navigate(`/issues/${issue.issue_id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-neu-800 truncate">{issue.title}</h3>
                      <p className="text-xs text-neu-400 mt-0.5">
                        {issue.address_text || `${issue.latitude.toFixed(4)}, ${issue.longitude.toFixed(4)}`}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <StatusBadge status={issue.status} />
                        {issue.verification_count > 0 && (
                          <span className="text-[10px] text-neu-400">
                            {issue.verification_count} verification{issue.verification_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-lg flex-shrink-0">
                      {CATEGORY_ICONS[issue.issue_type] || '\uD83D\uDCCC'}
                    </div>
                  </div>
                </NeuCard>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};
