import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Attendance, User } from '../types';
import { useAuth } from '../hooks/useAuth';
import { formatDateNumeric } from '../lib/timeUtils';
import AdminTopHeader from '../components/AdminTopHeader';

export default function AdminEmployeeProfileScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: adminUser, loading: authLoading } = useAuth();
  const [employee, setEmployee] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isStartingChat, setIsStartingChat] = useState(false);

  useEffect(() => {
    async function fetchEmployeeData() {
      if (authLoading || !adminUser || !id) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', id));
        if (userDoc.exists()) {
          const userData = { uid: userDoc.id, ...userDoc.data() } as User;
          setEmployee(userData);
          setNewJobTitle(userData.jobTitle || '');
          setNewDisplayName(userData.displayName || '');
        }
      } catch (err) {
        console.error('Error fetching employee data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchEmployeeData();
  }, [id, adminUser, authLoading]);

  const handleUpdateProfile = async () => {
    if (!id || !newDisplayName.trim()) {
      alert('يرجى إدخال اسم الموظف');
      return;
    }
    setIsUpdating(true);
    try {
      await updateDoc(doc(db, 'users', id), { 
        jobTitle: newJobTitle,
        displayName: newDisplayName
      });
      setEmployee(prev => prev ? { ...prev, jobTitle: newJobTitle, displayName: newDisplayName } : null);
      setIsEditing(false);
      alert('تم تحديث الملف الشخصي بنجاح');
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('حدث خطأ أثناء التحديث');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!adminUser || !employee) return;
    setIsStartingChat(true);
    try {
      // Check if chat exists
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', adminUser.uid)
      );
      const snap = await getDocs(q);
      const existingChat = snap.docs.find(d => {
        const data = d.data();
        return data.participants.includes(employee.uid);
      });

      if (existingChat) {
        navigate(`/admin/chat/${existingChat.id}`);
      } else {
        // Create new chat
        const newChat = await addDoc(collection(db, 'chats'), {
          participants: [adminUser.uid, employee.uid],
          lastUpdate: serverTimestamp(),
          lastMessage: '',
          unreadCount: {
            [adminUser.uid]: 0,
            [employee.uid]: 0
          }
        });
        navigate(`/admin/chat/${newChat.id}`);
      }
    } catch (err) {
      console.error('Error starting chat:', err);
      alert('حدث خطأ أثناء بدء المحادثة');
    } finally {
      setIsStartingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#E31E24] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">person_off</span>
        <h2 className="text-xl font-black text-slate-900">الموظف غير موجود</h2>
        <button onClick={() => navigate(-1)} className="mt-6 px-6 py-3 bg-[#E31E24] text-white rounded-2xl font-black">
          العودة للخلف
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white text-slate-800 min-h-screen flex flex-col antialiased pt-16 md:pt-20" dir="rtl">
      <AdminTopHeader 
        title="ملف الموظف"
        rightAction={
          <button 
            onClick={() => {
              setNewJobTitle(employee.jobTitle || '');
              setNewDisplayName(employee.displayName || '');
              setIsEditing(true);
            }}
            className="w-9 h-9 md:w-10 md:h-10 flex-shrink-0 flex items-center justify-center rounded-xl bg-slate-50 text-[#E31E24] hover:bg-red-50 transition-all active:scale-95 border border-red-100/50"
          >
            <span className="material-symbols-outlined text-lg md:text-xl">edit_note</span>
          </button>
        }
      />

      <main className="flex-1 p-6 pb-32 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        {/* Employee Profile Section */}
        <div className="flex flex-col items-center gap-6 bg-white p-6 md:p-10 rounded-[32px] md:rounded-[48px] border border-slate-50 shadow-2xl shadow-slate-200/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-[#E31E24]"></div>
          
          <div className="relative">
            <img 
              className="w-24 h-24 md:w-28 md:h-28 rounded-3xl object-cover border-4 border-white shadow-xl" 
              src={employee.profileImageUrl || "https://ui-avatars.com/api/?name=" + employee.displayName} 
              alt={employee.displayName} 
            />
            <div className="absolute -top-2 -right-2 w-8 h-8 md:w-9 md:h-9 bg-green-500 rounded-lg md:rounded-xl border-4 border-white flex items-center justify-center text-white shadow-sm">
              <span className="material-symbols-outlined text-[10px] filled-icon">verified</span>
            </div>
          </div>
          
          <div className="text-center space-y-1">
            <h2 className="text-xl md:text-2xl font-black text-slate-900  ">{employee.displayName}</h2>
            <div className="flex flex-col gap-2 items-center">
              <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase   opacity-60">ID: {employee.employeeId}</span>
              <div className="px-4 py-1.5 bg-red-50 rounded-full border border-red-100/50 mt-1">
                <span className="text-[9px] md:text-[10px] font-black text-[#E31E24] uppercase  ">{employee.jobTitle}</span>
              </div>
              <span className="text-[9px] md:text-[10px] font-black text-slate-500 mt-1 opacity-40 uppercase  ">{employee.group}</span>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <button 
              disabled={isStartingChat}
              onClick={handleSendMessage}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-[11px] uppercase   shadow-lg shadow-slate-200 active:scale-95 transition-all hover:bg-slate-800 disabled:opacity-70"
            >
              <span className="material-symbols-outlined text-lg">forum</span>
              {isStartingChat ? 'جاري التحميل...' : 'إرسال رسالة'}
            </button>
          </div>
        </div>

        {/* Personal Information Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase   px-4 opacity-60">المعلومات الشخصية</h3>
          <div className="bg-white rounded-[32px] border border-slate-50 shadow-sm overflow-hidden">
            <div className="flex flex-col divide-y divide-slate-50">
              <InfoItem label="الاسم الكامل" value={employee.displayName} icon="person" />
              <InfoItem label="رقم الهاتف" value={employee.phoneNumber || 'غير متوفر'} icon="phone" />
              <InfoItem label="العنوان" value={employee.address || 'غير محدد'} icon="home" />
              <InfoItem label="المسمى الوظيفي" value={employee.jobTitle || 'غير محدد'} icon="work" />
              <InfoItem 
                label="تاريخ الانضمام" 
                value={employee.joinedAt ? 
                  formatDateNumeric(employee.joinedAt.seconds * 1000) : 
                  '2024/01/12'
                } 
                icon="calendar_today" 
              />
            </div>
          </div>
        </section>

        {/* Statistics Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase   px-4 opacity-60">إحصائيات الدورة الحالية</h3>
          <div className="bg-slate-900 rounded-[32px] p-8 text-white">
            <div className="grid grid-cols-2 gap-8">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-white/40 uppercase  ">أيام العمل المكتملة</span>
                <span className="text-xl font-black">{employee.workDaysCount || 0} / 30</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-white/40 uppercase  ">إجمالي التأخيرات</span>
                <span className={`text-xl font-black ${(employee.lateCount || 0) >= 4 ? 'text-red-400' : 'text-white'}`}>{employee.lateCount || 0} مرة</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-white/40 uppercase  ">بداية الدورة</span>
                <span className="text-xs font-bold">{employee.cycleStartDate || 'لم تبدأ بعد'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-white/40 uppercase  ">الراتب الأساسي</span>
                <span className="text-xs font-bold">{Math.trunc(employee.baseSalary || 0).toLocaleString()} د.ع</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Edit Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[32px] w-full max-w-sm p-8 shadow-2xl relative z-10 overflow-hidden"
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto mb-6">
                  <span className="material-symbols-outlined text-3xl">person_edit</span>
                </div>

                <h3 className="text-xl font-black text-slate-900 mb-2">تعديل ملف الموظف</h3>
                <p className="text-xs font-bold text-slate-400 mb-8 px-4">قم بتحديث اسم الموظف ومسماه الوظيفي أدناه</p>

                <div className="relative mb-6 text-right">
                  <label className="block text-[10px] font-black text-slate-400 uppercase   mb-2 pr-2">الاسم الكامل</label>
                  <input 
                    type="text"
                    placeholder="أدخل الاسم الكامل"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-right text-sm font-black text-slate-700 focus:outline-none focus:border-red-100"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                  />
                </div>

                <div className="relative mb-8 text-right">
                  <label className="block text-[10px] font-black text-slate-400 uppercase   mb-2 pr-2">المسمى الوظيفي</label>
                  <input 
                    type="text"
                    placeholder="مثال: مدير مبيعات"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-right text-sm font-black text-slate-700 focus:outline-none focus:border-red-100"
                    value={newJobTitle}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    disabled={isUpdating}
                    onClick={() => setIsEditing(false)}
                    className="flex-1 py-4 bg-slate-50 text-slate-400 rounded-2xl font-black text-sm active:scale-95 transition-transform"
                  >
                    إلغاء
                  </button>
                  <button 
                    disabled={isUpdating}
                    onClick={handleUpdateProfile}
                    className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-sm active:scale-95 transition-transform shadow-lg shadow-slate-200"
                  >
                    {isUpdating ? 'جاري الحفظ...' : 'حفظ التعديلات'}
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

function InfoItem({ label, value, icon }: { label: string, value: string, icon: string }) {
  return (
    <div className="flex items-center justify-between p-5 hover:bg-white/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-slate-400 border border-slate-100">
          <span className="material-symbols-outlined text-lg">{icon}</span>
        </div>
        <span className="text-[10px] font-bold text-slate-400">{label}</span>
      </div>
      <span className="text-xs font-bold text-slate-700">{value}</span>
    </div>
  );
}
