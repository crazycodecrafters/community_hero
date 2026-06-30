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
    <div className="min-h-screen bg-neu-50 pb-20">
      <Outlet />
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neu-50/90 backdrop-blur-lg border-t border-neu-200/50">
        <div className="max-w-lg mx-auto flex justify-around items-center py-2 px-2">
          {navItems.map(({ to, icon: Icon, label, badge }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-neup_sm transition-all ${
                  isActive ? 'text-primary-DEFAULT shadow-[inset_2px_2px_4px_#c9cdd6,inset_-2px_-2px_4px_#ffffff]' : 'text-neu-500'
                }`
              }
            >
              <div className="relative">
                <Icon size={22} weight={label === 'Report' ? 'fill' : 'regular'} />
                {badge && badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
};
