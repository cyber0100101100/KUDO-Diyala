import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';

interface AdminTopHeaderProps {
  title?: string;
  showBackButton?: boolean;
  hideLogo?: boolean;
  centerTitle?: boolean;
  hideNotifications?: boolean;
  rightAction?: React.ReactNode;
}

export default function AdminTopHeader({ 
  title, 
  showBackButton = true, 
  hideLogo = false,
  centerTitle = false,
  hideNotifications = false,
  rightAction
}: AdminTopHeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className="bg-white/90 backdrop-blur-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b border-slate-100/50 shadow-sm">
      <div className="flex-1 flex items-center gap-2 md:gap-3 min-w-0">
        {showBackButton && (
          <button 
            onClick={() => navigate(-1)}
            className="w-9 h-9 md:w-10 md:h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined text-lg md:text-xl">arrow_forward</span>
          </button>
        )}
        {title && !centerTitle && (
          <h1 className="text-sm md:text-base font-black text-slate-900   truncate mr-2">{title}</h1>
        )}
        {!title && !centerTitle && (
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 flex-shrink-0 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shadow-sm">
              <img 
                src={user?.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || 'Admin')}&background=f8fafc&color=cbd5e1`} 
                alt="Profile" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] md:text-[11px] font-black text-slate-900 leading-tight truncate max-w-[100px] md:max-w-[120px]">
                {user?.displayName || 'المدير العام'}
              </span>
              <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase   leading-none mt-0.5">
                {user?.jobTitle || 'إدارة النظام'}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-2 md:px-4 flex items-center justify-center">
        {centerTitle && title ? (
          <h1 className="text-sm md:text-base font-black text-slate-900  ">{title}</h1>
        ) : !hideLogo ? (
          <motion.img 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            src="/icon.png" 
            alt="KUDO KUDO" 
            className="h-5 md:h-8 object-contain"
          />
        ) : null}
      </div>

      <div className="flex-1 flex items-center justify-end">
        {rightAction ? (
          rightAction
        ) : !hideNotifications ? (
          <button 
            onClick={() => navigate('/admin/notifications')}
            className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors active:scale-95 relative"
          >
            <span className="material-symbols-outlined text-lg md:text-xl">notifications</span>
            <span className="absolute top-2 right-2 md:top-2.5 md:right-2.5 w-1.5 h-1.5 md:w-2 md:h-2 bg-[#E31E24] rounded-full border border-white"></span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
