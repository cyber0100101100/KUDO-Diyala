import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, query, where, getDocs, addDoc, updateDoc, 
  doc, serverTimestamp, orderBy, onSnapshot, limit 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { User, LeaveRequest, Schedule } from '../types';
import { formatTime12h, formatDateNumeric, getTodayBaghdadStr, getCurrentMonthBaghdadStr } from '../lib/timeUtils';

interface ManagerToolsProps {
  manager: User;
}

export default function ManagerTools({ manager }: ManagerToolsProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'requests' | 'employees'>('schedule');
  const [employees, setEmployees] = useState<User[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch employees in the same group or all if no group
    const fetchEmployees = async () => {
      let q = query(collection(db, 'users'), where('role', '==', 'employee'));
      if (manager.groupId) {
        q = query(q, where('groupId', '==', manager.groupId));
      }
      
      const unsubscribe = onSnapshot(q, (snap) => {
        const emps = snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
        setEmployees(emps);
      });
      return unsubscribe;
    };

    const fetchRequests = async () => {
      // Show pending requests
      const q = query(
        collection(db, 'requests'), 
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snap) => {
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
        // Filter by group if needed (if requests are group-specific)
        setRequests(reqs);
        setLoading(false);
      });
      return unsubscribe;
    };

    fetchEmployees();
    fetchRequests();
  }, [manager]);

  return (
    <section className="bg-white rounded-[32px] md:rounded-[48px] p-6 md:p-10 shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-slate-200">
            <span className="material-symbols-outlined">admin_panel_settings</span>
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900  ">أدوات الإدارة</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase   opacity-60">صلاحيات المسؤول مفعلة</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar pb-2">
        <TabButton active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon="calendar_month" label="الجداول" />
        <TabButton 
          active={activeTab === 'requests'} 
          onClick={() => setActiveTab('requests')} 
          icon="notifications_active" 
          label="الطلبات والتنبيهات" 
          count={requests.length} 
        />
        <TabButton active={activeTab === 'employees'} onClick={() => setActiveTab('employees')} icon="group" label="الموظفين" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="min-h-[300px]"
        >
          {activeTab === 'schedule' && <ScheduleTool manager={manager} employees={employees} />}
          {activeTab === 'requests' && (
            <div className="space-y-10">
              <AlertsTool manager={manager} />
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <span className="material-symbols-outlined text-slate-400">rebase_edit</span>
                  <h4 className="text-xs font-black text-slate-900 uppercase  ">طلبات الموظفين المعلقة</h4>
                </div>
                <RequestsTool manager={manager} requests={requests} />
              </div>
            </div>
          )}
          {activeTab === 'employees' && <EmployeesTool manager={manager} employees={employees} />}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: string; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition-all whitespace-nowrap ${
        active 
          ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' 
          : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
      }`}
    >
      <span className="material-symbols-outlined text-xl">{icon}</span>
      <span className="text-[11px] font-black uppercase  ">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${active ? 'bg-[#E31E24] text-white' : 'bg-slate-200 text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// --- SUB TOOLS ---

function ScheduleTool({ manager, employees }: { manager: User; employees: User[] }) {
  const [selectedEntries, setSelectedEntries] = useState<ScheduleEntry[]>([]);
  const [currentDate, setCurrentDate] = useState(getTodayBaghdadStr());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Modal State
  const [modalUserId, setModalUserId] = useState('');
  const [modalWorkType, setModalWorkType] = useState<'shift' | 'half-shift'>('shift');
  const [modalStartTime, setModalStartTime] = useState('09:00');
  const [modalEndTime, setModalEndTime] = useState('17:00');

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
    };

    setSelectedEntries([...selectedEntries, newEntry]);
    setIsModalOpen(false);
    setModalUserId('');
  };

  const handlePublish = async () => {
    if (selectedEntries.length === 0) return;
    setIsPublishing(true);
    try {
      const displayDate = formatDateNumeric(currentDate);
      
      for (const entry of selectedEntries) {
        // Create individual schedule
        await addDoc(collection(db, 'schedules'), {
          userId: entry.userId,
          userName: entry.userName,
          date: currentDate,
          startTime: entry.startTime,
          endTime: entry.endTime,
          status: 'scheduled',
          createdAt: serverTimestamp(),
          notificationsSent: { scheduled: true, halfHour: false, tenMin: false, fiveMin: false, start: false, tenMinLate: false, twentyMinLate: false }
        });

        // Notify employee
        await addDoc(collection(db, 'notifications'), {
          userId: entry.userId,
          title: 'جدول عمل جديد',
          message: `تم تحديد موعد عملك ليوم ${displayDate} من ${formatTime12h(entry.startTime)} إلى ${formatTime12h(entry.endTime)}`,
          type: 'attendance',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }

      // Global notification
      const summary = selectedEntries.map(e => `${e.userName} (${formatTime12h(e.startTime)}-${formatTime12h(e.endTime)})`).join(' • ');
      await addDoc(collection(db, 'notifications'), {
        userId: null,
        title: `جدول العمل ليوم ${displayDate}`,
        message: `تم تحديث جدول العمل بواسطة المسؤول ${manager.displayName}. الموظفون المجدولون: ${summary}`,
        type: 'attendance',
        createdAt: serverTimestamp(),
        isRead: false,
        metadata: {
          scheduleDate: displayDate,
          title: `جدول يوم ${displayDate}`,
          scheduleEntries: selectedEntries
        }
      });

      alert('تم نشر الجداول وتنبيه الموظفين بنجاح');
      setSelectedEntries([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'schedules');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[#E31E24]">calendar_today</span>
          <input 
            type="date" 
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="bg-transparent font-black text-xs outline-none"
          />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase  ">تاريخ الجدول</p>
      </div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {selectedEntries.map((entry) => (
            <motion.div
              layout
              key={entry.userId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between group"
            >
              <div className="text-right">
                <h4 className="text-xs font-black text-slate-900">{entry.userName}</h4>
                <p className="text-[9px] font-bold text-slate-400 uppercase  ">{formatTime12h(entry.startTime)} - {formatTime12h(entry.endTime)}</p>
              </div>
              <button 
                onClick={() => setSelectedEntries(prev => prev.filter(e => e.userId !== entry.userId))}
                className="w-8 h-8 rounded-lg bg-red-50 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <span className="material-symbols-outlined text-sm">delete</span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-[#E31E24] hover:text-[#E31E24] transition-all flex items-center justify-center gap-2 group"
        >
          <span className="material-symbols-outlined group-hover:scale-110 transition-transform">add_circle</span>
          <span className="text-xs font-black uppercase  ">إضافة موظف للجدول</span>
        </button>
      </div>
      
      <button 
        onClick={handlePublish}
        disabled={isPublishing || selectedEntries.length === 0}
        className="w-full py-5 bg-[#E31E24] text-white rounded-2xl font-black text-sm shadow-xl shadow-red-100 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
      >
        <span className="material-symbols-outlined">send</span>
        {isPublishing ? 'جاري النشر...' : 'نشر الجدول وتنبيه الجميع'}
      </button>

      {/* Add Employee Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[32px] md:rounded-[40px] p-6 md:p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined">close</span>
                </button>
                <h3 className="text-lg font-black text-slate-900">إضافة موظف</h3>
              </div>

              <div className="space-y-6">
                <div className="space-y-2 text-right">
                  <label className="text-[10px] font-black text-slate-400 uppercase   mr-2">الموظف</label>
                  <select 
                    value={modalUserId}
                    onChange={(e) => setModalUserId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-black text-xs outline-none focus:ring-2 focus:ring-red-100"
                  >
                    <option value="">اختر موظفاً</option>
                    {employees.filter(e => !selectedEntries.find(se => se.userId === e.uid)).map(emp => (
                      <option key={emp.uid} value={emp.uid}>{emp.displayName}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 text-right">
                    <label className="text-[10px] font-black text-slate-400 uppercase   mr-2">من</label>
                    <input 
                      type="time" 
                      value={modalStartTime}
                      onChange={(e) => setModalStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs font-black outline-none focus:ring-2 focus:ring-red-100"
                    />
                  </div>
                  <div className="space-y-2 text-right">
                    <label className="text-[10px] font-black text-slate-400 uppercase   mr-2">إلى</label>
                    <input 
                      type="time" 
                      value={modalEndTime}
                      onChange={(e) => setModalEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs font-black outline-none focus:ring-2 focus:ring-red-100"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleAddEntry}
                  disabled={!modalUserId}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-sm active:scale-95 transition-all disabled:opacity-50"
                >
                  إضافة للقائمة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ScheduleEntry {
  userId: string;
  userName: string;
  role: string;
  workType: 'shift' | 'half-shift';
  startTime: string;
  endTime: string;
}

function RequestsTool({ manager, requests }: { manager: User; requests: LeaveRequest[] }) {
  const handleAction = async (request: LeaveRequest, action: 'approved' | 'rejected' | 'forwarded_to_admin') => {
    try {
      const requestRef = doc(db, 'requests', request.id!);
      
      if (action === 'approved') {
        // If it's an advance, record it
        if (request.type === 'advance' && request.amount) {
          await addDoc(collection(db, 'financial_records'), {
            userId: request.userId,
            userName: request.reason.split('للموظف ')[1]?.split(' بقيمة')[0] || 'موظف', // Fallback
            bonus: 0,
            advance: request.amount,
            deduction: 0,
            overtime: 0,
            period: getCurrentMonthBaghdadStr(),
            reason: `سلفة موافق عليها من قبل المسؤول ${manager.displayName}`,
            createdAt: serverTimestamp(),
            createdBy: manager.uid
          });

          // Notify Super Admin
          await addDoc(collection(db, 'notifications'), {
            userId: 'antrippy1@gmail.com', // Primary Super Admin
            title: 'سلفة موافق عليها',
            message: `قام المسؤول ${manager.displayName} بالموافقة على سلفة للموظف بقيمة ${request.amount.toLocaleString()} د.ع`,
            type: 'salary',
            createdAt: serverTimestamp(),
            isRead: false
          });

          // Also notify the other Super Admin if they exist or just send to both
          await addDoc(collection(db, 'notifications'), {
            userId: 'ath222139@gmail.com', 
            title: 'سلفة موافق عليها',
            message: `قام المسؤول ${manager.displayName} بالموافقة على سلفة للموظف بقيمة ${request.amount.toLocaleString()} د.ع`,
            type: 'salary',
            createdAt: serverTimestamp(),
            isRead: false
          });
        }

        // Notify Employee
        await addDoc(collection(db, 'notifications'), {
          userId: request.userId,
          title: 'تمت الموافقة على طلبك',
          message: `وافق المسؤول ${manager.displayName} على طلبك: ${request.reason}`,
          type: 'request',
          createdAt: serverTimestamp(),
          isRead: false
        });
      }

      await updateDoc(requestRef, { 
        status: action,
        updatedBy: manager.uid,
        updatedAt: serverTimestamp()
      });

      if (action === 'forwarded_to_admin') {
        // Notify Super Admins about forwarding
        const superAdmins = ['antrippy1@gmail.com', 'ath222139@gmail.com'];
        for (const email of superAdmins) {
          await addDoc(collection(db, 'notifications'), {
            userId: email,
            title: 'طلب محول للمراجعة',
            message: `قام المسؤول ${manager.displayName} بتحويل طلب سلفة يتجاوز صلاحياته (المبلغ: ${request.amount?.toLocaleString()} د.ع)`,
            type: 'request',
            createdAt: serverTimestamp(),
            isRead: false
          });
        }
      }

    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'requests');
    }
  };

  return (
    <div className="space-y-4">
      {requests.length > 0 ? (
        requests.map(req => {
          const isAdvanceOverLimit = req.type === 'advance' && (req.amount || 0) > 40000;
          
          return (
            <div key={req.id} className="bg-slate-50/50 p-5 rounded-3xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  req.type === 'advance' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'
                }`}>
                  <span className="material-symbols-outlined">{req.type === 'advance' ? 'payments' : 'event_busy'}</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900">{req.reason}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase  ">{formatDateNumeric(req.createdAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isAdvanceOverLimit ? (
                  <button 
                    onClick={() => handleAction(req, 'forwarded_to_admin')}
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase   shadow-lg shadow-blue-100 active:scale-95 transition-all"
                  >
                    تحويل للمدير
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => handleAction(req, 'approved')}
                      className="px-6 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase   shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                    >
                      موافقة
                    </button>
                    <button 
                      onClick={() => handleAction(req, 'rejected')}
                      className="px-6 py-2.5 bg-white text-slate-400 border border-slate-100 rounded-xl text-[10px] font-black uppercase   active:scale-95 transition-all"
                    >
                      رفض
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-12 text-slate-300">
          <span className="material-symbols-outlined text-4xl mb-2 opacity-30">inbox</span>
          <p className="text-xs font-bold">لا يوجد طلبات معلقة حالياً</p>
        </div>
      )}
    </div>
  );
}

