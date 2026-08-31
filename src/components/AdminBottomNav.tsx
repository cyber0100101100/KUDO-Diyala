import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';

export default function AdminBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user } = useAuth();

  const isSupervisor = user?.role === 'supervisor';

  const navItems = [
    { name: 'الرئيسية', icon: 'home', to: '/admin/home' },
    { name: 'الموظفون', icon: 'badge', to: '/admin/workforce' },
    { name: 'التنبيهات', icon: 'notifications', to: '/admin/notifications' },
  ];

  const menuOptions = [
    { name: 'الملف الشخصي', icon: 'person', to: '/admin/profile' },
    { name: 'الرواتب', icon: 'account_balance_wallet', to: '/admin/salary' },
    { name: 'إنشاء جدول العمل', icon: 'calendar_month', to: '/admin/schedule' },
  ];

  return (
    <>
      <AnimatePresence>
        {isMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden"
            />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-4/5 max-w-[300px] bg-white z-[70] shadow-2xl md:hidden flex flex-col font-sans rtl"
            >
              <div className="p-8 border-b border-slate-100 flex flex-col gap-2">
                <h2 className="text-xl font-black text-slate-900  ">القائمة الإدارية</h2>
                <p className="text-[10px] font-black text-slate-400 uppercase   opacity-70">إدارة العمليات والبيانات</p>
              </div>

              <div className="flex-1 p-4 flex flex-col gap-2">
                {menuOptions.map((option) => (
                  <button
                    key={option.to}
                    onClick={() => {
                      setIsMenuOpen(false);
                      navigate(option.to);
                    }}
                    className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-all text-right group active:scale-[0.98]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-[#E31E24] group-hover:text-white transition-all">
                      <span className="material-symbols-outlined text-xl">{option.icon}</span>
                    </div>
                    <span className="text-sm font-black text-slate-700 group-hover:text-slate-900 transition-colors">{option.name}</span>
                  </button>
                ))}
              </div>

              <div className="p-8 border-t border-slate-100">
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="w-full py-4 bg-slate-50 text-slate-400 rounded-2xl text-xs font-black uppercase   active:scale-95 transition-all"
                >
                  إغلاق القائمة
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex flex-row-reverse justify-between items-center px-2 bg-white/95 backdrop-blur-xl border-t border-slate-100/50 shadow-[0_-8px_30px_rgba(0,0,0,0.02)] h-20 pb-safe">
        {/* Right side items */}
        <div className="flex flex-1 flex-row-reverse justify-around items-center">
          {navItems.map((item) => (
            <Link 
              key={item.to}
              to={item.to!} 
              className={`flex flex-col items-center gap-1 transition-all px-1 ${path === item.to ? 'text-[#E31E24]' : 'text-slate-400'}`}
            >
              <span className={`material-symbols-outlined text-2xl ${path === item.to ? 'filled-icon' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[8px] font-black uppercase  er text-center">{item.name}</span>
            </Link>
          ))}
        </div>

        {/* Left side items */}
        <div className="flex flex-1 flex-row-reverse justify-around items-center">
          <button 
            onClick={() => setIsMenuOpen(true)}
            className={`flex flex-col items-center gap-1 transition-all px-1 ${isMenuOpen ? 'text-[#E31E24]' : 'text-slate-400'}`}
          >
            <span className={`material-symbols-outlined text-2xl ${isMenuOpen ? 'filled-icon' : ''}`}>menu</span>
            <span className="text-[8px] font-black uppercase  er text-center">المزيد</span>
          </button>
        </div>
      </nav>
    </>
  );
}
