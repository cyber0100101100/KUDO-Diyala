import { Link, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;

  const navItems = [
    { label: 'الرئيسية', path: '/employee/home', icon: 'home' },
    { label: 'الراتب', path: '/employee/salary', icon: 'payments' },
    { label: 'الطلبات', path: '/employee/requests', icon: 'assignment' },
    { label: 'التنبيهات', path: '/employee/notifications', icon: 'notifications' },
    { label: 'الملف', path: '/employee/profile', icon: 'person' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 flex flex-row-reverse justify-around items-center px-2 bg-white/95 backdrop-blur-xl border-t border-slate-100/50 shadow-[0_-8px_30px_rgba(0,0,0,0.02)] h-20 pb-safe">
      {navItems.map((item) => (
        <Link 
          key={item.path}
          to={item.path} 
          className={`flex flex-col items-center gap-1 transition-all flex-1 px-1 relative group ${path === item.path ? 'text-[#E31E24]' : 'text-slate-400'}`}
        >
          <span className={`material-symbols-outlined text-2xl transition-transform ${path === item.path ? 'filled-icon scale-110' : 'group-active:scale-90'}`}>
            {item.icon}
          </span>
          <span className={`text-[8px] font-black uppercase  er text-center transition-colors ${path === item.path ? 'text-[#E31E24]' : 'text-slate-400'}`}>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