function EmployeesTool({ manager, employees }: { manager: User; employees: User[] }) {
  const [selectedEmp, setSelectedEmp] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [actionType, setActionType] = useState<'bonus' | 'deduction' | 'overtime' | 'advance'>('bonus');

  const handleAction = async () => {
    if (!selectedEmp || !amount) return;
    try {
      const val = parseFloat(amount);
      const record = {
        userId: selectedEmp.uid,
        userName: selectedEmp.displayName,
        bonus: actionType === 'bonus' ? val : 0,
        advance: actionType === 'advance' ? val : 0,
        deduction: actionType === 'deduction' ? val : 0,
        overtime: actionType === 'overtime' ? val : 0,
        period: getCurrentMonthBaghdadStr(),
        reason: reason || (actionType === 'bonus' ? 'مكافأة تشجيعية' : actionType === 'deduction' ? 'خصم إداري' : actionType === 'overtime' ? 'أجر إضافي' : 'سلفة نقدية'),
        createdAt: serverTimestamp(),
        createdBy: manager.uid
      };

      await addDoc(collection(db, 'financial_records'), record);

      // Notify employee
      await addDoc(collection(db, 'notifications'), {
        userId: selectedEmp.uid,
        title: 'تحديث مالي جديد',
        message: `قام المسؤول ${manager.displayName} بتسجيل ${record.reason} بقيمة ${val.toLocaleString()} د.ع`,
        type: 'salary',
        createdAt: serverTimestamp(),
        isRead: false
      });

      alert('تم تسجيل العملية بنجاح');
      setAmount('');
      setReason('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'financial_records');
    }
  };

  const handleTerminate = async (emp: User) => {
    if (!confirm(`هل أنت متأكد من فصل الموظف ${emp.displayName}؟`)) return;
    try {
      await updateDoc(doc(db, 'users', emp.uid), {
        enrollmentComplete: false,
        groupId: null,
        groupStatus: 'none'
      });
      alert('تم فصل الموظف بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'users');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase  ">قائمة الموظفين</h4>
        <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-2">
          {employees.map(emp => (
            <div 
              key={emp.uid} 
              onClick={() => setSelectedEmp(emp)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                selectedEmp?.uid === emp.uid ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-50 hover:border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-100">
                  <img src={emp.profileImageUrl || `https://ui-avatars.com/api/?name=${emp.displayName}`} className="w-full h-full object-cover" />
                </div>
                <span className="text-xs font-black">{emp.displayName}</span>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleTerminate(emp); }}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              >
                <span className="material-symbols-outlined text-sm text-red-500">person_remove</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase  ">إجراء مالي: {selectedEmp?.displayName || 'اختر موظفاً'}</h4>
        <div className="flex gap-2">
          {(['bonus', 'deduction', 'overtime', 'advance'] as const).map(t => (
            <button 
              key={t}
              onClick={() => setActionType(t)}
              className={`flex-1 py-2 rounded-xl text-[8px] font-black uppercase   transition-all ${
                actionType === t ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-100'
              }`}
            >
              {t === 'bonus' ? 'مكافأة' : t === 'deduction' ? 'خصم' : t === 'overtime' ? 'إضافي' : 'سلفة'}
            </button>
          ))}
        </div>
        <input 
          type="number" 
          placeholder="المبلغ (د.ع)" 
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-white border border-slate-100 p-4 rounded-2xl text-xs font-black focus:ring-2 focus:ring-slate-200 outline-none transition-all"
        />
        <input 
          type="text" 
          placeholder="السبب (اختياري)" 
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full bg-white border border-slate-100 p-4 rounded-2xl text-xs font-black focus:ring-2 focus:ring-slate-200 outline-none transition-all"
        />
        <button 
          onClick={handleAction}
          disabled={!selectedEmp || !amount}
          className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:opacity-50"
        >
          تأفيذ العملية
        </button>
      </div>
    </div>
  );
}

function AlertsTool({ manager }: { manager: User }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!title || !message) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: null, // Global
        title,
        message: `${message}\n\n— مرسل من: ${manager.displayName}`,
        type: 'announcement',
        createdAt: serverTimestamp(),
        isRead: false
      });
      alert('تم إرسال التنبيه العام بنجاح');
      setTitle('');
      setMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="bg-slate-50/50 p-6 rounded-3xl border border-slate-100 space-y-4">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase   mr-2">عنوان التنبيه</label>
        <input 
          type="text" 
          placeholder="مثلاً: اجتماع عاجل، تعليمات جديدة..." 
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-white border border-slate-100 p-4 rounded-2xl text-xs font-black outline-none focus:ring-2 focus:ring-slate-200"
        />
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase   mr-2">نص الرسالة</label>
        <textarea 
          placeholder="اكتب تفاصيل التنبيه هنا..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full bg-white border border-slate-100 p-4 rounded-2xl text-xs font-black outline-none focus:ring-2 focus:ring-slate-200 no-scrollbar resize-none"
        ></textarea>
      </div>
      <button 
        onClick={handleSend}
        disabled={isSending || !title || !message}
        className="w-full py-5 bg-[#E31E24] text-white rounded-2xl font-black text-sm shadow-xl shadow-red-100 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
      >
        <span className="material-symbols-outlined">campaign</span>
        {isSending ? 'جاري الإرسال...' : 'إرسال التنبيه للجميع'}
      </button>
    </div>
  );
}
