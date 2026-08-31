import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import { collection, query, where, limit, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Attendance, ActivityLog } from '../types';
import { useLocationTracking } from '../hooks/useLocationTracking';
import ManagerTools from '../components/ManagerTools';
import { formatTime12h, formatLiveClock, formatDateNumeric, getTodayBaghdadStr } from '../lib/timeUtils';
import { NotificationService } from '../services/NotificationService';

export default function EmployeeHomeScreen() {
  const { user, loading: authLoading, today: globalToday } = useAuth();
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [monthlyAttendance, setMonthlyAttendance] = useState<Attendance[]>([]);
  const [last30DaysAttendance, setLast30DaysAttendance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        setShowNotificationPrompt(true);
      }
    }
  }, []);

  const handleRequestPermission = async () => {
    const granted = await NotificationService.requestPermission();
    if (granted) {
      setShowNotificationPrompt(false);
    } else {
      // If still denied/default, it's likely blocked by iframe
      // We can show a hint
      alert('إذا لم يظهر طلب الإذن، يرجى فتح التطبيق في نافذة جديدة عبر الزر الموجود في أعلى يمين شاشة المعاينة.');
    }
  };

  // Live clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Activate automatic location tracking
  useLocationTracking(user);

  useEffect(() => {
    if (authLoading || !user) return;
    const fetchData = async () => {
        try {
          const today = getTodayBaghdadStr();
          const qToday = query(
            collection(db, 'attendance'),
            where('userId', '==', user.uid),
            where('date', '==', today),
            limit(1)
          );
          const snapToday = await getDocs(qToday);
          if (!snapToday.empty) {
            setAttendance({ id: snapToday.docs[0].id, ...snapToday.docs[0].data() } as Attendance);
          }

          // Fetch attendance for the current month in Baghdad
          const now = new Date();
          const baghdadNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
          const startOfMonth = new Date(baghdadNow);
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          
          const startOfMonthStr = startOfMonth.getFullYear() + '-' + String(startOfMonth.getMonth() + 1).padStart(2, '0') + '-01';

          const qMonthly = query(
            collection(db, 'attendance'),
            where('userId', '==', user.uid),
            where('date', '>=', startOfMonthStr)
          );
          
          const unsubscribeMonthly = onSnapshot(qMonthly, (snapshot) => {
            const records = snapshot.docs
              .map(doc => ({ id: doc.id, ...doc.data() } as Attendance))
              .sort((a, b) => b.date.localeCompare(a.date)); // Sort in memory
            setMonthlyAttendance(records);
            setLast30DaysAttendance(records.length); // Total days worked this month
            setLoading(false);
          }, (error) => {
            handleFirestoreError(error, OperationType.LIST, 'attendance');
            setLoading(false);
          });

          return () => unsubscribeMonthly();
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'attendance');
          setLoading(false);
        }
      };
      
      fetchData();
  }, [user, authLoading, globalToday]);

  if (!user) return null;

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen pb-24 pt-16 md:pt-20 selection:bg-[#E31E24]/10 selection:text-[#E31E24]">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(227,30,36,0.03),transparent_40%)] pointer-events-none"></div>
      <header className="bg-white/80 backdrop-blur-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b border-slate-100/50 shadow-sm">
        <div className="relative">
          <button 
            onClick={() => navigate('/employee/notifications')}
            className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-slate-50 transition-colors relative"
          >
            <span className="material-symbols-outlined text-slate-400 text-lg md:text-xl">notifications</span>
            <span className="absolute top-2 right-2 w-1.5 h-1.5 md:w-2 md:h-2 bg-[#E31E24] rounded-full border border-white"></span>
          </button>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="h-5 md:h-7 mb-0.5">
            <img src="/icon.png" alt="KUDO KUDO" className="h-full object-contain" />
          </div>
          <span className="text-[10px] md:text-xs font-black text-slate-900 tabular-nums leading-none">
            {formatLiveClock(currentTime)}
          </span>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="text-right hidden sm:block">
            <h4 className="text-xs font-bold text-slate-800 leading-none mb-1">{user.displayName || 'موظف كودو'}</h4>
            <p className="text-[10px] font-bold text-slate-400 opacity-70 uppercase  ">{user.jobTitle || 'موظف'}</p>
          </div>
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl overflow-hidden border border-slate-100 shadow-sm bg-slate-50">
            <img className="w-full h-full object-cover" src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=f8fafc&color=cbd5e1`} alt="Profile" />
          </div>
        </div>
      </header>

      <main className="p-4 md:p-10 space-y-6 md:space-y-10 max-w-7xl mx-auto">
        <AnimatePresence>
          {showNotificationPrompt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-blue-50 border border-blue-100 rounded-3xl p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden"
            >
              <div className="flex items-center gap-4 text-right">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined">notifications_active</span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-blue-900">تفعيل التنبيهات الذكية</h4>
                  <p className="text-[10px] md:text-xs font-bold text-blue-700 opacity-80">اسمح للتطبيق بإرسال تذكيرات بمواعيد الدوام والغياب.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  onClick={() => setShowNotificationPrompt(false)}
                  className="flex-1 md:flex-none px-5 py-2 text-blue-600 font-black text-xs hover:bg-blue-100/50 rounded-xl transition-colors"
                >
                  ليس الآن
                </button>
                <button
                  onClick={handleRequestPermission}
                  className="flex-1 md:flex-none px-6 py-2 bg-blue-600 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-200 active:scale-95 transition-transform"
                >
                  تفعيل الآن
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(user?.role === 'admin' || user?.role === 'supervisor') && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#E31E24] text-white p-6 rounded-[28px] md:rounded-[40px] shadow-xl shadow-red-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <span className="material-symbols-outlined text-white">admin_panel_settings</span>
              </div>
              <div className="text-right">
                <h3 className="font-black text-sm md:text-lg  ">وضع {user.role === 'admin' ? 'المسؤول' : 'المشرف'} مفعل</h3>
                <p className="text-[10px] md:text-xs font-bold opacity-70 uppercase  ">لديك صلاحيات إدارية محددة للنظام</p>
              </div>
            </div>
            <button 
              onClick={() => navigate('/admin/home')}
              className="bg-white text-[#E31E24] px-6 py-2.5 rounded-xl font-black text-xs md:text-sm shadow-sm active:scale-95 transition-transform"
            >
              دخول لوحة الإدارة
            </button>
          </motion.div>
        )}

        {user?.role === 'manager' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full"
          >
            <ManagerTools manager={user} />
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
          {/* Main Actions Area */}
      <div className="md:col-span-5 flex flex-col gap-6 md:gap-10">
            {/* Attendance Registration Card */}
            <section className="bg-white rounded-[28px] md:rounded-[48px] p-6 md:p-10 shadow-sm border border-slate-50 flex flex-col items-center justify-center text-center space-y-5 md:space-y-6">
              <div className="w-20 h-20 md:w-28 md:h-28 bg-red-50 rounded-2xl md:rounded-[40px] flex items-center justify-center border-4 border-white shadow-xl shadow-red-100/50 transition-all hover:scale-105">
                <span className="material-symbols-outlined text-4xl md:text-6xl text-[#E31E24] filled-icon">face</span>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg md:text-3xl font-black text-slate-900  ">تسجيل الحضور</h2>
                <p className="text-[10px] md:text-sm text-slate-400 font-bold px-2 leading-relaxed opacity-60 uppercase  ">يرجى استخدام بصمة الوجه لتسجيل حضورك اليوم داخل نطاق الفرع.</p>
              </div>
              
              <button 
                onClick={() => navigate('/employee/attendance')}
                className="w-full py-4 md:py-6 bg-[#E31E24] text-white rounded-2xl md:rounded-3xl font-black text-sm md:text-xl shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] uppercase  "
              >
                تفعيل البصمة الآن
              </button>

              <div className="flex items-center gap-2 text-green-600 bg-green-50/50 px-4 py-2 rounded-full text-[10px] font-bold border border-green-100 shadow-sm transition-all hover:bg-green-50">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                أنت داخل النطاق المسموح
              </div>
            </section>

            {/* Monthly Progress Card */}
            <section className="bg-slate-900 rounded-[32px] md:rounded-[48px] p-6 md:p-10 text-white relative overflow-hidden shadow-2xl shadow-slate-200">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/5 rounded-full blur-3xl"></div>
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-full flex justify-between items-center mb-8 md:mb-12">
                  <span className="text-[9px] md:text-[10px] font-black opacity-40 uppercase  ">تحليلات الأداء</span>
                  <h3 className="text-base md:text-xl font-black   opacity-90">مؤشر 30 يوم</h3>
                </div>
                
                <div className="text-center mb-6 md:mb-10">
                  <div className="text-5xl md:text-7xl font-black text-white mb-2  er">
                    {last30DaysAttendance} <span className="text-xl md:text-3xl font-black opacity-20 mx-1">/</span> <span className="text-2xl md:text-4xl opacity-40 font-black">30</span>
                  </div>
                  <div className="text-[9px] md:text-[10px] font-black opacity-40 uppercase  ">أيام العمل المنجزة</div>
                </div>

                <div className="w-full bg-white/10 h-2.5 md:h-3.5 rounded-full mb-8 md:mb-12 overflow-hidden border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(last30DaysAttendance / 30) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className="h-full bg-[#E31E24] rounded-full shadow-[0_0_20px_rgba(227,30,36,0.6)]" 
                  ></motion.div>
                </div>

                <div className="w-full grid grid-cols-3 gap-3 md:gap-4">
                  <StatusItem color="bg-[#E31E24]" label="حضور" shadow="shadow-red-500/20" />
                  <StatusItem color="bg-slate-600" label="غياب" shadow="" />
                  <StatusItem color="bg-green-500" label="إجازة" shadow="shadow-green-500/20" />
                </div>
              </div>
            </section>
          </div>

          {/* Secondary Actions & Logs */}
          <div className="md:col-span-7 flex flex-col gap-6 md:gap-10">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
              <QuickAction 
                onClick={() => navigate('/employee/salary')}
                icon="payments" 
                label="الراتب" 
                color="bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600" 
              />
              <QuickAction 
                onClick={() => (user?.role === 'admin' || user?.role === 'supervisor') ? navigate('/admin/home') : navigate('/employee/requests', { state: { type: 'advance' } })}
                icon="admin_panel_settings" 
                label={(user?.role === 'admin' || user?.role === 'supervisor') ? 'الإدارة' : 'الطلبات'} 
                color="bg-slate-50 text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-600" 
              />
              <QuickAction 
                onClick={() => navigate('/employee/chat')}
                icon="chat" 
                label="الدردشة" 
                color="bg-slate-50 text-slate-400 group-hover:bg-purple-50 group-hover:text-purple-600" 
              />
            </div>

            <section className="bg-white rounded-[32px] md:rounded-[48px] p-6 md:p-10 shadow-sm border border-slate-50 flex-1 flex flex-col min-h-[400px]">
              <div className="flex justify-between items-start mb-8 md:mb-12">
                <div className="space-y-1">
                  <h3 className="text-xl md:text-2xl font-black text-slate-900  ">سجل الحضور الشهري</h3>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                    <p className="text-[10px] text-slate-400 font-black uppercase   opacity-60">
                      البدء: {formatTime12h(user?.shiftStart || "09:00")}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4 flex-1">
                {monthlyAttendance.length > 0 ? (
                  monthlyAttendance.map((record, idx) => (
                    <motion.div 
                      key={record.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="flex items-center gap-5 p-5 rounded-[28px] bg-white border border-slate-100 hover:shadow-xl hover:shadow-slate-200/50 transition-all cursor-default group"
                    >
                      <div className={`w-12 h-12 ${record.status === 'late' ? 'bg-amber-50 text-amber-500' : 'bg-green-50 text-green-500'} rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                        <span className="material-symbols-outlined filled-icon text-2xl">
                          {record.status === 'late' ? 'warning' : 'check_circle'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-slate-700 text-sm">
                            {formatDateNumeric(record.date)}
                          </span>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase  er ${record.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {record.status === 'late' ? 'متأخر' : 'منتظم'}
                          </span>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                            <span className="material-symbols-outlined text-sm opacity-50">login</span>
                            <span>{formatTime12h(record.checkInTime)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                            <span className="material-symbols-outlined text-sm opacity-50">logout</span>
                            <span>{record.checkOutTime ? formatTime12h(record.checkOutTime) : '--:--'}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center flex-1 text-slate-300 gap-5 opacity-40 py-12">
                    <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl">calendar_month</span>
                    </div>
                    <p className="font-bold text-sm">لا يوجد سجلات حضور لهذا الشهر</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatusItem({ color, label, shadow }: { color: string; label: string; shadow: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`w-3.5 h-3.5 rounded-full ${color} ${shadow} border-2 border-white/10`}></div>
      <span className="text-[10px] font-bold opacity-40 uppercase  ">{label}</span>
    </div>
  );
}

function QuickAction({ onClick, icon, label, color }: { onClick: () => void; icon: string; label: string; color: string }) {
  return (
    <motion.button 
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="bg-white p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-50 shadow-sm hover:shadow-md transition-all flex flex-col items-center gap-3 md:gap-4 text-center group"
    >
      <div className={`w-11 h-11 md:w-14 md:h-14 ${color} rounded-xl md:rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105`}>
        <span className="material-symbols-outlined text-xl md:text-2xl">{icon}</span>
      </div>
      <span className="text-[9px] md:text-[11px] font-black text-slate-600 uppercase  ">{label}</span>
    </motion.button>
  );
}
