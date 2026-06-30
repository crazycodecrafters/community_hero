import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { NeuCard, NeuButton } from '../components/ui';
import { useStore } from '../store';
import { Notification } from '../types';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../services/notifications';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellRinging, Check, CheckCircle, ArrowLeft } from 'phosphor-react';

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  submission: <Bell size={20} weight="fill" className="text-blue-500" />,
  status_update: <BellRinging size={20} weight="fill" className="text-amber-500" />,
  resolution: <CheckCircle size={20} weight="fill" className="text-emerald-500" />,
  escalation: <span className="text-lg">🚨</span>,
  verification_request: <CheckCircle size={20} weight="fill" className="text-purple-500" />,
  sla_breach: <span className="text-lg">⚠️</span>,
  assignment: <BellRinging size={20} weight="fill" className="text-indigo-500" />,
  system: <Bell size={20} weight="fill" className="text-purple-500" />,
};

function getNotifIcon(notif: Notification): React.ReactNode {
  return NOTIF_ICONS[notif.notification_type] || <Bell size={20} weight="fill" className="text-neu-400" />;
}

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, setNotifications, setUnreadCount, markNotifRead } = useStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await getNotifications(50, 0);
      const notifs = data.notifications || data || [];
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n: Notification) => !n.is_read).length);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setNotifications, setUnreadCount]);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  const handleRefresh = async () => { setRefreshing(true); await loadNotifs(); };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleNotifTap = async (notif: Notification) => {
    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.notification_id);
        markNotifRead(notif.notification_id);
      } catch { /* silently fail */ }
    }
    if (notif.deep_link) navigate(notif.deep_link);
    else if (notif.issue_id) navigate(`/issues/${notif.issue_id}`);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <motion.div variants={itemVariants} className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="neu-button p-2.5 rounded-neup"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-neu-800">Notifications</h1>
            {unreadCount > 0 && <p className="text-xs text-neu-400">{unreadCount} unread</p>}
          </div>
        </div>
        {unreadCount > 0 && (
          <NeuButton size="sm" icon={<Check size={16} />} onClick={handleMarkAllRead}>Mark all read</NeuButton>
        )}
      </motion.div>

      <motion.button variants={itemVariants} onClick={handleRefresh} disabled={refreshing}
        className="w-full text-xs text-neu-400 py-2 flex items-center justify-center gap-1 mb-2" whileTap={{ scale: 0.97 }}>
        <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {refreshing ? 'Refreshing...' : 'Pull to refresh'}
      </motion.button>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" variants={itemVariants} className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <NeuCard key={i} padded={false} className="p-4">
                <div className="animate-pulse flex gap-3">
                  <div className="w-10 h-10 bg-neu-200 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-neu-200 rounded w-3/4" />
                    <div className="h-3 bg-neu-200 rounded w-1/2" />
                  </div>
                </div>
              </NeuCard>
            ))}
          </motion.div>
        ) : notifications.length === 0 ? (
          <motion.div key="empty" variants={itemVariants}>
            <NeuCard padded={false} className="p-8 text-center">
              <Bell size={48} className="text-neu-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-neu-600 mb-1">No notifications</h3>
              <p className="text-sm text-neu-400">You're all caught up! Check back later for updates on your reported issues.</p>
            </NeuCard>
          </motion.div>
        ) : (
          <motion.div key="list" variants={containerVariants} className="space-y-2">
            {notifications.map((notif, i) => (
              <motion.div key={notif.notification_id} variants={itemVariants} transition={{ delay: 0.02 * i }} layout>
                <NeuCard
                  hoverable padded={false}
                  className={`p-4 cursor-pointer ${!notif.is_read ? 'border-l-4 border-primary-DEFAULT' : ''}`}
                  onClick={() => handleNotifTap(notif)}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0 mt-0.5">
                      <div className="w-10 h-10 rounded-full bg-neu-50 flex items-center justify-center">
                        {getNotifIcon(notif)}
                      </div>
                      {!notif.is_read && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-primary-DEFAULT rounded-full border-2 border-neu-50" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notif.is_read ? 'font-semibold text-neu-800' : 'font-medium text-neu-600'}`}>{notif.title}</p>
                      {notif.body && <p className="text-xs text-neu-400 mt-0.5 line-clamp-2">{notif.body}</p>}
                      <p className="text-[10px] text-neu-300 mt-1">
                        {notif.created_at ? formatDistanceToNow(new Date(notif.created_at), { addSuffix: true }) : ''}
                      </p>
                    </div>
                    {!notif.is_read && <div className="flex-shrink-0 pt-1"><div className="w-2 h-2 bg-primary-DEFAULT rounded-full" /></div>}
                  </div>
                </NeuCard>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
