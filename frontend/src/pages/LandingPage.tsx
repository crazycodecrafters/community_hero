import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, GoogleLogo, EnvelopeSimple, LockKey, SignIn, UserPlus } from 'phosphor-react';
import { signInWithGoogle, loginWithEmail, registerWithEmail } from '../services/auth';
import { useStore } from '../store';
import { NeuInput, NeuButton } from '../components/ui';

const floatingIcons = [
  { emoji: '⛔', delay: 0, x: '15%', y: '20%', size: '2rem' },
  { emoji: '💧', delay: 1.5, x: '75%', y: '30%', size: '1.75rem' },
  { emoji: '💡', delay: 0.8, x: '85%', y: '65%', size: '1.5rem' },
  { emoji: '🌳', delay: 2, x: '10%', y: '70%', size: '1.25rem' },
  { emoji: '⚡', delay: 0.3, x: '50%', y: '15%', size: '1.5rem' },
];

const DEMO_ACCOUNTS = [
  { label: 'Demo Citizen', email: 'citizen@communityhero.dev', role: 'citizen' },
  { label: 'Demo Officer', email: 'officer@communityhero.dev', role: 'officer' },
  { label: 'Demo Admin', email: 'admin@communityhero.dev', role: 'admin' }
];

export const LandingPage: React.FC = () => {
  const { user, setUser } = useStore();
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleAuthResult = (userProfile: any) => {
    setUser(userProfile);
    if (userProfile.role === 'admin' || userProfile.role === 'officer' || userProfile.role === 'moderator') {
      navigate('/admin', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleError = (err: any) => {
    setAuthError(err.message || 'Authentication failed');
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true); setAuthError(null);
    try {
      const profile = await signInWithGoogle();
      handleAuthResult(profile);
    } catch (err) { handleError(err); } 
    finally { setAuthLoading(false); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (!isLoginMode && !name)) return;
    setAuthLoading(true); setAuthError(null);
    try {
      if (isLoginMode) {
        const profile = await loginWithEmail(email, password);
        handleAuthResult(profile);
      } else {
        const profile = await registerWithEmail(email, password, name);
        handleAuthResult(profile);
      }
    } catch (err) { handleError(err); } 
    finally { setAuthLoading(false); }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setAuthLoading(true); setAuthError(null);
    try {
      try {
        const profile = await loginWithEmail(demoEmail, 'demo1234');
        handleAuthResult(profile);
      } catch {
        // If demo user doesn't exist yet, auto-register them
        const label = DEMO_ACCOUNTS.find(a => a.email === demoEmail)?.label || 'Demo User';
        const role = DEMO_ACCOUNTS.find(a => a.email === demoEmail)?.role || 'citizen';
        const profile = await registerWithEmail(demoEmail, 'demo1234', label, role as any);
        handleAuthResult(profile);
      }
    } catch (err) { handleError(err); }
    finally { setAuthLoading(false); }
  };

  return (
    <div className="min-h-screen bg-neu-50 flex items-center justify-center p-4 relative overflow-hidden">
      {floatingIcons.map(({ emoji, delay, x, y, size }, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none select-none"
          style={{ left: x, top: y, fontSize: size }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 0.12, scale: 1, y: [0, -12, 0] }}
          transition={{ opacity: { delay: delay + 1, duration: 0.8 }, scale: { delay: delay + 1, duration: 0.5, type: 'spring' }, y: { delay, duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
        >
          {emoji}
        </motion.div>
      ))}

      <motion.div
        className="neu-card w-full max-w-sm p-6 sm:p-8 text-center relative z-10"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary-light to-primary-dark flex items-center justify-center shadow-lg">
          <ShieldCheck size={32} weight="fill" className="text-white" />
        </div>

        <h1 className="text-2xl font-extrabold text-neu-800 mb-1">Community Hero</h1>
        <p className="text-neu-500 text-xs sm:text-sm mb-6">Report. Verify. Resolve. Together.</p>

        {authError && (
          <div className="mb-4 text-xs text-red-500 bg-red-50/50 p-2 rounded-neup border border-red-100">
            {authError}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
          <AnimatePresence>
            {!isLoginMode && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                <NeuInput
                  type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required={!isLoginMode}
                  icon={<UserPlus size={18} />}
                />
              </motion.div>
            )}
          </AnimatePresence>
          <NeuInput 
            type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required
            icon={<EnvelopeSimple size={18} />}
          />
          <NeuInput 
            type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required
            icon={<LockKey size={18} />}
          />
          <NeuButton type="submit" variant="primary" className="w-full" loading={authLoading}>
            {isLoginMode ? 'Sign In' : 'Create Account'}
          </NeuButton>
        </form>

        <div className="mt-4 text-sm text-neu-500 flex items-center justify-center gap-1">
          <span>{isLoginMode ? "Don't have an account?" : "Already have an account?"}</span>
          <button type="button" onClick={() => setIsLoginMode(!isLoginMode)} className="text-primary-DEFAULT font-semibold hover:underline">
            {isLoginMode ? 'Sign Up' : 'Log In'}
          </button>
        </div>

        <div className="my-6 relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neu-200" /></div>
          <div className="relative px-3 bg-neu-50 text-xs text-neu-400 font-medium">OR</div>
        </div>

        <NeuButton type="button" onClick={handleGoogleSignIn} disabled={authLoading} className="w-full mb-6">
          <GoogleLogo size={20} weight="bold" /> Continue with Google
        </NeuButton>

        <div className="pt-4 border-t border-neu-100">
          <p className="text-xs text-neu-400 mb-3 uppercase tracking-wider font-semibold">Demo Access</p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((acc, i) => (
              <button
                key={i} type="button" disabled={authLoading} onClick={() => handleDemoLogin(acc.email)}
                className="text-[10px] sm:text-xs font-semibold py-2 px-1 rounded-neup_sm neu-button text-neu-600 hover:text-primary-DEFAULT transition-colors truncate"
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
