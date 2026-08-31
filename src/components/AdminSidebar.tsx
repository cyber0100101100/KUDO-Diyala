import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AdminSidebar() {
  const location = useLocation();
  const path = location.pathname;
  const { user } = useAuth();

  const isSupervisor = user?.role === 'supervisor';

  const navItems = [
    { name: 'الرئيسية', icon: 'home', to: '/admin/home' },
    { name: 'الرواتب', icon: 'payments', to: '/admin/salary' },
    { name: 'الملف الشخصي', icon: 'person', to: '/admin/profile' },
    { name: 'التنبيهات', icon: 'notifications', to: '/admin/notifications' },
    { name: 'إدارة الموظفين', icon: 'group', to: '/admin/workforce' },
    { name: 'جدول العمل', icon: 'calendar_today', to: '/admin/schedule' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-72 bg-white border-l border-slate-50 h-screen fixed top-0 right-0 z-50">
      <div className="p-8 pt-24">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-4 px-6 py-3.5 rounded-2xl transition-all font-bold text-sm group/nav-item ${
                path === item.to
                  ? 'bg-red-50 text-[#E31E24] shadow-sm shadow-red-50'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              } ${item.to === '/admin/schedule' ? 'relative overflow-hidden group/schedule' : ''}`}
            >
              {item.to === '/admin/schedule' && (
                <div className="absolute top-0 right-0 w-1 h-full bg-[#E31E24] opacity-0 group-hover/schedule:opacity-100 transition-opacity"></div>
              )}
              {item.to === '/admin/workforce' && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[#E31E24] opacity-0 group-hover/nav-item:opacity-100 transition-opacity"></div>
              )}
              <span className={`material-symbols-outlined text-2xl transition-transform group-hover/nav-item:scale-110 ${path === item.to ? 'filled-icon' : ''}`}>
                {item.icon}
              </span>
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-8">
        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100/50">
          <p className="text-[10px] font-bold text-slate-400 mb-3 uppercase   text-center opacity-70">إدارة النظام</p>
          <button className="w-full py-3.5 bg-[#E31E24] text-white rounded-2xl font-bold text-xs shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98]">
            دعم فني سريع
          </button>
        </div>
      </div>
    </aside>
  );
}
