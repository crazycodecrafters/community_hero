import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthChange } from './services/auth';
import { useStore } from './store';
import { getProfile, loginWithIdToken } from './services/auth';
import { auth } from './firebase';
import { getUnreadCount } from './services/notifications';
import { MainLayout } from './layouts/MainLayout';
import { LandingPage } from './pages/LandingPage';
import { HomePage } from './pages/HomePage';
import { ReportIssuePage } from './pages/ReportIssuePage';
import { IssueDetailPage } from './pages/IssueDetailPage';
import { MapPage } from './pages/MapPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { OfficerDashboardPage } from './pages/OfficerDashboardPage';
import { NotificationsPage } from './pages/NotificationsPage';

const LoadingScreen: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-neu-50">
    <div className="text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        className="w-16 h-16 mx-auto mb-4 rounded-neup bg-neu-50 flex items-center justify-center"
        style={{ boxShadow: '8px 8px 16px #c9cdd6, -8px -8px 16px #ffffff' }}
      >
        <svg className="w-8 h-8 text-primary-DEFAULT" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </motion.div>
      <p className="text-neu-500 font-medium animate-pulse">Loading Community Hero...</p>
    </div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useStore();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/landing" replace />;
  return <>{children}</>;
};

function App() {
  const { user, setUser, setLoading, setUnreadCount } = useStore();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const profile = await getProfile();
          setUser(profile);
          const count = await getUnreadCount();
          setUnreadCount(count);
        } catch (err) {
          console.error('Failed to load profile:', err);
          if (firebaseUser) {
            try {
              const idToken = await firebaseUser.getIdToken();
              const profile = await loginWithIdToken(idToken);
              setUser(profile);
              const count = await getUnreadCount();
              setUnreadCount(count);
            } catch (autoHealErr) {
              console.error('Auto-heal failed:', autoHealErr);
              auth.signOut();
              setUser(null);
            }
          }
        }
      } else {
        setUser(null);
      }
      setAuthReady(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (!authReady) return <LoadingScreen />;

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route path="/landing" element={
          user ? (
            user.role === 'admin' ? <Navigate to="/admin" replace /> 
              : user.role === 'officer' ? <Navigate to="/officer" replace />
              : <Navigate to="/" replace />
          ) : <LandingPage />
        } />
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="/report" element={<ReportIssuePage />} />
          <Route path="/issues/:id" element={<IssueDetailPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={
            user && user.role === 'admin' ? <AdminDashboardPage /> : <Navigate to="/" replace />
          } />
          <Route path="/officer" element={
            user && user.role === 'officer' ? <OfficerDashboardPage /> : <Navigate to="/" replace />
          } />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/' : '/landing'} replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default App;
