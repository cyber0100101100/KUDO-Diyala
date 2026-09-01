import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, addDoc, serverTimestamp, getDoc, increment, onSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { User, Notification, Group } from '../types';
import { useAuth } from '../hooks/useAuth';
import { getCurrentMonthBaghdadStr, getTodayBaghdadStr } from '../lib/timeUtils';
import AdminTopHeader from '../components/AdminTopHeader';

type ModalType = 'none' | 'bonus' | 'deduction' | 'dismiss' | 'promote' | 'revoke' | 'leave' | 'absent' | 'edit_profile' | 'edit_name' | 'create_group';

export default function AdminWorkforceScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('الكل');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  
  // Modal states
  const [modalType, setModalType] = useState<ModalType>('none');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [modalAmount, setModalAmount] = useState<string>('');
  const [editJobTitle, setEditJobTitle] = useState<string>('');
  const [editDisplayName, setEditDisplayName] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupImage, setNewGroupImage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedEmployee = employees.find(e => e.uid === selectedUserId);

  const isManagement = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'supervisor' || user?.email === 'antrippy1@gmail.com' || user?.email === 'ath222139@gmail.com';
  const isSuperManager = user?.role === 'manager' || user?.email === 'antrippy1@gmail.com' || user?.email === 'ath222139@gmail.com';
  const isSupervisor = user?.role === 'supervisor';

  useEffect(() => {
    let unsubUsers: (() => void) | undefined;
    let unsubGroups: (() => void) | undefined;

    function setupListeners() {
      try {
        if (authLoading || !user || !auth.currentUser) return;
        if (!isManagement) return;

        const q = query(
          collection(db, 'users'), 
          where('role', 'in', ['employee', 'admin', 'supervisor']),
          where('groupStatus', '==', 'joined')
        );
        unsubUsers = onSnapshot(q, (snap) => {
          const fetchedEmployees = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
          // Show all employees and admins in the list, including the current user
          // as they should be considered an employee in the system for scheduling and payroll.
          setEmployees(fetchedEmployees);
          setLoading(false);
        });

        const gq = query(collection(db, 'groups'));
        unsubGroups = onSnapshot(gq, (snap) => {
          const fetchedGroups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
          setAvailableGroups(fetchedGroups);
        });
      } catch (error) {
        console.error("Error setting up listeners:", error);
        setLoading(false);
      }
    }
    setupListeners();

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubGroups) unsubGroups();
    };
  }, [user, authLoading, isManagement]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.7);
          setNewGroupImage(compressed);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const sendNotification = async (userId: string, title: string, message: string, type: Notification['type']) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        title,
        message,
        type,
        createdAt: serverTimestamp(),
        isRead: false
      });
    } catch (e) {
      console.error("Error sending notification:", e);
    }
  };

  const handleAction = (userId: string | null, action: ModalType) => {
    setSelectedUserId(userId);
    setModalType(action);
    setModalAmount('');
    setNewGroupName('');
    setNewGroupImage('');
    
    if (userId) {
      const emp = employees.find(e => e.uid === userId);
      if (action === 'edit_profile' && emp) {
        setEditJobTitle(emp.jobTitle || '');
      }
      if (action === 'edit_name' && emp) {
        setEditDisplayName(emp.displayName || '');
      }
    }
    setActiveMenuId(null);
  };

  const executeAction = async () => {
    if (!modalType) return;
    setIsProcessing(true);

    try {
      if (modalType === 'create_group') {
        if (!newGroupName.trim()) {
          alert('يرجى إدخال اسم المجموعة');
          setIsProcessing(false);
          return;
        }
        await addDoc(collection(db, 'groups'), {
          name: newGroupName,
          imageUrl: newGroupImage || 'https://via.placeholder.com/150',
          managerId: user?.uid,
          createdAt: serverTimestamp(),
          employeeCount: 0
        });
        alert('تم إنشاء المجموعة بنجاح');
        setModalType('none');
        return;
      }

      if (!selectedUserId) return;
      const targetUser = employees.find(e => e.uid === selectedUserId);
      const amountNum = parseInt(modalAmount);

      switch (modalType) {
        case 'bonus':
        case 'deduction':
          if (!modalAmount || isNaN(amountNum)) {
            alert('يرجى إدخل مبلغ صحيح');
            setIsProcessing(false);
            return;
          }

          // Check Admin/Supervisor limits for salary operations
          if ((user?.role === 'admin' || user?.role === 'supervisor') && amountNum > 40000) {
            alert('عذراً، الحد الأقصى المسموح به للعمليات المالية للمسؤول/المشرف هو 40,000 دينار. سيتم تحويل الطلب للمدير العام للموافقة.');
            await addDoc(collection(db, 'requests'), {
              userId: selectedUserId,
              requesterId: user.uid,
              type: modalType,
              amount: amountNum,
              status: 'pending',
              createdAt: serverTimestamp(),
              reason: `طلب ${modalType === 'bonus' ? 'مكافأة' : 'خصم'} بقيمة ${Math.trunc(amountNum).toLocaleString()} للموظف ${targetUser?.displayName}`
            });
          } else {
            const userRef = doc(db, 'users', selectedUserId);
            const updates: any = {};
            if (modalType === 'bonus') updates.bonus = increment(amountNum);
            if (modalType === 'deduction') updates.deduction = increment(amountNum);
            
            await updateDoc(userRef, updates);

            // Create financial record for direct operation
            const currentPeriod = getCurrentMonthBaghdadStr();
            await addDoc(collection(db, 'financial_records'), {
              userId: selectedUserId,
              userName: targetUser?.displayName || 'موظف',
              bonus: modalType === 'bonus' ? amountNum : 0,
              advance: 0,
              deduction: modalType === 'deduction' ? amountNum : 0,
              overtime: 0,
              period: currentPeriod,
              reason: modalType === 'bonus' ? 'مكافأة مباشرة' : 'خصم مباشر',
              createdAt: serverTimestamp(),
              createdBy: user?.uid || 'admin'
            });

            const title = modalType === 'bonus' ? 'تم منحك مكافأة' : 'تم تطبيق خصم';
            const message = `تم ${modalType === 'bonus' ? 'منحك مكافأة' : 'تطبيق خصم'} بقيمة ${Math.trunc(amountNum).toLocaleString()} دينار عراقي من قبل ${user?.displayName || 'الإدارة'}`;
            
            await sendNotification(selectedUserId, title, message, 'salary');

            // If an admin or supervisor did this, notify the manager
            if (user?.role === 'admin' || user?.role === 'supervisor') {
              // Get managers to notify
              const managerQuery = query(collection(db, 'users'), where('role', '==', 'manager'));
              const managerSnap = await getDocs(managerQuery);
              for (const mDoc of managerSnap.docs) {
                await sendNotification(mDoc.id, 'إشعار إداري', `قام ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName} بتنفيذ ${modalType === 'bonus' ? 'مكافأة' : 'خصم'} للموظف ${targetUser?.displayName} بقيمة ${Math.trunc(amountNum).toLocaleString()} د.ع`, 'salary');
              }
            }

            alert('تم تنفيذ العملية بنجاح وإرسال إشعار للموظف');
          }
          break;

        case 'dismiss':
          await updateDoc(doc(db, 'users', selectedUserId), { enrollmentComplete: false, groupStatus: 'none', groupId: null });
          alert('تم فصل الموظف بنجاح');
          break;

        case 'promote':
          await updateDoc(doc(db, 'users', selectedUserId), { 
            role: 'supervisor',
            jobTitle: 'مشرف'
          });
          alert('تم منح صلاحيات المشرف بنجاح وتحديث المسمى الوظيفي إلى مشرف');
          break;

        case 'revoke':
          if (user?.role === 'supervisor' && targetUser?.role === 'supervisor') {
            alert('عذراً، لا تملك الصلاحية لسحب صلاحيات مشرف آخر. هذه الصلاحية للمدير العام فقط.');
            setIsProcessing(false);
            setModalType('none');
            return;
          }
          await updateDoc(doc(db, 'users', selectedUserId), { 
            role: 'employee',
            jobTitle: 'موظف خدمة'
          });
          alert('تم سحب صلاحيات المسؤول بنجاح وتحديث المسمى الوظيفي إلى موظف خدمة');
          break;

        case 'leave':
          await addDoc(collection(db, 'requests'), {
            userId: selectedUserId,
            status: 'approved',
            type: 'leave',
            createdAt: serverTimestamp(),
            managerId: user?.uid
          });
          alert('تم تسجيل الإجازة بنجاح');
          break;

        case 'absent':
          const todayDate = getTodayBaghdadStr();
          const emp = employees.find(e => e.uid === selectedUserId);
          const dailyDeduction = Math.trunc((emp?.baseSalary || 0) / 30);
          
          // 1. Record the absence in attendance
          await addDoc(collection(db, 'attendance'), {
            userId: selectedUserId,
            date: todayDate,
            status: 'absent',
            locationVerified: true,
            checkInTime: serverTimestamp()
          });

          // 2. Create the financial record directly for immediate salary sync
          await addDoc(collection(db, 'financial_records'), {
            userId: selectedUserId,
            userName: emp?.displayName || 'موظف',
            bonus: 0,
            advance: 0,
            deduction: dailyDeduction,
            overtime: 0,
            period: todayDate.slice(0, 7),
            reason: `خصم غياب يوم ${todayDate}`,
            createdAt: serverTimestamp(),
            createdBy: user?.uid || 'admin',
            type: 'absence_deduction'
          });

          // 3. Notification
          await sendNotification(selectedUserId, 'تسجيل غياب', `تم تسجيل غيابك لليوم وتطبيق خصم بقيمة ${dailyDeduction.toLocaleString()} د.ع`, 'salary');

          alert('تم تسجيل الغياب وتحديث الراتب فوراً');
          break;

        case 'edit_profile':
          if (!editJobTitle.trim()) {
            alert('يرجى إدخال المسمى الوظيفي');
            setIsProcessing(false);
            return;
          }
          await updateDoc(doc(db, 'users', selectedUserId), { jobTitle: editJobTitle });
          alert('تم تحديث المسمى الوظيفي بنجاح');
          break;

        case 'edit_name':
          if (!editDisplayName.trim()) {
            alert('يرجى إدخال الاسم الجديد');
            setIsProcessing(false);
            return;
          }
          await updateDoc(doc(db, 'users', selectedUserId), { displayName: editDisplayName });
          alert('تم تحديث اسم الموظف بنجاح');
          break;
      }
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء تنفيذ العملية');
    } finally {
      setIsProcessing(false);
      setModalType('none');
      setSelectedUserId(null);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = (emp.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (emp.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase());
    // Only show employees who have officially joined a group
    const matchesGroup = selectedGroupId === 'الكل' 
      ? emp.groupStatus === 'joined'
      : emp.groupId === selectedGroupId && emp.groupStatus === 'joined';
    return matchesSearch && matchesGroup;
  });

  const tabItems = [
    { id: 'الكل', name: `الكل (${employees.filter(e => e.groupStatus === 'joined').length})` },
    ...availableGroups.map(g => ({ id: g.id!, name: g.name }))
  ];

  return (
    <div className="font-sans rtl flex flex-col min-h-screen bg-white antialiased pb-24 pt-16 md:pt-20">
      <AdminTopHeader title="إدارة الموظفين" />

      <div className="max-w-4xl mx-auto w-full px-6 py-8 md:py-12">
        {/* Header Section */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900">إدارة الموظفين</h1>
          
          <div className="relative group">
            <button 
              onClick={() => isSuperManager ? handleAction(null, 'create_group') : null}
              disabled={!isSuperManager}
              className={`px-6 py-3 rounded-full font-black text-sm flex items-center gap-2 transition-all active:scale-95 ${
                isSuperManager 
                  ? 'bg-[#E31E24] text-white shadow-xl shadow-red-200 hover:bg-red-700 cursor-pointer' 
                  : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed opacity-100 shadow-inner'
              }`}
            >
              <span>إنشاء مجموعة</span>
              <span className="material-symbols-outlined text-lg">group_add</span>
            </button>
            {!isSuperManager && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-[10px] font-black rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
                هذه الخاصية متاحة للمدير العام فقط
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800" />
              </div>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8">
          <input 
            type="text" 
            placeholder="بحث عن موظف..." 
            className="w-full bg-white border border-slate-100 rounded-2xl py-4 pr-12 pl-4 text-sm font-black text-slate-700 focus:outline-none focus:border-red-100 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b border-slate-100 mb-8 overflow-x-auto no-scrollbar">
          {tabItems.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSelectedGroupId(tab.id)}
              className={`pb-4 text-sm font-black transition-all whitespace-nowrap relative ${
                selectedGroupId === tab.id ? 'text-red-500' : 'text-slate-400'
              }`}
            >
              {tab.name}
              {selectedGroupId === tab.id && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-1 bg-red-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Employee Cards */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredEmployees.map((emp) => (
              <motion.div
                key={emp.uid}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[24px] p-5 border border-slate-100 shadow-sm flex items-center justify-between relative group hover:shadow-xl hover:shadow-slate-200/50 hover:border-red-100/50 transition-all duration-300"
              >
                {/* Employee Identity Group (Right Side) */}
                <div className="flex items-center gap-4 flex-1 pr-2">
                  {/* Profile Image */}
                  <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-white shadow-sm bg-slate-50 flex-shrink-0">
                    <img 
                      src={emp.profileImageUrl || `https://ui-avatars.com/api/?name=${emp.displayName}`} 
                      alt={emp.displayName} 
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Employee Details */}
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(emp.role === 'admin' || emp.role === 'supervisor') && (
                        <span className="bg-red-50 text-[#E31E24] text-[8px] font-black px-2 py-0.5 rounded-md border border-red-100 uppercase  er">
                          {emp.role === 'admin' ? 'مسؤول' : 'مشرف'}
                        </span>
                      )}
                      <h4 className="font-black text-slate-900 text-base">{emp.displayName}</h4>
                    </div>
                    <p className="text-[10px] font-black text-slate-400 mt-0.5">
                      <span className={(emp.role === 'admin' || emp.role === 'supervisor') ? 'text-[#E31E24]' : ''}>{emp.jobTitle || 'موظف'}</span> • {emp.employeeId || 'KD-7400'}
                    </p>
                    
                    {/* Status Pill */}
                    <div className="mt-2 flex justify-end">
                      <div className={`px-3 py-1 rounded-full flex items-center gap-1.5 ${
                        emp.status === 'present' ? 'bg-emerald-50 text-emerald-600' : 
                        emp.status === 'late' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        <span className="text-[9px] font-black uppercase  ">
                          {emp.status === 'present' ? 'حاضر الآن' : 
                          emp.status === 'late' ? `متأخر ${emp.lateMinutes || 12} دقيقة` : 
                          'لم يسجل الحضور'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Options Menu Toggle (Left Side) */}
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenuId(activeMenuId === emp.uid ? null : emp.uid)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-xl transition-colors"
                  >
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {activeMenuId === emp.uid && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setActiveMenuId(null)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, x: 10 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.9, x: 10 }}
                          className="absolute left-0 top-12 bg-white border border-slate-100 shadow-2xl rounded-2xl py-2 w-48 z-50 overflow-hidden"
                        >
                          <button onClick={() => navigate(`/admin/workforce/${emp.uid}`)} className="w-full px-4 py-3 text-right hover:bg-slate-50 text-slate-600 font-black text-xs flex items-center justify-between">
                            <span>الملف الشخصي</span>
                            <span className="material-symbols-outlined text-sm">person</span>
                          </button>
                          <button onClick={() => handleAction(emp.uid, 'edit_profile')} className="w-full px-4 py-3 text-right hover:bg-slate-50 text-slate-900 font-black text-xs flex items-center justify-between border-t border-slate-50">
                            <span>تعديل المسمى الوظيفي</span>
                            <span className="material-symbols-outlined text-sm">edit</span>
                          </button>
                          {!(user?.role === 'supervisor' && emp.uid === user.uid) && (
                            <button onClick={() => handleAction(emp.uid, 'leave')} className="w-full px-4 py-3 text-right hover:bg-blue-50 text-blue-600 font-black text-xs flex items-center justify-between border-t border-slate-50">
                              <span>تسجيل إجازة</span>
                              <span className="material-symbols-outlined text-sm">event_available</span>
                            </button>
                          )}
                          {(isSuperManager || user?.role === 'admin' || user?.role === 'supervisor') && (
                            (emp.role === 'admin' || emp.role === 'supervisor') ? (
                              // Restricted: Supervisors cannot revoke other supervisors
                              !(user?.role === 'supervisor' && emp.role === 'supervisor') && (
                                <button 
                                  onClick={() => handleAction(emp.uid, 'revoke')} 
                                  className="w-full px-4 py-3 text-right hover:bg-orange-50 text-orange-600 font-black text-xs flex items-center justify-between border-t border-slate-50 transition-colors"
                                >
                                  <span>سحب الصلاحيات</span>
                                  <span className="material-symbols-outlined text-sm">person_remove_outline</span>
                                </button>
                              )
                            ) : (
                              <button 
                                onClick={() => handleAction(emp.uid, 'promote')} 
                                className="w-full px-4 py-3 text-right hover:bg-red-50 text-[#E31E24] font-black text-xs flex items-center justify-between border-t border-slate-50 group/admin transition-all active:bg-red-100"
                              >
                                <span className="group-hover/admin:translate-x-1 transition-transform font-black">تفعيل صلاحيات المشرف</span>
                                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover/admin:bg-[#E31E24] group-hover/admin:text-white transition-all shadow-sm">
                                  <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
                                </div>
                              </button>
                            )
                          )}
                          <button onClick={() => handleAction(emp.uid, 'dismiss')} className="w-full px-4 py-3 text-right hover:bg-red-50 text-red-600 font-black text-xs flex items-center justify-between border-t border-slate-50">
                            <span>فصل الموظف</span>
                            <span className="material-symbols-outlined text-sm">person_remove</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Action Modals */}
      <AnimatePresence>
        {modalType !== 'none' && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setModalType('none')}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] w-full max-w-sm p-8 shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="text-center">
                {/* Modal content */}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${
                  modalType === 'bonus' ? 'bg-emerald-50 text-emerald-600' :
                  modalType === 'deduction' ? 'bg-amber-50 text-amber-600' :
                  modalType === 'dismiss' ? 'bg-red-50 text-red-600' :
                  modalType === 'promote' ? 'bg-indigo-50 text-indigo-600' : 
                  modalType === 'revoke' ? 'bg-orange-50 text-orange-600' : 
                  modalType === 'edit_profile' || modalType === 'edit_name' || modalType === 'create_group' ? 'bg-slate-900 text-white' : 'bg-blue-50 text-blue-600'
                }`}>
                  <span className="material-symbols-outlined text-3xl">
                    {modalType === 'bonus' ? 'stars' :
                     modalType === 'deduction' ? 'money_off' :
                     modalType === 'dismiss' ? 'person_remove' :
                     modalType === 'promote' ? 'admin_panel_settings' : 
                     modalType === 'edit_profile' ? 'person_edit' :
                     modalType === 'edit_name' ? 'badge' :
                     modalType === 'create_group' ? 'group_add' :
                     modalType === 'revoke' ? 'person_remove_outline' : 'event_available'}
                  </span>
                </div>

                <h3 className="text-xl font-black text-slate-900 mb-2">
                  {modalType === 'bonus' ? 'تطبيق مكافأة' :
                   modalType === 'deduction' ? 'تطبيق خصم' :
                   modalType === 'dismiss' ? 'تأكيد الفصل' :
                   modalType === 'promote' ? 'ترقية لمشرف' : 
                   modalType === 'edit_profile' ? 'تعديل المسمى الوظيفي' :
                   modalType === 'edit_name' ? 'تعديل اسم الموظف' :
                   modalType === 'create_group' ? 'إنشاء مجموعة جديدة' :
                   modalType === 'revoke' ? 'سحب الصلاحيات' : 'منح إجازة'}
                </h3>
                
                <p className="text-xs font-bold text-slate-400 mb-8 px-4">
                  {modalType === 'bonus' || modalType === 'deduction' ? 'يرجى إدخال القيمة بالدينار العراقي ليتم تطبيقها وإرسال إشعار للموظف' :
                   modalType === 'dismiss' ? 'هل أنت متأكد من فصل هذا الموظف؟ سيتم إلغاء تفعيل حسابه فوراً' :
                   modalType === 'promote' ? 'سيتم منح الموظف صلاحيات المشرف لإدارة الجداول والتنبيهات بحد أقصى 40,000 د.ع' :
                   modalType === 'revoke' ? 'هل أنت متأكد من سحب الصلاحيات الإدارية من هذا الموظف؟' :
                   modalType === 'edit_profile' ? 'قم بتحديث المسمى الوظيفي للموظف أدناه' :
                   modalType === 'edit_name' ? 'قم بتحديث الاسم الكامل للموظف أدناه' :
                   modalType === 'create_group' ? 'قم بإدخال تفاصيل المجموعة الجديدة ليتمكن الموظفون من الانضمام إليها' :
                   'هل تريد منح الموظف إجازة رسمية لهذا اليوم؟'}
                </p>

                {modalType === 'create_group' && (
                  <div className="space-y-6 mb-8">
                    <div className="relative">
                      <label className="block text-[10px] font-black text-slate-400 uppercase   text-right mb-2 pr-2">اسم المجموعة</label>
                      <input 
                        type="text"
                        placeholder="مثال: طاقم المطبخ"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-right text-sm font-black text-slate-700 focus:outline-none focus:border-red-100"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex flex-col items-center gap-4">
                      <label className="block w-full text-[10px] font-black text-slate-400 uppercase   text-right mb-2 pr-2">صورة المجموعة</label>
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:border-red-200 hover:bg-red-50 transition-all overflow-hidden group"
                      >
                        {newGroupImage ? (
                          <img src={newGroupImage} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-slate-400 group-hover:text-red-400 transition-colors">add_a_photo</span>
                            <span className="text-[10px] font-black text-slate-400 mt-1">رفع صورة</span>
                          </>
                        )}
                      </div>
                      {newGroupImage && (
                        <button 
                          onClick={() => setNewGroupImage('')}
                          className="text-[10px] font-black text-red-500 underline"
                        >
                          إزالة الصورة
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {modalType === 'edit_name' && (
                  <div className="relative mb-8">
                    <label className="block text-[10px] font-black text-slate-400 uppercase   text-right mb-2 pr-2">الاسم الكامل</label>
                    <input 
                      type="text"
                      placeholder="أدخل الاسم الكامل"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-right text-sm font-black text-slate-700 focus:outline-none focus:border-red-100"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                    />
                  </div>
                )}

                {modalType === 'edit_profile' && (
                  <div className="relative mb-8">
                    <label className="block text-[10px] font-black text-slate-400 uppercase   text-right mb-2 pr-2">المسمى الوظيفي</label>
                    <input 
                      type="text"
                      placeholder="مثال: مدير مبيعات"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-right text-sm font-black text-slate-700 focus:outline-none focus:border-red-100"
                      value={editJobTitle}
                      onChange={(e) => setEditJobTitle(e.target.value)}
                    />
                  </div>
                )}

                {(modalType === 'bonus' || modalType === 'deduction') && (
                  <div className="relative mb-8">
                    <input 
                      type="number"
                      placeholder="أدخل المبلغ (مثال: 5000)"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-center text-lg font-black text-slate-700 focus:outline-none focus:border-red-100"
                      value={modalAmount}
                      onChange={(e) => setModalAmount(e.target.value)}
                    />
                    <div className="mt-2 text-[10px] font-black text-slate-400 uppercase  ">دينار عراقي</div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    disabled={isProcessing}
                    onClick={() => setModalType('none')}
                    className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-sm active:scale-95 transition-transform"
                  >
                    إلغاء
                  </button>
                  <button 
                    disabled={isProcessing}
                    onClick={executeAction}
                    className={`flex-1 py-4 text-white rounded-2xl font-black text-sm active:scale-95 transition-transform shadow-lg ${
                      modalType === 'dismiss' ? 'bg-red-600 shadow-red-100' :
                      modalType === 'bonus' ? 'bg-emerald-600 shadow-emerald-100' :
                      modalType === 'deduction' ? 'bg-amber-600 shadow-amber-100' :
                      modalType === 'promote' ? 'bg-indigo-600 shadow-indigo-100' : 
                      modalType === 'edit_profile' || modalType === 'edit_name' || modalType === 'create_group' ? 'bg-slate-900 shadow-slate-100' :
                      modalType === 'revoke' ? 'bg-orange-600 shadow-orange-100' : 'bg-blue-600 shadow-blue-100'
                    }`}
                  >
                    {isProcessing ? 'جاري التنفيذ...' : 'تأكيد العملية'}
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

