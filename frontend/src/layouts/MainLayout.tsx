import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { House, MapPin, PlusCircle, Bell, User, ChartBar, ShieldCheck } from 'phosphor-react';
import { useStore } from '../store';

export const MainLayout: React.FC = () => {
  const { user, unreadCount } = useStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.role === 'officer' || user?.role === 'moderator';

  const navItems = [
    { to: '/', icon: House, label: 'Home' },
    { to: '/map', icon: MapPin, label: 'Map' },
    { to: '/report', icon: PlusCircle, label: 'Report' },
    { to: '/notifications', icon: Bell, label: 'Notifs', badge: unreadCount },
    { to: '/profile', icon: User, label: 'Profile' },
  ];

  if (isAdmin) {
    navItems.push({ to: '/admin', icon: ChartBar, label: 'Admin' });
  }

  return (
    <div className="min-h-screen bg-neu-50 pb-20 sm:pb-24">
      <Outlet />
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-nav pb-safe">
        <div className="max-w-md mx-auto flex justify-between items-center py-2 px-6">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-300 ${
                  isActive ? 'text-primary-DEFAULT bg-primary-DEFAULT/10 scale-110' : 'text-slate-400 hover:text-slate-600'
                }`
              }
            >
              <div className="relative">
                <Icon size={24} weight={label === 'Report' ? 'fill' : 'regular'} />
                {badge && badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold tracking-wide">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};
