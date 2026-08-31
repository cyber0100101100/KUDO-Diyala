import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getCurrentMonthBaghdadStr, formatDateNumeric } from '../lib/timeUtils';

export default function SalaryScreen() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthBaghdadStr());
  const [financialStats, setFinancialStats] = useState({ bonus: 0, advance: 0, deduction: 0, overtime: 0 });
  const [attendanceCount, setAttendanceCount] = useState({ attended: 0, absent: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;

    // Fetch financial records for this month
    const finQuery = query(
      collection(db, 'financial_records'),
      where('userId', '==', user.uid),
      where('period', '==', selectedMonth)
    );

    const unsubFin = onSnapshot(finQuery, (snapshot) => {
      const stats = snapshot.docs.reduce((acc, curr) => {
        const data = curr.data();
        return {
          bonus: acc.bonus + (data.bonus || 0),
          advance: acc.advance + (data.advance || 0),
          deduction: acc.deduction + (data.deduction || 0),
          overtime: acc.overtime + (data.overtime || 0)
        };
      }, { bonus: 0, advance: 0, deduction: 0, overtime: 0 });
      setFinancialStats(stats);
    });

    // Fetch attendance for this month
    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const attendQuery = query(
      collection(db, 'attendance'),
      where('userId', '==', user.uid),
      where('date', '>=', startDate),
      where('date', '<=', endDate)
    );

    const unsubAttend = onSnapshot(attendQuery, (snapshot) => {
      const counts = snapshot.docs.reduce((acc, curr) => {
        const data = curr.data();
        if (data.status === 'present' || data.status === 'late') {
          return { ...acc, attended: acc.attended + 1 };
        } else if (data.status === 'absent') {
          return { ...acc, absent: acc.absent + 1 };
        }
        return acc;
      }, { attended: 0, absent: 0 });
      setAttendanceCount(counts);
      setLoading(false);
    });

    return () => {
      unsubFin();
      unsubAttend();
    };
  }, [user, authLoading, selectedMonth]);

  if (!user) return null;

  const baseSalary = user.baseSalary || 0;
  const { bonus, advance, deduction, overtime } = financialStats;
  const netSalary = baseSalary + bonus + overtime - deduction - advance;

  return (
    <div className="bg-white text-slate-800 min-h-screen flex flex-col antialiased font-sans rtl pt-16 md:pt-20">
      <div className="w-full bg-white min-h-screen relative flex flex-col">
        <header className="bg-white/90 backdrop-blur-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b border-slate-100/50 shadow-sm">
          <button onClick={() => navigate(-1)} className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
            <span className="material-symbols-outlined text-lg md:text-xl">arrow_forward</span>
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-xs md:text-sm font-black text-slate-900  ">تقرير المستحقات المالية</h1>
            <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase  ">{selectedMonth}</span>
          </div>
          <div className="relative">
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <button className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
              <span className="material-symbols-outlined text-lg md:text-xl">calendar_today</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 pb-32 flex flex-col gap-6 max-w-2xl mx-auto w-full">
          <div className="bg-slate-900 text-white rounded-[32px] md:rounded-[48px] p-8 md:p-12 shadow-2xl shadow-slate-300 relative overflow-hidden flex flex-col items-center justify-center min-h-[180px] md:min-h-[240px]">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-3xl"></div>
            
            <div className="relative z-10 w-full flex flex-col items-center">
              <div className="px-4 py-1.5 bg-white/10 rounded-full border border-white/5 mb-6">
                <span className="text-[9px] font-black uppercase   opacity-60">
                  {selectedMonth.replace('-', '/')}
                </span>
              </div>
              
              <div className="text-center space-y-1 mb-6 md:mb-10">
                <p className="text-[9px] font-black opacity-40 uppercase  ">إجمالي المستحق الصافي</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl md:text-6xl font-black  er leading-none">{Math.trunc(netSalary).toLocaleString()}</span>
                  <span className="text-xs md:text-sm font-black opacity-30 uppercase  ">IQD</span>
                </div>
              </div>

              <div className="w-full flex justify-between items-center px-2 md:px-6 opacity-40">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[8px] md:text-[10px] font-black uppercase  ">حساب دقيق</span>
                </div>
                <span className="text-[8px] md:text-[10px] font-black uppercase  ">{formatDateNumeric(new Date())}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[32px] md:rounded-[48px] shadow-sm border border-slate-50 overflow-hidden flex flex-col">
            <SalaryRow label="الراتب الأساسي" sub="قيمة العقد الشهرية" value={Math.trunc(baseSalary).toLocaleString()} />
            
            <SalaryRow 
              label="أيام الحضور" 
              sub="مجموع أيام العمل المسجلة" 
              value={attendanceCount.attended.toString()} 
              badge="يوم"
              badgeColor="bg-emerald-50 text-emerald-600 border border-emerald-100"
            />

            <SalaryRow 
              label="أيام الغياب" 
              sub="أيام عدم تسجيل حضور" 
              value={attendanceCount.absent.toString()} 
              badge="يوم"
              badgeColor="bg-red-50 text-[#E31E24] border border-red-100"
            />

            <SalaryRow 
              label="المكافآت" 
              sub="حوافز الأداء والانضباط" 
              value={bonus > 0 ? `+${Math.trunc(bonus).toLocaleString()}` : '0'} 
              valueColor="text-emerald-600" 
            />

            <SalaryRow 
              label="أجور إضافية" 
              sub="أجور العمل خارج أوقات المناوبة" 
              value={overtime > 0 ? `+${Math.trunc(overtime).toLocaleString()}` : '0'} 
              valueColor="text-blue-600" 
            />

            <SalaryRow 
              label="السلف المالية" 
              sub="المبالغ المسحوبة خلال الشهر" 
              value={advance > 0 ? `-${Math.trunc(advance).toLocaleString()}` : '0'} 
              valueColor="text-orange-600" 
            />

            <SalaryRow 
              label="الخصومات" 
              sub="العقوبات والتأخيرات المتكررة" 
              value={deduction > 0 ? `-${Math.trunc(deduction).toLocaleString()}` : '0'} 
              valueColor="text-red-600" 
            />
            
            <div className="flex justify-between items-center p-6 md:p-8 bg-white">
              <span className="text-sm md:text-lg font-black text-slate-900 uppercase  ">صافي الراتب النهائي</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl md:text-3xl font-black text-[#E31E24]  er">{Math.trunc(netSalary).toLocaleString()}</span>
                <span className="text-[10px] md:text-xs font-black text-[#E31E24] opacity-40 uppercase  ">IQD</span>
              </div>
            </div>
          </div>

          <button className="w-full py-5 border-2 border-dashed border-slate-200 text-slate-400 rounded-2xl md:rounded-[32px] font-black text-[10px] uppercase   hover:border-slate-300 hover:text-slate-900 hover:bg-white transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
            <span className="material-symbols-outlined text-lg">receipt_long</span>
            تحميل كشف الراتب (PDF)
          </button>
        </main>
      </div>
    </div>
  );
}

function SalaryRow({ label, sub, value, valueColor = 'text-slate-900', badge, badgeColor }: { label: string, sub: string, value: string, valueColor?: string, badge?: string, badgeColor?: string }) {
  return (
    <div className="flex justify-between items-center p-6 md:p-8 border-b border-slate-50 group hover:bg-white transition-colors">
      <div className="flex flex-col text-right">
        <span className="text-[9px] font-black text-slate-400 uppercase   mb-1">{label}</span>
        <span className="text-xs md:text-sm font-black text-slate-900  ">{sub}</span>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-baseline gap-1">
          <span className={`text-sm md:text-lg font-black ${valueColor}  er`}>{value}</span>
          {!badge && <span className="text-[9px] font-black opacity-30 uppercase  ">IQD</span>}
        </div>
        {badge && (
          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase   ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
