import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, SignOut, Fire, ShieldCheck, Medal, Star, Flag, Gear, Bell, EyeSlash } from 'phosphor-react';
import toast from 'react-hot-toast';
import { getProfile, logout, updateProfile } from '../services/auth';
import { getIssues } from '../services/issues';
import { useStore } from '../store';
import { UserProfile, Issue, LeaderboardEntry, Badge } from '../types';
import { NeuCard } from '../components/ui/NeuCard';
import { NeuButton } from '../components/ui/NeuButton';

const XP_PER_LEVEL = 500;

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const defaultBadgeIcons: Record<string, string> = {
  first_report: '📝',
  verified_citizen: '✅',
  streak_7: '🔥',
  streak_30: '💪',
  top_report: '🏆',
  high_trust: '⭐',
  helper: '🤝',
  veteran: '🎖️',
};

export const ProfilePage = () => {
  const navigate = useNavigate();
  const { user: storeUser, setUser, badges: storeBadges, setBadges } = useStore();

  const [profile, setProfile] = useState<UserProfile | null>(storeUser);
  const [myIssues, setMyIssues] = useState<Issue[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    Promise.all([
      getProfile().catch(() => null),
      getIssues({ limit: 5 }).catch(() => ({ issues: [], total: 0 })),
      fetch('/api/gamification/leaderboard?limit=10').then((r) => r.json()).catch(() => ({ data: [] })),
      fetch('/api/gamification/badges').then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([prof, issuesRes, lbRes, badgeRes]) => {
        if (prof) {
          setProfile(prof);
          setUser(prof);
        }
        setMyIssues(issuesRes.issues || []);
        setLeaderboard((lbRes as any).data || []);
        setBadges((badgeRes as any).data || []);
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [setUser, setBadges]);

  const xp = profile?.xp_points ?? 0;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const levelProgress = (xp % XP_PER_LEVEL) / XP_PER_LEVEL;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setUser(null);
      navigate('/landing');
    } catch {
      toast.error('Logout failed');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleToggleAnonymous = async () => {
    setAnonymousMode((p) => !p);
    toast.success(`Anonymous mode ${anonymousMode ? 'disabled' : 'enabled'}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin h-8 w-8 border-4 border-primary-DEFAULT border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-2xl mx-auto px-4 py-6 space-y-5"
    >
      <motion.div variants={itemVariants}>
        <NeuCard>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-DEFAULT to-purple-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                profile?.name?.charAt(0).toUpperCase() || <User size={28} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-neu-800 truncate">{profile?.name || 'User'}</h2>
              <p className="text-sm text-neu-500 truncate">{profile?.email}</p>
              <span className="inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary-DEFAULT/10 text-primary-DEFAULT capitalize">
                {profile?.role || 'citizen'}
              </span>
            </div>
          </div>
        </NeuCard>
      </motion.div>

      <motion.div variants={itemVariants}>
        <NeuCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-neu-700">Level {level}</span>
            <span className="text-xs text-neu-400">{xp} / {level * XP_PER_LEVEL} XP</span>
          </div>
          <div className="h-3 rounded-full bg-neu-200 overflow-hidden shadow-[inset_2px_2px_4px_#c9cdd6,inset_-2px_-2px_4px_#ffffff]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${levelProgress * 100}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-primary-DEFAULT to-purple-500"
            />
          </div>
        </NeuCard>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        <motion.div variants={itemVariants}>
          <NeuCard className="text-center h-full flex flex-col items-center justify-center py-4">
            <Star size={24} className="text-primary-DEFAULT mb-1" weight="fill" />
            <p className="text-2xl font-bold text-neu-800 leading-none">{profile?.xp_points || 0}</p>
            <p className="text-[10px] sm:text-xs text-neu-500 mt-1 font-medium uppercase tracking-wide">Total XP</p>
          </NeuCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <NeuCard className="text-center h-full flex flex-col items-center justify-center py-4">
            <Fire size={24} className="text-orange-500 mb-1" weight="fill" />
            <p className="text-2xl font-bold text-neu-800 leading-none">{profile?.streak_days || 0}</p>
            <p className="text-[10px] sm:text-xs text-neu-500 mt-1 font-medium uppercase tracking-wide">Day Streak</p>
          </NeuCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <NeuCard className="text-center h-full flex flex-col items-center justify-center py-4">
            <ShieldCheck size={24} className="text-emerald-500 mb-1" weight="fill" />
            <p className="text-2xl font-bold text-neu-800 leading-none">{profile?.trust_score?.toFixed(1) || '1.0'}</p>
            <p className="text-[10px] sm:text-xs text-neu-500 mt-1 font-medium uppercase tracking-wide">Trust Score</p>
          </NeuCard>
        </motion.div>
        <motion.div variants={itemVariants}>
          <NeuCard className="text-center h-full flex flex-col items-center justify-center py-4">
            <Flag size={24} className="text-red-400 mb-1" weight="fill" />
            <p className="text-2xl font-bold text-neu-800 leading-none">{profile?.false_report_count || 0}</p>
            <p className="text-[10px] sm:text-xs text-neu-500 mt-1 font-medium uppercase tracking-wide">Flags</p>
          </NeuCard>
        </motion.div>
      </div>

      {storeBadges.length > 0 && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-3 flex items-center gap-2">
              <Medal size={18} weight="fill" className="text-amber-500" />
              Badges
            </h3>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {storeBadges.map((badge) => {
                const earned = profile?.badge_ids?.includes(badge.badge_id);
                return (
                  <div
                    key={badge.badge_id}
                    className={`flex flex-col items-center gap-1 p-2 rounded-neup_sm transition-all ${
                      earned
                        ? 'bg-gradient-to-br from-amber-50 to-yellow-50 shadow-[2px_2px_4px_#c9cdd6,-2px_-2px_4px_#ffffff]'
                        : 'opacity-30 grayscale'
                    }`}
                    title={badge.description}
                  >
                    <span className="text-2xl">{defaultBadgeIcons[badge.badge_id] || '🏅'}</span>
                    <span className="text-[10px] font-medium text-neu-600 text-center leading-tight">
                      {badge.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </NeuCard>
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <NeuCard>
          <h3 className="font-semibold text-neu-700 mb-3">Recent Activity</h3>
          {myIssues.length === 0 ? (
            <p className="text-sm text-neu-400">No issues reported yet</p>
          ) : (
            <div className="space-y-2">
              {myIssues.map((issue) => (
                <button
                  key={issue.issue_id}
                  onClick={() => navigate(`/issues/${issue.issue_id}`)}
                  className="w-full text-left p-2.5 rounded-neup_sm hover:bg-neu-100/50 transition-colors"
                >
                    <p className="text-xs font-medium text-neu-700 truncate">{issue.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-neu-400">
                        {issue.created_at ? new Date(issue.created_at).toLocaleDateString() : ''}
                      </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize"
                      style={{
                        backgroundColor: `${issue.severity === 'critical' ? '#d63031' : issue.severity === 'high' ? '#e17055' : issue.severity === 'medium' ? '#fdcb6e' : '#00b894'}20`,
                        color: issue.severity === 'critical' ? '#d63031' : issue.severity === 'high' ? '#e17055' : issue.severity === 'medium' ? '#b8860b' : '#00b894',
                      }}
                    >
                      {issue.severity}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </NeuCard>
      </motion.div>

      {leaderboard.length > 0 && (
        <motion.div variants={itemVariants}>
          <NeuCard>
            <h3 className="font-semibold text-neu-700 mb-3 flex items-center gap-2">
              <Medal size={18} weight="fill" className="text-amber-500" />
              Top Contributors
            </h3>
            <div className="space-y-1">
              {leaderboard.slice(0, 10).map((entry, i) => (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-3 p-2 rounded-neup_sm"
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-400 text-white' :
                    i === 1 ? 'bg-gray-300 text-neu-700' :
                    i === 2 ? 'bg-amber-600 text-white' :
                    'bg-neu-200 text-neu-500'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-neu-700 truncate">{entry.name}</span>
                  <span className="text-xs font-semibold text-primary-DEFAULT">{entry.xp_points} XP</span>
                </div>
              ))}
            </div>
          </NeuCard>
        </motion.div>
      )}

      <motion.div variants={itemVariants}>
        <NeuCard>
          <h3 className="font-semibold text-neu-700 mb-3 flex items-center gap-2">
            <Gear size={18} className="text-neu-500" />
            Settings
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-neu-500" />
                <span className="text-sm text-neu-700">Notifications</span>
              </div>
              <button
                onClick={() => setNotifEnabled((p) => !p)}
                className={`w-10 h-5 rounded-full transition-colors ${notifEnabled ? 'bg-primary-DEFAULT' : 'bg-neu-300'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${notifEnabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <EyeSlash size={18} className="text-neu-500" />
                <span className="text-sm text-neu-700">Anonymous Mode</span>
              </div>
              <button
                onClick={handleToggleAnonymous}
                className={`w-10 h-5 rounded-full transition-colors ${anonymousMode ? 'bg-primary-DEFAULT' : 'bg-neu-300'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${anonymousMode ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`} />
              </button>
            </div>
          </div>
        </NeuCard>
      </motion.div>

      <motion.div variants={itemVariants}>
        <NeuButton
          variant="danger"
          icon={<SignOut size={18} weight="fill" />}
          onClick={handleLogout}
          loading={loggingOut}
          className="w-full"
        >
          Logout
        </NeuButton>
      </motion.div>
    </motion.div>
  );
};
