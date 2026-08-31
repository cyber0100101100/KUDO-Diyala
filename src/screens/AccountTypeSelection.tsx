import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';

export default function AccountTypeSelection() {
  const [selectedRole, setSelectedRole] = useState<'manager' | 'employee' | null>(null);
  const navigate = useNavigate();

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col items-center justify-center relative overflow-hidden antialiased">
      <header className="w-full absolute top-0 pt-12 px-6 flex justify-center z-10">
        <div className="h-12 w-56 relative">
          <img src="/icon.png" alt="KUDO KUDO" className="h-full w-full object-contain" />
        </div>
      </header>

      <main className="w-full max-w-md px-6 z-10 flex flex-col gap-6 mt-16">
        <div className="text-center mb-4 space-y-2">
          <h1 className="text-3xl font-black text-slate-800  ">مرحباً بك</h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase   opacity-70">اختر نوع حسابك للمتابعة</p>
        </div>

        <div className="flex flex-col gap-5 w-full">
          <button 
            onClick={() => setSelectedRole('manager')}
            className={`w-full bg-white rounded-[28px] p-7 flex items-center gap-6 text-right shadow-sm transition-all active:scale-[0.98] duration-300 relative overflow-hidden group border-2 ${selectedRole === 'manager' ? 'border-[#E31E24] shadow-2xl shadow-red-500/10' : 'border-slate-50/50 hover:border-slate-200'}`}
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-105 group-hover:rotate-3">
              <span className="material-symbols-outlined text-[#E31E24] text-4xl filled-icon">
                crown
              </span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-slate-900 mb-1  ">أنا مدير</h3>
              <p className="text-sm font-bold text-slate-400 leading-tight">إدارة الموظفين، الجداول، والرواتب</p>
            </div>
            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedRole === 'manager' ? 'bg-[#E31E24] border-[#E31E24] scale-110 shadow-lg shadow-red-500/30' : 'border-slate-100'}`}>
              {selectedRole === 'manager' && <span className="material-symbols-outlined text-white text-[14px] font-black">check</span>}
            </div>
          </button>

          <button 
            onClick={() => setSelectedRole('employee')}
            className={`w-full bg-white rounded-[28px] p-7 flex items-center gap-6 text-right shadow-sm transition-all active:scale-[0.98] duration-300 relative overflow-hidden group border-2 ${selectedRole === 'employee' ? 'border-[#E31E24] shadow-2xl shadow-red-500/10' : 'border-slate-50/50 hover:border-slate-200'}`}
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center flex-shrink-0 transition-all group-hover:scale-105 group-hover:-rotate-3">
              <span className="material-symbols-outlined text-4xl text-slate-400 group-hover:text-slate-600 transition-colors">person</span>
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-black text-slate-900 mb-1  ">أنا موظف</h3>
              <p className="text-sm font-bold text-slate-400 leading-tight">تسجيل الحضور اليومي ومتابعة الطلبات</p>
            </div>
            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${selectedRole === 'employee' ? 'bg-[#E31E24] border-[#E31E24] scale-110 shadow-lg shadow-red-500/30' : 'border-slate-100'}`}>
              {selectedRole === 'employee' && <span className="material-symbols-outlined text-white text-[14px] font-black">check</span>}
            </div>
          </button>
        </div>

        <div className="mt-4">
          <button 
            disabled={!selectedRole}
            onClick={() => selectedRole && navigate(`/login/${selectedRole}`)}
            className={`w-full h-16 ${selectedRole ? 'bg-[#E31E24] shadow-xl shadow-red-100' : 'bg-slate-200 cursor-not-allowed'} text-white text-lg font-black rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center uppercase  `}
          >
            متابعة
          </button>
        </div>
      </main>

      <div className="absolute bottom-0 w-full z-0 pointer-events-none opacity-10">
        <svg className="w-full h-auto text-primary-container" fill="currentColor" preserveAspectRatio="none" viewBox="0 0 1440 320">
          <path d="M0,256L48,229.3C96,203,192,149,288,154.7C384,160,480,224,576,224C672,224,768,160,864,138.7C960,117,1056,139,1152,165.3C1248,192,1344,224,1392,240L1440,256L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
        </svg>
      </div>
    </div>
  );
}
