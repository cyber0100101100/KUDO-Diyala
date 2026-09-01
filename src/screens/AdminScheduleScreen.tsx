import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { User } from '../types';
import { useAuth } from '../hooks/useAuth';
import { formatTime12h, formatDateNumeric, getBaghdadTime } from '../lib/timeUtils';
import AdminTopHeader from '../components/AdminTopHeader';

interface ScheduleEntry {
  userId: string;
  userName: string;
  role: string;
  workType: 'shift' | 'half-shift';
  startTime: string;
  endTime: string;
  profileImageUrl?: string;
}

export default function AdminScheduleScreen() {
  const { user, loading: authLoading, today: globalToday } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(getBaghdadTime());
  
  // Modal Form State
  const [modalUserId, setModalUserId] = useState('');
  const [modalWorkType, setModalWorkType] = useState<'shift' | 'half-shift'>('shift');
  const [modalStartTime, setModalStartTime] = useState('08:00');
  const [modalEndTime, setModalEndTime] = useState('16:00');

  useEffect(() => {
    setCurrentDate(getBaghdadTime());
  }, [globalToday]);

  useEffect(() => {
    async function fetchEmployees() {
      if (authLoading || !user || !auth.currentUser) return;
      const path = 'users';
      try {
        const q = query(
          collection(db, path), 
          where('role', 'in', ['employee', 'admin', 'supervisor']),
          where('groupStatus', '==', 'joined')
        );
        const snap = await getDocs(q);
        const fetchedEmployees = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
        
        // Filter out supervisors/admins if the current user is a supervisor
        if (user.role === 'supervisor') {
          setEmployees(fetchedEmployees.filter(emp => emp.role === 'employee'));
        } else {
          setEmployees(fetchedEmployees);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, path);
      } finally {
        setLoading(false);
      }
    }
    fetchEmployees();
  }, [user, authLoading]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  };

  const adjustDate = (days: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const handleAddEntry = () => {
    const emp = employees.find(e => e.uid === modalUserId);
    if (!emp) return;

    const newEntry: ScheduleEntry = {
      userId: emp.uid,
      userName: emp.displayName,
      role: emp.jobTitle || 'موظف',
      workType: modalWorkType,
      startTime: modalStartTime,
      endTime: modalEndTime,
      profileImageUrl: emp.profileImageUrl
    };

    setSelectedEntries([...selectedEntries, newEntry]);
    setIsModalOpen(false);
    resetModal();
  };

  const resetModal = () => {
    setModalUserId('');
    setModalWorkType('shift');
    setModalStartTime('08:00');
    setModalEndTime('16:00');
  };

  const removeEntry = (userId: string) => {
    setSelectedEntries(selectedEntries.filter(e => e.userId !== userId));
  };

  const handleSave = async () => {
    if (selectedEntries.length === 0) return;
    const schedulePath = 'schedules';
    const notificationPath = 'notifications';

    const { isFirestoreQuotaExhausted, setFirestoreQuotaExhausted } = await import('../lib/firebase');
    if (isFirestoreQuotaExhausted()) {
      alert('عذراً، تم تجاوز حد العمليات المسموح به اليوم. يرجى المحاولة لاحقاً.');
      return;
    }

    try {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const displayDate = formatDateNumeric(currentDate);
      
      // Save individual schedule entries for better querying and notification tracking
      for (const entry of selectedEntries) {
        await addDoc(collection(db, schedulePath), {
          userId: entry.userId,
          userName: entry.userName,
          date: dateStr,
          startTime: entry.startTime,
          endTime: entry.endTime,
          status: 'scheduled',
          createdAt: serverTimestamp(),
          notificationsSent: {
            scheduled: true, // First notification: Scheduled for tomorrow
            halfHour: false,
            tenMin: false,
            fiveMin: false,
            start: false,
            tenMinLate: false,
            twentyMinLate: false
          }
        });

        // Send the "Scheduled for tomorrow" notification immediately
        await addDoc(collection(db, notificationPath), {
          userId: entry.userId,
          title: 'تنبيه: أنت مضاف لجدول العمل',
          message: `لقد تمت إضافتك لجدول عمل يوم ${displayDate} من ${formatTime12h(entry.startTime)} إلى ${formatTime12h(entry.endTime)}`,
          type: 'attendance',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }

      // Send a global notification for the whole team
      const scheduleSummary = selectedEntries.map(e => `${e.userName} (${formatTime12h(e.startTime)} - ${formatTime12h(e.endTime)})`).join(' • ');
      
      await addDoc(collection(db, notificationPath), {
        userId: null, // Global
        title: `جدول العمل ليوم ${displayDate}`,
        message: `تم تحديث جدول العمل. الموظفون المجدولون: ${scheduleSummary}`,
        type: 'attendance',
        createdAt: serverTimestamp(),
        isRead: false,
        metadata: {
          scheduleDate: displayDate,
          title: `جدول يوم ${displayDate}`
        }
      });

      alert('تم حفظ ونشر الجدول وتنبيه الموظفين بنجاح');
      setSelectedEntries([]);
    } catch (error: any) {
      console.error("Save error:", error);
      if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota exceeded')) {
        const { setFirestoreQuotaExhausted } = await import('../lib/firebase');
        setFirestoreQuotaExhausted();
      }
      handleFirestoreError(error, OperationType.CREATE, schedulePath);
    }
  };

  const selectedEmployeeData = employees.find(e => e.uid === modalUserId);

  return (
    <div className="font-sans rtl flex flex-col min-h-screen bg-white antialiased pb-24 pt-16 md:pt-20">
      <AdminTopHeader title="جدول المجموعة" />

      <div className="max-w-md mx-auto w-full px-6 py-8 flex flex-col flex-1">
        {/* Date Selector */}
        <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between mb-8">
          <button onClick={() => adjustDate(-1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
          <div className="flex items-center gap-3">
            <span className="font-black text-slate-900 text-sm">{formatDateNumeric(currentDate)}</span>
            <span className="material-symbols-outlined text-[#E31E24] text-xl">calendar_today</span>
          </div>
          <button onClick={() => adjustDate(1)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors">
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
        </div>

        {/* Schedule Cards */}
        <div className="space-y-4 flex-1">
          <AnimatePresence mode="popLayout">
            {selectedEntries.map((entry) => (
              <motion.div
                key={entry.userId}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[24px] p-6 border border-red-50 shadow-sm flex items-center justify-between group relative"
              >
                <div className="text-right">
                  <h4 className="font-black text-slate-900 text-sm mb-0.5">{entry.userName}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase  ">{entry.role}</p>
                  <p className="text-[9px] font-black text-red-500 mt-1">{formatTime12h(entry.startTime)} - {formatTime12h(entry.endTime)}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-400  ">
                      {entry.workType === 'shift' ? 'شفت كامل' : 'نص شفت'}
                    </span>
                  </div>
                   <button 
                    onClick={() => removeEntry(entry.userId)}
                    className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center transition-all hover:bg-red-100"
                  >
                    <span className="material-symbols-outlined text-xl">delete</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {selectedEntries.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
              <span className="material-symbols-outlined text-6xl mb-4 opacity-20">event_busy</span>
              <p className="font-black text-sm text-slate-400">لا يوجد موظفين في هذا اليوم</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-4 mt-8">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full bg-[#E31E24] text-white py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 shadow-xl shadow-red-200 hover:bg-red-700 transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined">add</span>
            إضافة موظف
          </button>
          
          <button 
            onClick={handleSave}
            disabled={selectedEntries.length === 0}
            className="w-full bg-white text-[#E31E24] border-2 border-[#E31E24] py-5 rounded-2xl font-black text-sm flex items-center justify-center gap-3 hover:bg-red-50 transition-all active:scale-[0.98] disabled:opacity-50 disabled:border-slate-200 disabled:text-slate-300"
          >
            <span className="material-symbols-outlined">share</span>
            مشاركة الجدول في التنبيهات
          </button>
        </div>
      </div>

      {/* Add Employee Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] w-full max-w-md p-8 shadow-2xl relative z-10 overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="max-w-md mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center text-slate-400 bg-slate-50 rounded-full">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                  <h2 className="text-xl font-black text-slate-900">إضافة موظف إلى جدول غداً</h2>
                </div>

                <div className="space-y-6">
                  {/* Employee Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   block mr-2">اختيار الموظف</label>
                    <select 
                      value={modalUserId}
                      onChange={(e) => setModalUserId(e.target.value)}
                      className="w-full bg-slate-50 border border-red-50 rounded-2xl p-4 font-black text-sm focus:outline-none focus:border-[#E31E24] appearance-none"
                    >
                      <option value="">اختر موظفاً</option>
                      {employees
                        .filter(emp => !selectedEntries.some(entry => entry.userId === emp.uid))
                        .map(emp => (
                          <option key={emp.uid} value={emp.uid}>{emp.displayName}</option>
                        ))}
                    </select>
                  </div>

                  {/* Job Title (Auto) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   block mr-2">المنصب</label>
                    <input 
                      type="text"
                      readOnly
                      value={selectedEmployeeData?.jobTitle || 'يتم التعبئة تلقائياً'}
                      className="w-full bg-slate-50 border border-red-50 rounded-2xl p-4 font-black text-sm text-slate-400 cursor-not-allowed"
                    />
                  </div>

                  {/* Shift Type */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   block mr-2">نوع المناوبة</label>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setModalWorkType('shift')}
                        className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all ${modalWorkType === 'shift' ? 'bg-[#E31E24] text-white shadow-lg shadow-red-200' : 'bg-white border border-red-50 text-slate-600'}`}
                      >
                        شفت كامل
                      </button>
                      <button 
                        onClick={() => setModalWorkType('half-shift')}
                        className={`flex-1 py-4 rounded-2xl font-black text-sm transition-all ${modalWorkType === 'half-shift' ? 'bg-[#E31E24] text-white shadow-lg shadow-red-200' : 'bg-white border border-red-50 text-slate-600'}`}
                      >
                        نص شفت
                      </button>
                    </div>
                  </div>

                  {/* Time Range */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mr-2">من</label>
                      <div className="relative">
                        <input 
                          type="time"
                          value={modalStartTime}
                          onChange={(e) => setModalStartTime(e.target.value)}
                          className="w-full bg-slate-50 border border-red-50 rounded-2xl p-4 font-black text-sm focus:outline-none focus:border-[#E31E24] block"
                        />
                        <div className="mt-1 mr-2 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-red-500">schedule</span>
                          <span className="text-[10px] font-black text-red-500">{formatTime12h(modalStartTime)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase block mr-2">إلى</label>
                      <div className="relative">
                        <input 
                          type="time"
                          value={modalEndTime}
                          onChange={(e) => setModalEndTime(e.target.value)}
                          className="w-full bg-slate-50 border border-red-50 rounded-2xl p-4 font-black text-sm focus:outline-none focus:border-[#E31E24] block"
                        />
                        <div className="mt-1 mr-2 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px] text-red-500">schedule</span>
                          <span className="text-[10px] font-black text-red-500">{formatTime12h(modalEndTime)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleAddEntry}
                    disabled={!modalUserId}
                    className="w-full bg-[#E31E24] text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-red-200 hover:bg-red-700 transition-all active:scale-[0.98] mt-4 disabled:opacity-50"
                  >
                    تم
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
