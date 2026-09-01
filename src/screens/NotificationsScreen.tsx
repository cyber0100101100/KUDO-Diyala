import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs, updateDoc, serverTimestamp, addDoc, increment, deleteDoc } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, isFirestoreQuotaExhausted, setFirestoreQuotaExhausted } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { Notification, ChatRoom, LeaveRequest, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { formatTime12h, formatDateNumeric, getCurrentMonthBaghdadStr } from '../lib/timeUtils';
import AdminTopHeader from '../components/AdminTopHeader';
import ChatRoomItem from '../components/ChatRoomItem';
import { NotificationService } from '../services/NotificationService';
import { userCache } from '../services/UserCacheService';

export default function NotificationsScreen() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [requests, setRequests] = useState<(LeaveRequest & { userName?: string, userRole?: string })[]>([]);
  const [tab, setTab] = useState<'general' | 'requests' | 'chat'>('general');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatUsers, setChatUsers] = useState<User[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Notification | null>(null);
  const [newNotifTitle, setNewNotifTitle] = useState('');
  const [newNotifMessage, setNewNotifMessage] = useState('');
  const [newNotifType, setNewNotifType] = useState<Notification['type']>('announcement');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isManagement = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'supervisor';

  const fetchChatUsers = async () => {
    if (!user) return;
    setChatLoading(true);
    try {
      // 1. Get managers and admins
      const qManagers = query(
        collection(db, 'users'),
        where('role', 'in', ['manager', 'admin', 'supervisor'])
      );
      const snapManagers = await getDocs(qManagers);
      const managers = snapManagers.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));

      // 2. Get employees in the same group
      let groupEmployees: User[] = [];
      if (user.groupId) {
        const qGroup = query(
          collection(db, 'users'),
          where('groupId', '==', user.groupId),
          where('role', '==', 'employee')
        );
        const snapGroup = await getDocs(qGroup);
        groupEmployees = snapGroup.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
      }

      // Combine and filter out current user
      const allUsers = [...managers, ...groupEmployees].filter(u => u.uid !== user.uid);
      
      // Remove duplicates
      const uniqueUsers = Array.from(new Map(allUsers.map(u => [u.uid, u])).values());

      // Sort by role (manager -> admin -> supervisor -> employee)
      const roleOrder: Record<string, number> = { manager: 0, admin: 1, supervisor: 2, employee: 3 };
      uniqueUsers.sort((a, b) => (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3));

      setChatUsers(uniqueUsers);
    } catch (error) {
      console.error("Error fetching chat users:", error);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (showChatModal) {
      fetchChatUsers();
    }
  }, [showChatModal]);

  const startChat = (otherUser: User) => {
    const chatId = [user!.uid, otherUser.uid].sort().join('_');
    const basePath = isManagement ? 'admin' : 'employee';
    navigate(`/${basePath}/chat/${chatId}`);
    setShowChatModal(false);
  };

  const createNotification = async () => {
    if (!newNotifTitle || !newNotifMessage) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: null, // Global announcement
        title: newNotifTitle,
        message: newNotifMessage,
        type: newNotifType,
        createdAt: serverTimestamp(),
        isRead: false
      });
      setShowCreateModal(false);
      setNewNotifTitle('');
      setNewNotifMessage('');
    } catch (error) {
      console.error("Error creating notification:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;

    // 1. Notifications Query
    const qNotifs = query(
      collection(db, 'notifications'),
      where('userId', 'in', [null, user.uid]),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeNotifs = onSnapshot(qNotifs, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    // 2. Chat Rooms Query
    const qRooms = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastUpdate', 'desc')
    );

    const unsubscribeRooms = onSnapshot(qRooms, (snapshot) => {
      setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatRoom)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
      setLoading(false);
    });

    // 3. Requests Query (if management)
    let unsubscribeRequests = () => {};
    if (isManagement) {
      const qReq = query(
        collection(db, 'requests'), 
        where('status', 'in', ['pending', 'forwarded_to_admin']),
        orderBy('createdAt', 'desc')
      );
      unsubscribeRequests = onSnapshot(qReq, async (snapshot) => {
        const requestsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
        
        // Use userCache for mapping to save reads
        const updatedRequests = await Promise.all(requestsData.map(async (r) => {
          const userName = await userCache.getUserName(r.userId);
          return {
            ...r,
            userName: userName,
            userRole: 'موظف'
          };
        }));

        setRequests(updatedRequests);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'requests');
      });

      // Also trigger automated checks
      checkForAutomatedDeductions();
    }

    return () => {
      unsubscribeNotifs();
      unsubscribeRooms();
      unsubscribeRequests();
    };
  }, [user, authLoading, isManagement]);

  async function checkForAutomatedDeductions() {
    if (!auth.currentUser || isFirestoreQuotaExhausted()) return;

    // Throttle automated checks: only once every 6 hours per manager
    const lastCheckKey = `last_auto_deduct_check_${user?.uid}`;
    const lastCheck = localStorage.getItem(lastCheckKey);
    if (lastCheck && Date.now() - parseInt(lastCheck, 10) < 6 * 60 * 60 * 1000) return;
    localStorage.setItem(lastCheckKey, Date.now().toString());

    try {
      const employeesSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['employee', 'admin', 'supervisor'])));
      for (const empDoc of employeesSnap.docs) {
        const emp = empDoc.data() as User;
        const attendanceSnap = await getDocs(query(collection(db, 'attendance'), where('userId', '==', emp.uid), where('status', '==', 'late')));
        const lateDocs = attendanceSnap.docs.map(d => d.data());
        if (lateDocs.length >= 4) {
          const existingReq = await getDocs(query(collection(db, 'requests'), where('userId', '==', emp.uid), where('type', '==', 'automated_deduction'), where('status', '==', 'pending')));
          if (existingReq.empty) {
            await addDoc(collection(db, 'requests'), {
              userId: emp.uid,
              type: 'automated_deduction',
              status: 'pending',
              reason: 'تكرار التأخير لأكثر من 20 دقيقة (4 مرات)',
              amount: 5000,
              lateOccurrences: lateDocs.length,
              createdAt: serverTimestamp()
            });
          }
        }
      }
    } catch (error: any) {
      if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota exceeded')) {
        setFirestoreQuotaExhausted();
      }
      console.error("Error in automated deductions check:", error);
    }
  }

  const handleAction = async (requestId: string, userId: string, action: 'approved' | 'rejected', type: string, amount?: number, groupName?: string, userName?: string) => {
    const { isFirestoreQuotaExhausted } = await import('../lib/firebase');
    if (isFirestoreQuotaExhausted()) {
      alert('عذراً، لا يمكن معالجة الطلب حالياً بسبب نفاذ حصة العمليات اليومية. يرجى المحاولة لاحقاً.');
      return;
    }
    try {
      const requestRef = doc(db, 'requests', requestId);
      const reqSnap = await getDoc(requestRef);
      const reqData = reqSnap.data() as LeaveRequest;
      
      // Role check for supervisor
      const financialTypes = ['advance', 'bonus', 'deduction', 'overtime', 'automated_deduction', 'absence_deduction'];
      if (user?.role === 'supervisor' || user?.role === 'admin') {
        if (financialTypes.includes(type) && (amount || 0) > 40000) {
          alert('عذراً، لا يملك المسؤول/المشرف صلاحية الموافقة على طلبات مالية تتجاوز 40,000 دينار. يتم تحويل الطلب للمدير العام.');
          // Forward to admin/manager by changing status
          await updateDoc(requestRef, { 
            status: 'forwarded_to_admin',
            forwardedBy: user.uid,
            forwardedByName: user.displayName
          });
          return;
        }
      }

      await updateDoc(requestRef, { 
        status: action,
        processedBy: user?.uid,
        processedByName: user?.displayName
      });
      
      if (action === 'approved') {
        const currentPeriod = getCurrentMonthBaghdadStr();
        const financialRecordBase = {
          userId: userId,
          userName: userName || 'موظف',
          bonus: 0,
          advance: 0,
          deduction: 0,
          overtime: 0,
          period: currentPeriod,
          reason: reqData.reason || 'طلب معتمد',
          createdAt: serverTimestamp(),
          createdBy: user?.uid || 'system'
        };

        if ((type === 'automated_deduction' || type === 'absence_deduction' || type === 'deduction') && amount) {
          await updateDoc(doc(db, 'users', userId), { deduction: increment(amount) });
          await addDoc(collection(db, 'financial_records'), {
            ...financialRecordBase,
            deduction: amount,
            reason: type === 'automated_deduction' ? `خصم تلقائي: ${reqData.reason || ''}` : (type === 'absence_deduction' ? `خصم غياب: ${reqData.reason || ''}` : reqData.reason || 'خصم مالي')
          });
        } else if (type === 'advance' && amount) {
          await updateDoc(doc(db, 'users', userId), { advance: increment(amount) });
          await addDoc(collection(db, 'financial_records'), {
            ...financialRecordBase,
            advance: amount,
            reason: reqData.reason || 'سلفة مالية'
          });
          
          // Notify manager if supervisor approved
          if (user?.role === 'supervisor' || user?.role === 'admin') {
            const managerQuery = query(collection(db, 'users'), where('role', '==', 'manager'));
            const managerSnap = await getDocs(managerQuery);
            for (const mDoc of managerSnap.docs) {
              await addDoc(collection(db, 'notifications'), {
                userId: mDoc.id,
                title: 'إشعار إداري: موافقة على سلفة',
                message: `قام ${user.role === 'admin' ? 'المسؤول' : 'المشرف'} ${user.displayName} بالموافقة على سلفة للموظف بقيمة ${Math.trunc(amount).toLocaleString()} د.ع`,
                type: 'salary',
                createdAt: serverTimestamp(),
                isRead: false
              });
            }
          }
        } else if (type === 'bonus' && amount) {
          await updateDoc(doc(db, 'users', userId), { bonus: increment(amount) });
          await addDoc(collection(db, 'financial_records'), {
            ...financialRecordBase,
            bonus: amount
          });
        } else if (type === 'overtime' && amount) {
          await updateDoc(doc(db, 'users', userId), { overtime: increment(amount) });
          await addDoc(collection(db, 'financial_records'), {
            ...financialRecordBase,
            overtime: amount
          });
        } else if (type === 'group_join' && reqData.groupId) {
          await updateDoc(doc(db, 'users', userId), { 
            groupStatus: 'joined',
            groupId: reqData.groupId,
            joinedAt: serverTimestamp()
          });
          await updateDoc(doc(db, 'groups', reqData.groupId), {
            employeeCount: increment(1)
          });
        } else if (type === 'leave' && reqData.startDate && reqData.endDate) {
          // Create attendance records for the leave period
          const start = new Date(reqData.startDate);
          const end = new Date(reqData.endDate);
          const current = new Date(start);
          
          while (current <= end) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            await addDoc(collection(db, 'attendance'), {
              userId: userId,
              date: dateStr,
              status: 'present', // Considered as attendance
              locationVerified: true,
              checkInTime: new Date(current.setHours(9, 0, 0, 0)).toISOString(),
              checkOutTime: new Date(current.setHours(17, 0, 0, 0)).toISOString(),
              isLeave: true // Flag to identify it was a leave
            });
            current.setDate(current.getDate() + 1);
          }
        }
      } else if (action === 'rejected') {
        if (type === 'absence_deduction') {
          // Treat as if the employee was not absent
          if (reqData?.date) {
            const attQ = query(
              collection(db, 'attendance'), 
              where('userId', '==', userId), 
              where('date', '==', reqData.date),
              where('status', '==', 'absent')
            );
            const attSnap = await getDocs(attQ);
            for (const d of attSnap.docs) {
              await deleteDoc(doc(db, 'attendance', d.id));
            }
          }
        }
      }

      let message = '';
      if (type === 'leave') message = `طلب الإجازة`;
      else if (type === 'advance') message = `طلب السلفة`;
      else if (type === 'automated_deduction') message = `إجراء الخصم التلقائي`;
      else if (type === 'absence_deduction') message = `طلب خصم الغياب`;
      else if (type === 'group_join') message = `طلب الانضمام للمجموعة`;
      else if (type === 'bonus') message = `طلب المكافأة`;
      else if (type === 'deduction') message = `طلب الخصم`;
      else if (type === 'overtime') message = `طلب الأجور الإضافية`;

      const title = action === 'approved' ? 'تمت الموافقة' : 'تم الرفض';
      let notifMessage = `تم ${action === 'approved' ? 'قبول' : 'رفض'} ${message} الخاص بك من قبل ${user?.displayName || 'الإدارة'}.`;
      
      if (action === 'rejected') {
        notifMessage = `لقد تم رفض طلبك (${message}) من قبل ${user?.displayName || 'الإدارة'}`;
      }

      if (action === 'approved' && type === 'absence_deduction' && amount) {
        notifMessage = `تم خصم مبلغ ${Math.trunc(amount).toLocaleString()} دينار من راتبك بسبب غيابك عن العمل وفقاً للنظام التلقائي (بواسطة ${user?.displayName}).`;
      }

      await addDoc(collection(db, 'notifications'), {
        userId: userId,
        title: title,
        message: notifMessage,
        type: 'request',
        createdAt: serverTimestamp(),
        isRead: false
      });
    } catch (error) {
      console.error("Error updating request:", error);
    }
  };

  const getRequestIcon = (type: string) => {
    switch (type) {
      case 'leave': return 'event_available';
      case 'advance': return 'payments';
      case 'automated_deduction': return 'warning';
      case 'absence_deduction': return 'event_busy';
      case 'group_join': return 'group_add';
      case 'bonus': return 'stars';
      case 'deduction': return 'money_off';
      case 'overtime': return 'timer';
      default: return 'help';
    }
  };

  const getRequestColor = (type: string) => {
    switch (type) {
      case 'leave': return 'bg-blue-50 text-blue-500';
      case 'advance': return 'bg-green-50 text-green-500';
      case 'automated_deduction': return 'bg-orange-50 text-orange-500';
      case 'absence_deduction': return 'bg-red-50 text-red-500';
      case 'group_join': return 'bg-indigo-50 text-indigo-500';
      case 'bonus': return 'bg-emerald-50 text-emerald-500';
      case 'deduction': return 'bg-amber-50 text-amber-500';
      case 'overtime': return 'bg-blue-50 text-blue-600';
      default: return 'bg-slate-50 text-slate-500';
    }
  };

  const getRequestLabel = (req: LeaveRequest) => {
    switch (req.type) {
      case 'leave': 
        return `طلب إجازة لمدة ${req.daysCount} أيام (${req.startDate} إلى ${req.endDate})`;
      case 'advance': return `طلب سلفة مالية (${req.amount ? Math.trunc(req.amount).toLocaleString() : 0} IQD)`;
      case 'automated_deduction': return `خصم تلقائي (تأخير متكرر: ${req.lateOccurrences} مرات)`;
      case 'absence_deduction': return `خصم غياب (${req.amount ? Math.trunc(req.amount).toLocaleString() : 0} IQD)`;
      case 'group_join': return `طلب انضمام لمجموعة: ${req.groupName || 'Kudu Kudu'}`;
      case 'bonus': return `طلب مكافأة (${req.amount ? Math.trunc(req.amount).toLocaleString() : 0} IQD)`;
      case 'deduction': return `طلب خصم مالي (${req.amount ? Math.trunc(req.amount).toLocaleString() : 0} IQD)`;
      case 'overtime': return `طلب أجور إضافية (${req.amount ? Math.trunc(req.amount).toLocaleString() : 0} IQD)`;
      default: return 'طلب غير معروف';
    }
  };

  const renderContent = () => {
    if (tab === 'chat') {
      return (
        <div className="flex flex-col gap-4">
          <button 
            onClick={() => setShowChatModal(true)}
            className="w-full py-4 bg-slate-900 text-white rounded-3xl text-sm font-black shadow-xl shadow-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all mb-2"
          >
            <span className="material-symbols-outlined">chat_add_on</span>
            بدء محادثة جديدة
          </button>
          
          {rooms.map((room: any) => (
            <ChatRoomItem 
              key={room.id} 
              room={room} 
              userId={user!.uid} 
              userRole={user!.role || 'employee'} 
            />
          ))}
          {rooms.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 opacity-60">
              <span className="material-symbols-outlined text-6xl">forum</span>
              <p className="font-bold">لا توجد محادثات حالياً</p>
            </div>
          )}
        </div>
      );
    }

    if (tab === 'requests' && isManagement) {
      return (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {requests.filter(r => 
              (r.status === 'pending' || r.status === 'forwarded_to_admin') && 
              (user?.role === 'manager' || r.status !== 'forwarded_to_admin')
            ).map((req) => (
              <motion.div
                layout
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex flex-col gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${getRequestColor(req.type)}`}>
                    <span className="material-symbols-outlined">{getRequestIcon(req.type)}</span>
                  </div>
                  <div className="flex-1 text-right">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-black text-slate-900">{req.userName}</h3>
                      {req.status === 'forwarded_to_admin' && (
                        <span className="bg-blue-50 text-blue-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase  er">محول من المسؤول</span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-400">{getRequestLabel(req)}</p>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 mb-1">السبب</p>
                  <p className="text-xs font-bold text-slate-700 italic">"{req.reason || 'لا يوجد'}"</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleAction(req.id!, req.userId, 'approved', req.type, req.amount, req.groupName, req.userName)}
                    className="flex-1 py-3 bg-green-500 text-white rounded-xl text-xs font-black shadow-lg shadow-green-100 active:scale-95 transition-all"
                  >
                    نعم
                  </button>
                  <button 
                    onClick={() => handleAction(req.id!, req.userId, 'rejected', req.type)}
                    className="flex-1 py-3 bg-slate-100 text-slate-400 rounded-xl text-xs font-black active:scale-95 transition-all"
                  >
                    لا
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {requests.filter(r => 
            (r.status === 'pending' || r.status === 'forwarded_to_admin') && 
            (user?.role === 'manager' || r.status !== 'forwarded_to_admin')
          ).length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 opacity-60">
              <span className="material-symbols-outlined text-6xl">done_all</span>
              <p className="font-bold">لا توجد طلبات معلقة</p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4">
        {notifications
          .filter(n => n.type !== 'chat')
          .map((notif) => (
          <div 
            key={notif.id} 
            onClick={() => {
              if (notif.metadata?.scheduleEntries) {
                setSelectedSchedule(notif);
              }
              if (!notif.isRead) {
                updateDoc(doc(db, 'notifications', notif.id!), { isRead: true });
              }
            }}
            className={`bg-white rounded-3xl p-6 shadow-sm border border-slate-100 transition-all hover:border-slate-200 relative cursor-pointer active:scale-[0.99] ${notif.isRead ? 'opacity-60' : ''}`}
          >
            {!notif.isRead && <div className="absolute top-6 right-6 w-3 h-3 bg-[#E31E24] rounded-full border-2 border-white shadow-sm"></div>}
            <div className="flex gap-4 items-start pr-6">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${notif.isRead ? 'bg-white border border-slate-100 text-slate-400' : 'bg-red-50 text-[#E31E24]'}`}>
                <span className="material-symbols-outlined filled-icon">
                  {notif.type === 'attendance' ? 'schedule' : 
                   notif.type === 'salary' ? 'payments' : 
                   notif.type === 'request' ? 'description' : 'notifications'}
                </span>
              </div>
              <div className="flex-1 text-right">
                <h3 className="text-lg font-bold text-slate-800 mb-1 leading-tight">{notif.title}</h3>
                <p className="text-sm text-slate-500 mb-4 font-medium leading-relaxed">{notif.message}</p>
                <div className="flex justify-between items-center text-slate-400 text-xs font-bold">
                  <span className="bg-white border border-slate-100 px-2 py-1 rounded-lg">{formatDateNumeric(notif.createdAt?.seconds * 1000 || Date.now())}</span>
                  <span className="bg-white border border-slate-100 px-2 py-1 rounded-lg">{formatTime12h(new Date(notif.createdAt?.seconds * 1000 || Date.now()))}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        {notifications.filter(n => n.type !== 'chat').length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 opacity-60">
            <span className="material-symbols-outlined text-6xl">notifications_off</span>
            <p className="font-bold">لا توجد تبليغات حالياً</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white text-slate-800 min-h-screen flex flex-col font-sans rtl pt-16 md:pt-20">
      <AdminTopHeader 
        title="التنبيهات" 
        centerTitle={true} 
        hideLogo={true} 
        hideNotifications={true} 
      />
      
      <div className="w-full bg-white flex-1 relative flex flex-col">

        <main className="flex-1 px-8 py-8 pb-32 flex flex-col gap-6 max-w-2xl mx-auto w-full">
          <div className="flex bg-white border border-slate-100 rounded-2xl p-1.5 w-full">
            <button 
              onClick={() => setTab('general')}
              className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all active:scale-95 ${tab === 'general' ? 'bg-white text-[#E31E24] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              عام
            </button>
            <button 
              onClick={() => isManagement && setTab('requests')}
              disabled={!isManagement}
              className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all active:scale-95 ${tab === 'requests' ? 'bg-white text-[#E31E24] shadow-sm' : 'text-slate-500 hover:text-slate-700'} ${!isManagement ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
            >
              الطلبات
            </button>
            <button 
              onClick={() => setTab('chat')}
              className={`flex-1 py-3 text-center rounded-xl text-xs font-black transition-all active:scale-95 ${tab === 'chat' ? 'bg-white text-[#E31E24] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              الدردشة
            </button>
          </div>

          {tab === 'general' && isManagement && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className="w-full py-4 bg-[#E31E24] text-white rounded-3xl text-sm font-black shadow-xl shadow-red-100 flex items-center justify-center gap-2 active:scale-95 transition-all mb-2"
            >
              <span className="material-symbols-outlined">add_circle</span>
              إنشاء تنبيه جديد
            </button>
          )}

          {renderContent()}
        </main>

        {/* New Chat Modal */}
        <AnimatePresence>
          {showChatModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-lg rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white sticky top-0 z-10">
                  <h3 className="text-xl font-black text-slate-900">بدء محادثة جديدة</h3>
                  <button 
                    onClick={() => setShowChatModal(false)}
                    className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="p-8 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                  {chatLoading ? (
                    <div className="flex justify-center py-10">
                      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : chatUsers.length > 0 ? (
                    chatUsers.map((u) => (
                      <div key={u.uid} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white shadow-sm">
                            <img 
                              src={u.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName)}&background=random`} 
                              alt="" 
                              className="w-full h-full object-cover" 
                            />
                          </div>
                          <div className="text-right">
                            <h4 className="text-sm font-black text-slate-900">{u.displayName}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase  ">
                              {u.role === 'manager' ? 'مدير' : u.role === 'admin' ? 'مسؤول' : u.jobTitle || 'موظف'}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => startChat(u)}
                          className="w-10 h-10 bg-white text-[#E31E24] rounded-xl flex items-center justify-center shadow-sm hover:shadow-md transition-all active:scale-90"
                        >
                          <span className="material-symbols-outlined">chat</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-10 text-slate-400 font-bold">
                      لا يوجد أشخاص متاحين للمحادثة في مجموعتك
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Notification Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-lg rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-white sticky top-0 z-10">
                  <h3 className="text-xl font-black text-slate-900">إنشاء تنبيه جديد</h3>
                  <button 
                    onClick={() => setShowCreateModal(false)}
                    className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="p-8 flex flex-col gap-6 overflow-y-auto">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   px-1">عنوان التنبيه</label>
                    <input 
                      type="text"
                      value={newNotifTitle}
                      onChange={(e) => setNewNotifTitle(e.target.value)}
                      placeholder="مثال: اجتماع طارئ"
                      className="w-full h-14 bg-slate-50 rounded-2xl px-6 font-bold text-slate-800 placeholder:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-red-100 transition-all text-right"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   px-1">محتوى التنبيه</label>
                    <textarea 
                      value={newNotifMessage}
                      onChange={(e) => setNewNotifMessage(e.target.value)}
                      placeholder="اكتب تفاصيل التنبيه هنا..."
                      rows={4}
                      className="w-full bg-slate-50 rounded-2xl p-6 font-bold text-slate-800 placeholder:text-slate-300 focus:outline-hidden focus:ring-2 focus:ring-red-100 transition-all text-right resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   px-1">نوع التنبيه</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'announcement', label: 'إعلان عام', icon: 'campaign' },
                        { id: 'attendance', label: 'جدول العمل', icon: 'schedule' },
                        { id: 'salary', label: 'رواتب', icon: 'payments' },
                        { id: 'request', label: 'طلب إداري', icon: 'description' }
                      ].map((type) => (
                        <button
                          key={type.id}
                          onClick={() => setNewNotifType(type.id as any)}
                          className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${newNotifType === type.id ? 'bg-red-50 border-red-100 text-[#E31E24]' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'}`}
                        >
                          <span className={`material-symbols-outlined ${newNotifType === type.id ? 'filled-icon' : ''}`}>{type.icon}</span>
                          <span className="text-xs font-black">{type.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-slate-50/50 flex gap-4 sticky bottom-0 z-10 backdrop-blur-md">
                  <button 
                    onClick={createNotification}
                    disabled={isSubmitting || !newNotifTitle || !newNotifMessage}
                    className="flex-1 h-14 bg-[#E31E24] text-white rounded-2xl font-black text-sm shadow-xl shadow-red-100 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {isSubmitting ? 'جاري الإرسال...' : 'إرسال التنبيه'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {selectedSchedule && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white w-full max-w-lg rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              >
                {/* Header Section */}
                <div className="p-8 border-b border-slate-50 flex justify-between items-start bg-white relative">
                  <div className="text-right">
                    <span className="text-[10px] font-black text-[#E31E24] uppercase   bg-red-50 px-3 py-1 rounded-full mb-3 inline-block">
                      جدول عمل رسمي
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 leading-tight">
                      {selectedSchedule.metadata?.title || 'تفاصيل جدول العمل'}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="material-symbols-outlined text-slate-400 text-sm">calendar_today</span>
                      <p className="text-xs font-bold text-slate-400">{selectedSchedule.metadata?.scheduleDate}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedSchedule(null)}
                    className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all active:scale-90"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                  {/* Notes Section if exists */}
                  {selectedSchedule.metadata?.notes && (
                    <div className="mb-8 p-6 bg-amber-50/50 rounded-[30px] border border-amber-100/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-amber-600 text-sm">lightbulb</span>
                        <h4 className="text-[10px] font-black text-amber-700 uppercase  ">ملاحظات الإدارة</h4>
                      </div>
                      <p className="text-sm font-bold text-amber-900/70 leading-relaxed">
                        {selectedSchedule.metadata.notes}
                      </p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase   px-1">قائمة الموظفين والمناوبات</h4>
                    {selectedSchedule.metadata?.scheduleEntries?.map((entry: any, idx: number) => (
                      <div key={idx} className="group relative">
                        <div className="flex items-center justify-between p-5 bg-white rounded-[24px] border border-slate-100 transition-all hover:shadow-md hover:border-slate-200">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-red-50 group-hover:text-[#E31E24] transition-colors">
                              <span className="material-symbols-outlined">person</span>
                            </div>
                            <div className="text-right">
                              <h4 className="text-sm font-black text-slate-900 group-hover:text-[#E31E24] transition-colors">{entry.userName}</h4>
                              <p className="text-[10px] font-black text-slate-400 uppercase   mt-0.5">{entry.role}</p>
                            </div>
                          </div>
                          <div className="text-left flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 group-hover:bg-white transition-colors">
                              <span className="material-symbols-outlined text-[14px] text-slate-400">schedule</span>
                              <span className="text-[11px] font-black text-slate-700">
                                {formatTime12h(entry.startTime)} - {formatTime12h(entry.endTime)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 pt-8 border-t border-slate-50">
                    <div className="flex items-center justify-center gap-2 text-slate-300">
                      <div className="h-px w-8 bg-slate-100"></div>
                      <p className="text-[10px] font-black uppercase  ">نهاية التقرير</p>
                      <div className="h-px w-8 bg-slate-100"></div>
                    </div>
                  </div>
                </div>

                <div className="p-8 bg-white border-t border-slate-50 flex gap-4">
                  <button 
                    onClick={() => setSelectedSchedule(null)}
                    className="flex-1 h-14 bg-slate-900 text-white rounded-2xl font-black text-sm active:scale-95 transition-all shadow-xl shadow-slate-200"
                  >
                    إغلاق العرض
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
