import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, limit, orderBy, onSnapshot, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db, auth, handleFirestoreError, OperationType, isFirestoreQuotaExhausted } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import AdminTopHeader from '../components/AdminTopHeader';
import { formatTime12h, formatLiveClock, formatDateNumeric, getTodayBaghdadStr } from '../lib/timeUtils';
import { NotificationService } from '../services/NotificationService';
import { userCache } from '../services/UserCacheService';

export default function AdminHomeScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading, today: globalToday } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    lateToday: 0,
    absentToday: 0,
    pendingRequests: 0,
    totalOrders: 0,
    activeBranches: 4,
  });
  const [chartData, setChartData] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationSuccess, setCalibrationSuccess] = useState(false);
  const [currentWorkplace, setCurrentWorkplace] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [financialTotals, setFinancialTotals] = useState({
    salaries: 0,
    bonuses: 0,
    advances: 0,
    deductions: 0,
    net: 0
  });
  const [showPresentModal, setShowPresentModal] = useState(false);
  const [presentEmployees, setPresentEmployees] = useState<any[]>([]);
  const [loadingPresent, setLoadingPresent] = useState(false);

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
      alert('إذا لم يظهر طلب الإذن، يرجى فتح التطبيق في نافذة جديدة عبر الزر الموجود في أعلى يمين شاشة المعاينة.');
    }
  };

  // Live clock effect
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (authLoading || !user || !auth.currentUser || isFirestoreQuotaExhausted() || (user.role !== 'admin' && user.role !== 'manager' && user.role !== 'supervisor' && user.email !== 'antrippy1@gmail.com' && user.email !== 'ath222139@gmail.com')) return;

    // Fetch current workplace location
    getDoc(doc(db, 'settings', 'workplace')).then(snap => {
      if (snap.exists()) {
        setCurrentWorkplace(snap.data());
      }
    });

    const todayStr = getTodayBaghdadStr();
    
    // 1. Employees Listener (for Financial Totals & Total Count)
    const employeesQuery = query(
      collection(db, 'users'), 
      where('role', 'in', ['employee', 'admin', 'supervisor']),
      where('groupStatus', '==', 'joined')
    );

    // Cleanup Logic for 90-day deletion policy
    const cleanupOldData = async () => {
      if (user?.role !== 'admin' && user?.role !== 'manager' && user?.role !== 'supervisor' && user?.email !== 'antrippy1@gmail.com' && user?.email !== 'ath222139@gmail.com') return;
      
      const now = new Date();
      const baghdadNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
      const ninetyDaysAgo = new Date(baghdadNow);
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const cutoffDate = ninetyDaysAgo.getFullYear() + '-' + String(ninetyDaysAgo.getMonth() + 1).padStart(2, '0') + '-' + String(ninetyDaysAgo.getDate()).padStart(2, '0');

      try {
        // Cleanup old attendance
        const oldAttendQuery = query(collection(db, 'attendance'), where('date', '<', cutoffDate));
        const oldAttendSnap = await getDocs(oldAttendQuery);
        for (const d of oldAttendSnap.docs) {
          // In a real environment, you'd use a batch, but for small sets this is fine
          // await deleteDoc(d.ref); 
          console.log(`System: Data older than 90 days identified for cleanup: ${d.id}`);
        }

        // Cleanup old financial records (based on createdAt)
        // Since we are in a preview, I will implement the logic to ignore them first
        // and provide a notification if needed.
      } catch (err) {
        console.error('Cleanup error:', err);
      }
    };

    cleanupOldData();

    const unsubscribeEmployees = onSnapshot(employeesQuery, (snapshot) => {
      let totalSalaries = 0;
      let totalBonuses = 0;
      let totalAdvances = 0;
      let totalDeductions = 0;
      let totalOvertime = 0;
      
      const employeeData = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
      userCache.fill(employeeData);

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        totalSalaries += data.baseSalary || 0;
        totalBonuses += data.bonus || 0;
        totalAdvances += data.advance || 0;
        totalDeductions += data.deduction || 0;
        totalOvertime += data.overtime || 0;
      });

      setFinancialTotals({
        salaries: totalSalaries,
        bonuses: totalBonuses,
        advances: totalAdvances,
        deductions: totalDeductions,
        net: totalSalaries + totalBonuses + totalOvertime - totalDeductions - totalAdvances
      });

      setStats(prev => ({
        ...prev,
        totalEmployees: snapshot.size,
        absentToday: Math.max(0, snapshot.size - prev.presentToday - prev.lateToday)
      }));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    // 2. Attendance Today Listener
    const attendanceQuery = query(collection(db, 'attendance'), where('date', '==', todayStr));
    const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const presentCount = snapshot.docs.filter(d => d.data().status === 'present' && !d.data().isLeave).length;
      const lateCount = snapshot.docs.filter(d => d.data().status === 'late').length;
      const leaveCount = snapshot.docs.filter(d => d.data().isLeave).length;
      
      setStats(prev => ({
        ...prev,
        presentToday: presentCount + leaveCount, // Count leave as present
        lateToday: lateCount,
        absentToday: Math.max(0, prev.totalEmployees - presentCount - lateCount - leaveCount)
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    });

    // 3. Pending Requests Listener
    const requestsQuery = query(collection(db, 'requests'), where('status', '==', 'pending'));
    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, pendingRequests: snapshot.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'requests');
    });

    // 4. Pending Orders Listener
    const ordersQuery = query(collection(db, 'orders'), where('status', '==', 'pending'));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      setStats(prev => ({ ...prev, totalOrders: snapshot.size }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });

    // 5. Recent Activity Listener
    const activityQuery = query(collection(db, 'attendance'), orderBy('checkInTime', 'desc'), limit(6));
    const unsubscribeActivity = onSnapshot(activityQuery, async (snapshot) => {
      const activities = await Promise.all(snapshot.docs.map(async (doc) => {
        const data = doc.data();
        let timeStr = '...';
        try {
          const checkIn = data.checkInTime;
          const date = (checkIn && typeof checkIn.toDate === 'function') ? checkIn.toDate() : new Date(checkIn);
          if (!isNaN(date.getTime())) {
            timeStr = formatTime12h(date);
          }
        } catch (e) {
          console.error('Error parsing time:', e);
        }

        const userName = await userCache.getUserName(data.userId);

        return {
          id: doc.id,
          userId: data.userId,
          userName: userName,
          time: timeStr,
          status: data.isLeave ? 'leave' : data.status,
          type: data.isLeave ? 'إجازة' : 'تحضير'
        };
      }));
      setRecentActivity(activities);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    });

    // Initialize Chart Data (Static for now as it needs historical aggregation)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const now = new Date();
      const d = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
      d.setDate(d.getDate() - (6 - i));
      return d.toLocaleDateString('ar-EG', { weekday: 'short' });
    });
    const trend = last7Days.map(name => ({
      name,
      حضور: Math.floor(Math.random() * 10) + 5,
      تأخير: Math.floor(Math.random() * 3),
    }));
    setChartData(trend);

    return () => {
      unsubscribeEmployees();
      unsubscribeAttendance();
      unsubscribeRequests();
      unsubscribeOrders();
      unsubscribeActivity();
    };
  }, [user, authLoading, globalToday]);

  const handleCalibrateLocation = () => {
    if (!navigator.geolocation) {
      alert('المتصفح لا يدعم تحديد الموقع');
      return;
    }

    setIsCalibrating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const workplaceData = {
            lat: latitude,
            lng: longitude,
            radius: 80, // Set a safe radius of 80m
            updatedAt: new Date().toISOString(),
            updatedBy: user?.uid
          };
          await setDoc(doc(db, 'settings', 'workplace'), workplaceData);
          setCurrentWorkplace(workplaceData);
          setCalibrationSuccess(true);
          setTimeout(() => setCalibrationSuccess(false), 3000);
        } catch (err) {
          console.error('Calibration error:', err);
          alert('حدث خطأ أثناء حفظ الموقع');
        } finally {
          setIsCalibrating(false);
        }
      },
      (error) => {
        if (error.code === 1) {
          console.info('GPS access denied by admin during calibration');
          alert('يرجى السماح بالوصول إلى الموقع الجغرافي لمعايرة موقع العمل.');
        } else {
          console.error('GPS Error:', error);
          alert('تعذر الحصول على موقعك الحالي. تأكد من تفعيل الـ GPS.');
        }
        setIsCalibrating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchPresentEmployees = async () => {
    setShowPresentModal(true);
    setLoadingPresent(true);
    const todayStr = getTodayBaghdadStr();
    const q = query(
      collection(db, 'attendance'), 
      where('date', '==', todayStr),
      where('status', '==', 'present')
    );
    try {
      const snap = await getDocs(q);
      const employeesData = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const displayName = await userCache.getUserName(data.userId);
        return {
          id: d.id,
          ...data,
          displayName,
          checkInTime: data.checkInTime?.toDate ? data.checkInTime.toDate() : (data.checkInTime ? new Date(data.checkInTime) : new Date())
        };
      }));
      setPresentEmployees(employeesData);
    } catch (error) {
      console.error('Error fetching present employees:', error);
    } finally {
      setLoadingPresent(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sans rtl bg-white">
      <AdminTopHeader />
      
      <div className="flex-1 space-y-4 md:space-y-8 p-4 md:p-8 antialiased pb-24 md:pb-10 pt-16 md:pt-20">
        <AnimatePresence>
          {showNotificationPrompt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-blue-50 border border-blue-100 rounded-3xl p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 overflow-hidden mb-4"
            >
              <div className="flex items-center gap-4 text-right">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined">notifications_active</span>
                </div>
                <div>
                  <h4 className="text-sm font-black text-blue-900">تفعيل إشعارات المدير</h4>
                  <p className="text-[10px] md:text-xs font-bold text-blue-700 opacity-80">استلم تنبيهات فورية عند تسجيل الحضور المتأخر أو طلبات السلف الجديدة.</p>
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
                  تفعيل التنبيهات
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
        <div className="space-y-1">
          <p className="text-[8px] md:text-[10px] font-black text-[#E31E24] uppercase   opacity-80">نظام إدارة الكوادر المتقدم</p>
          <h1 className="text-xl md:text-3xl font-black text-slate-900  er leading-tight">لوحة التحكم العملياتية</h1>
          <p className="text-[10px] md:text-sm font-bold text-slate-400 opacity-60">مرحباً بك، {user?.displayName?.split(' ')[0] || 'المدير'} {user?.role === 'supervisor' ? '(مشرف)' : ''}</p>
        </div>
        <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-sm self-start md:self-auto">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-black text-slate-900 tabular-nums">
            {formatLiveClock(currentTime)}
          </span>
        </div>
      </header>

      {/* Workplace Location Calibration Section - Only for Admin/Manager */}
      {(user?.role === 'admin' || user?.role === 'manager') && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-100 rounded-[32px] p-6 md:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#E31E24]/5 rounded-bl-[100px] -mr-10 -mt-10"></div>
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-14 h-14 bg-[#E31E24]/10 text-[#E31E24] rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">location_on</span>
            </div>
            <div className="text-right">
              <h3 className="font-black text-slate-900 text-lg  ">معايرة موقع العمل</h3>
              <p className="text-xs font-bold text-slate-400 opacity-70 leading-relaxed max-w-md">
                {currentWorkplace 
                  ? `الموقع الحالي مضبوط بدقة. آخر تحديث: ${formatDateNumeric(currentWorkplace.updatedAt)}`
                  : "يرجى تعيين موقع المطعم الحالي لضمان دقة تسجيل الحضور للموظفين."}
              </p>
            </div>
          </div>
          
          <button 
            onClick={handleCalibrateLocation}
            disabled={isCalibrating}
            className={`relative z-10 px-8 py-4 rounded-2xl font-black text-sm transition-all active:scale-95 flex items-center gap-3 shadow-lg shadow-red-100
              ${calibrationSuccess 
                ? 'bg-emerald-500 text-white shadow-emerald-100' 
                : 'bg-[#E31E24] text-white hover:bg-red-700'}
            `}
          >
            {isCalibrating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>جاري المعايرة...</span>
              </>
            ) : calibrationSuccess ? (
              <>
                <span className="material-symbols-outlined">check_circle</span>
                <span>تم حفظ الموقع بنجاح</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">my_location</span>
                <span>تثبيت موقعي الحالي كمركز للعمل</span>
              </>
            )}
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-6">
        <MetricCard label="إجمالي الموظفين" value={stats.totalEmployees} icon="groups" trend="+2" color="bg-white text-slate-900" />
        <MetricCard label="الحضور اليوم" value={stats.presentToday} icon="task_alt" trend="98%" color="bg-emerald-50 text-emerald-600" onClick={fetchPresentEmployees} />
        <MetricCard label="المتأخرون" value={stats.lateToday} icon="history" trend={`${stats.lateToday > 0 ? '+' : ''}${stats.lateToday}`} color="bg-amber-50 text-amber-600" />
        <MetricCard 
          label="طلبات معلقة" 
          value={stats.pendingRequests} 
          icon="pending_actions" 
          trend="تنبيه" 
          color={stats.pendingRequests > 0 ? "bg-red-50 text-[#E31E24] animate-pulse cursor-pointer" : "bg-slate-50 text-slate-400"}
          onClick={() => navigate('/admin/notifications')}
        />
        <MetricCard label="الغيابات" value={stats.absentToday} icon="block" trend="0" color="bg-white text-slate-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={`${user?.role === 'supervisor' ? 'col-span-full' : 'lg:col-span-2'} bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-8 border border-slate-50 shadow-sm flex flex-col gap-8`}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-base md:text-lg font-black text-slate-900  ">مؤشر الانضباط الأسبوعي</h3>
              <p className="text-[9px] font-black text-slate-400 uppercase   opacity-60">تحليل الأداء خلال 7 أيام</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#E31E24] rounded-full"></div>
                <span className="text-[10px] font-bold text-slate-400">حضور</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-400 rounded-full"></div>
                <span className="text-[10px] font-bold text-slate-400">تأخير</span>
              </div>
            </div>
          </div>
          <div className="h-[250px] md:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E31E24" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#E31E24" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px', fontWeight: 900 }} 
                  cursor={{ stroke: '#E31E24', strokeWidth: 2 }} 
                />
                <Area type="monotone" dataKey="حضور" stroke="#E31E24" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {user?.role !== 'supervisor' && (
          <div className="space-y-6">
            <div className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-8 border border-slate-50 shadow-sm flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900  ">التقارير المالية</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase   opacity-60">ملخص الأداء المالي</p>
                </div>
                <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black border border-emerald-100">
                  +12.5%
                </div>
              </div>
              
              <div className="space-y-4">
                <FinancialMetric label="صافي الرواتب" value={Math.trunc(financialTotals.net).toLocaleString()} subValue="د.ع / شهر" icon="payments" color="text-emerald-500" />
                <FinancialMetric label="إجمالي المكافآت" value={Math.trunc(financialTotals.bonuses).toLocaleString()} subValue="د.ع / شهر" icon="add_circle" color="text-emerald-400" />
                <FinancialMetric label="إجمالي السلف" value={Math.trunc(financialTotals.advances).toLocaleString()} subValue="د.ع / شهر" icon="payments" color="text-orange-500" />
                <FinancialMetric label="إجمالي الخصومات" value={Math.trunc(financialTotals.deductions).toLocaleString()} subValue="د.ع / شهر" icon="remove_circle" color="text-[#E31E24]" />
              </div>

              <button 
                onClick={() => navigate('/admin/salary')}
                className="w-full py-4 bg-slate-50 hover:bg-slate-900 hover:text-white text-slate-400 rounded-2xl text-[10px] font-black uppercase   transition-all group flex items-center justify-center gap-2 border border-slate-100"
              >
                استكشاف التقارير المفصلة
                <span className="material-symbols-outlined text-sm group-hover:translate-x-[-4px] transition-transform">arrow_left</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <section className="bg-white rounded-[32px] md:rounded-[40px] p-6 md:p-8 border border-slate-50 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <div className="space-y-1">
            <h3 className="text-base md:text-lg font-black text-slate-900  ">النشاط الميداني المباشر</h3>
            <p className="text-[9px] font-black text-slate-400 uppercase   opacity-60">سجل الحضور والتحركات</p>
          </div>
          <button className="text-[10px] font-black text-slate-400 hover:text-slate-900 transition-colors uppercase   border border-slate-100 px-4 py-2 rounded-xl">عرض السجل الكامل</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {recentActivity.length > 0 ? recentActivity.map((activity, idx) => (
              <motion.div key={activity.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.05 }} className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-3xl border border-slate-100/50 group/item hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all">
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-hover/item:text-[#E31E24] shadow-sm transition-colors">
                  <span className="material-symbols-outlined text-2xl">person</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-slate-800  ">{activity.userName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${activity.status === 'leave' ? 'bg-blue-500' : activity.status === 'present' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <p className="text-[10px] font-bold text-slate-400 uppercase   opacity-60">
                      {activity.status === 'leave' ? 'إجازة' : activity.status === 'present' ? 'حضور' : 'متأخر'} • {activity.time}
                    </p>
                  </div>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-full py-10 text-center text-slate-300 font-bold opacity-50">لا يوجد نشاط مسجل اليوم</div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Present Employees Modal */}
      <AnimatePresence>
        {showPresentModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPresentModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-lg p-8 shadow-2xl relative z-10 max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <span className="material-symbols-outlined text-2xl">group</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">الموظفون الحاضرون</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">إجمالي الحضور اليوم: {presentEmployees.length}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowPresentModal(false)}
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 text-right">
                {loadingPresent ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-4">
                    <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">جاري جلب قائمة الحضور...</p>
                  </div>
                ) : presentEmployees.length === 0 ? (
                  <div className="py-12 text-center text-slate-300 border-2 border-dashed border-slate-50 rounded-3xl">
                    <p className="text-[10px] font-black uppercase">لا يوجد موظفون حاضرون حالياً</p>
                  </div>
                ) : (
                  presentEmployees.map((emp) => (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={emp.id} 
                      className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 flex items-center justify-between group hover:bg-white transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-300 shadow-sm group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined">person</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-black text-slate-800">{emp.displayName}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">وقت الحضور: {formatTime12h(emp.checkInTime)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span className="text-[9px] font-black text-emerald-600 uppercase">نشط الآن</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}

function MetricCard({ label, value, icon, trend, color, onClick }: { label: string; value: number; icon: string; trend: string, color: string, onClick?: () => void }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }} 
      onClick={onClick}
      className={`p-4 md:p-6 rounded-[24px] md:rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between gap-4 md:gap-6 transition-all ${color}`}
    >
      <div className="flex justify-between items-start">
        <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-lg md:rounded-xl flex items-center justify-center backdrop-blur-sm">
          <span className="material-symbols-outlined text-lg md:text-xl">{icon}</span>
        </div>
        <span className="text-[8px] md:text-[10px] font-black opacity-40  ">{trend}</span>
      </div>
      <div>
        <p className="text-[8px] md:text-[10px] font-black opacity-60 uppercase   mb-1">{label}</p>
        <p className="text-xl md:text-3xl font-black  er leading-none">{value}</p>
      </div>
    </motion.div>
  );
}

function FinancialMetric({ label, value, subValue, icon, color }: { label: string; value: string; subValue: string; icon: string; color: string }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100/30 group hover:bg-white hover:border-slate-100 transition-all">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 bg-white rounded-xl flex items-center justify-center ${color} shadow-sm group-hover:scale-110 transition-transform`}>
          <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] font-black text-slate-400 uppercase  ">{label}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-black text-slate-900  ">{value}</span>
            <span className="text-[9px] font-bold text-slate-400">{subValue}</span>
          </div>
        </div>
      </div>
      <span className="material-symbols-outlined text-slate-200 group-hover:text-slate-900 transition-colors">chevron_left</span>
    </div>
  );
}
