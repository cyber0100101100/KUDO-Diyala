import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();
  const path = location.pathname;

  const navItems = [
    { name: 'الرئيسية', icon: 'home', to: '/employee/home' },
    { name: 'الراتب', icon: 'payments', to: '/employee/salary' },
    { name: 'الملف الشخصي', icon: 'person', to: '/employee/profile' },
    { name: 'التنبيهات', icon: 'notifications', to: '/employee/notifications' },
  ];

  return (
    <aside className="hidden md:flex flex-col w-72 bg-white border-l border-slate-50 h-screen fixed top-0 right-0 z-50">
      <div className="p-8 pt-24">
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-4 px-6 py-3.5 rounded-2xl transition-all group font-bold text-sm ${
                path === item.to
                  ? 'bg-red-50 text-[#E31E24] shadow-sm shadow-red-50'
                  : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
              }`}
            >
              <span className={`material-symbols-outlined text-2xl ${path === item.to ? 'filled-icon' : ''}`}>
                {item.icon}
              </span>
              <span className="flex-1">{item.name}</span>
            </Link>
          ))}

          {user?.role === 'admin' && (
            <Link
              to="/admin/home"
              className={`flex items-center gap-4 px-6 py-3.5 rounded-2xl transition-all group font-bold text-sm mt-4 border border-red-50 border-dashed ${
                path.startsWith('/admin')
                  ? 'bg-red-50 text-[#E31E24] shadow-sm shadow-red-50 border-solid'
                  : 'text-[#E31E24] hover:bg-red-50/50'
              }`}
            >
              <span className={`material-symbols-outlined text-2xl ${path.startsWith('/admin') ? 'filled-icon' : ''}`}>
                admin_panel_settings
              </span>
              <span className="flex-1">لوحة الإدارة</span>
            </Link>
          )}
        </nav>
      </div>

      <div className="mt-auto p-8">
        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100/50">
          <p className="text-[10px] font-bold text-slate-400 mb-3 uppercase   text-center opacity-70">المساعدة والدعم</p>
          <button className="w-full py-3.5 bg-white border border-slate-200 rounded-2xl text-slate-600 font-bold text-xs shadow-sm hover:bg-white/80 transition-all active:scale-[0.98]">
            اتصل بالدعم
          </button>
        </div>
      </div>
    </aside>
  );
}
