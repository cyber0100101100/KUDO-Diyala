import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { auth, db } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useEffect, useState, useRef, ChangeEvent } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Attendance } from '../types';
import { AnimatePresence, motion } from 'motion/react';
import { formatDateNumeric } from '../lib/timeUtils';
import { NotificationService } from '../services/NotificationService';

export default function ProfileScreen() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    phoneNumber: '',
    address: '',
    profileImageUrl: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.notificationsEnabled || false);

  const [stats, setStats] = useState({
    workingDays: 0,
    absenceDays: 0,
    workingHours: 0,
    lastCheckIn: '--:--'
  });

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/');
  };

  useEffect(() => {
    if (authLoading || !user) return;

    setEditForm({
      displayName: user.displayName || '',
      phoneNumber: user.phoneNumber || '',
      address: user.address || '',
      profileImageUrl: user.profileImageUrl || ''
    });

    const fetchStats = async () => {
        try {
          const now = new Date();
          const startOfMonth = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const startOfMonthStr = startOfMonth.getFullYear() + '-' + String(startOfMonth.getMonth() + 1).padStart(2, '0') + '-01';

          const q = query(
            collection(db, 'attendance'),
            where('userId', '==', user.uid),
            where('date', '>=', startOfMonthStr)
          );
          
          const snap = await getDocs(q);
          const attendanceDocs = snap.docs.map(doc => doc.data() as Attendance);
          
          const lateCount = attendanceDocs.filter(d => d.status === 'late').length;

          setStats({
            workingDays: attendanceDocs.length,
            absenceDays: Math.max(0, new Date().getDate() - attendanceDocs.length - 8),
            workingHours: attendanceDocs.length * 8,
            lastCheckIn: `${lateCount} يوم` // Re-purposing or adding lateness
          });
        } catch (err) {
          console.error('Error fetching stats:', err);
        }
      };
      fetchStats();
  }, [user, authLoading]);

  useEffect(() => {
    if (user) {
      setNotificationsEnabled(user.notificationsEnabled || false);
    }
  }, [user]);

  const handleToggleNotifications = async () => {
    if (!user) return;

    if (!notificationsEnabled) {
      // Trying to enable
      try {
        if (!('Notification' in window)) {
          alert('هذا المتصفح لا يدعم الإشعارات');
          return;
        }

        const { requestNotificationPermission } = await import('../lib/firebase');
        await requestNotificationPermission(user.uid);
        // The state will be updated via onSnapshot in AuthContext or manually if needed
        // For immediate UI feedback:
        const permission = Notification.permission;
        if (permission === 'granted') {
          setNotificationsEnabled(true);
        } else if (permission === 'denied') {
          alert('يرجى تفعيل صلاحية الإشعارات من إعدادات المتصفح/الهاتف لتتمكن من تلقي التنبيهات.');
        }
      } catch (err) {
        console.error('Error requesting notification permission:', err);
      }
    } else {
      // Disabling
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          notificationsEnabled: false
        });
        setNotificationsEnabled(false);
      } catch (err) {
        console.error('Error disabling notifications:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: editForm.displayName,
        phoneNumber: editForm.phoneNumber,
        address: editForm.address,
        profileImageUrl: editForm.profileImageUrl
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsSaving(true);

    try {
      // Compress and resize the image
      const compressedImage = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
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
            
            // Compress as JPEG with 0.7 quality
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            resolve(dataUrl);
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });

      await updateDoc(doc(db, 'users', user.uid), {
        profileImageUrl: compressedImage
      });
      setEditForm(prev => ({ ...prev, profileImageUrl: compressedImage }));
    } catch (err) {
      console.error('Error updating profile picture:', err);
      alert('حدث خطأ أثناء تحديث الصورة. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="bg-white text-slate-800 min-h-screen flex flex-col antialiased pt-16 md:pt-20" dir="rtl">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b border-slate-100/50 shadow-sm">
        <button onClick={() => navigate(-1)} className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
          <span className="material-symbols-outlined text-lg md:text-xl">chevron_right</span>
        </button>
        <h1 className="text-sm md:text-base font-black text-slate-900  ">الملف الشخصي</h1>
        <div className="h-9 px-3 flex items-center justify-center">
          <img src="/icon.png" alt="KUDO" className="h-4 md:h-5 object-contain grayscale opacity-40" />
        </div>
      </header>

      <main className="flex-1 p-6 pb-32 flex flex-col gap-6 max-w-2xl mx-auto w-full">
        {/* Profile Picture Section */}
        <section className="flex flex-col items-center gap-4 py-4">
          <div className="relative group">
            <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-white border-4 border-white shadow-xl overflow-hidden relative group-hover:scale-[1.02] transition-transform duration-500">
              {editForm.profileImageUrl ? (
                <img 
                  src={editForm.profileImageUrl} 
                  alt={user.displayName} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                  <span className="material-symbols-outlined text-4xl">person</span>
                </div>
              )}
              {isSaving && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                  <div className="w-6 h-6 border-3 border-[#E31E24]/30 border-t-[#E31E24] rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-9 h-9 bg-[#E31E24] text-white rounded-xl shadow-lg shadow-red-200 flex items-center justify-center active:scale-90 transition-all border-2 border-white"
            >
              <span className="material-symbols-outlined text-xl">add_a_photo</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="image/*" 
              className="hidden" 
            />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-black text-slate-900  ">{user.displayName}</h2>
            <p className="text-[10px] font-black text-[#E31E24] uppercase   mt-1">{user.jobTitle || 'موظف'}</p>
          </div>
        </section>

        {/* Personal Information Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase   px-4 opacity-60">المعلومات الشخصية</h3>
          <div className="bg-white rounded-[32px] border border-slate-50 shadow-sm overflow-hidden">
            <div className="flex flex-col divide-y divide-slate-50">
              <InfoItem label="الاسم الكامل" value={user.displayName} icon="person" />
              <InfoItem label="رقم الهاتف" value={user.phoneNumber || 'غير متوفر'} icon="phone" />
              <InfoItem label="العنوان" value={user.address || 'غير محدد'} icon="home" />
              <InfoItem label="المسمى الوظيفي" value={user.jobTitle || 'غير محدد'} icon="work" />
              <InfoItem 
                label="تاريخ الانضمام" 
                value={user.joinedAt ? 
                  formatDateNumeric(user.joinedAt.seconds * 1000) : 
                  '2024/01/12'
                } 
                icon="calendar_today" 
              />
            </div>
          </div>
        </section>

        {/* Work Information Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase   px-4 opacity-60">معلومات العمل</h3>
          <div className="grid grid-cols-2 gap-4">
            <WorkCard label="المجموعة" value={user.group || 'كودو ديالى'} icon="location_on" />
            <WorkCard label="الدور الوظيفي" value={user.jobTitle || 'موظف'} icon="person_pin" />
            <WorkCard label="نوع الدوام" value="دوام كامل" icon="schedule" />
            <WorkCard label="حالة الموظف" value="نشط" icon="check_circle" isStatus />
          </div>
        </section>

        {/* Notification Settings Section */}
        <section className="space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase px-4 opacity-60 tracking-widest">إعدادات التنبيهات الذكية</h3>
          <div className="bg-white rounded-[32px] border border-slate-50 shadow-xl shadow-slate-100/50 overflow-hidden group/card transition-all hover:shadow-2xl hover:shadow-slate-200/50">
            <div className="flex flex-col divide-y divide-slate-50">
              <div className="flex items-center justify-between p-6 md:p-8">
                <div className="flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 ${notificationsEnabled ? 'bg-emerald-50 text-emerald-500 scale-110' : 'bg-slate-50 text-slate-300'}`}>
                    <span className={`material-symbols-outlined text-2xl ${notificationsEnabled ? 'filled-icon' : ''}`}>
                      {notificationsEnabled ? 'notifications_active' : 'notifications'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm md:text-base font-black text-slate-900 mb-0.5">تفعيل تنبيهات التطبيق</span>
                    <span className="block text-[10px] md:text-xs font-medium text-slate-400 uppercase leading-relaxed">إشعارات الرواتب والدوام والتعميمات الرسمية</span>
                  </div>
                </div>
                <button 
                  onClick={handleToggleNotifications}
                  aria-label="Toggle Notifications"
                  className={`w-14 h-7 rounded-full relative p-1.5 cursor-pointer transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${notificationsEnabled ? 'bg-emerald-500 shadow-lg shadow-emerald-100' : 'bg-slate-200 shadow-inner'}`}
                >
                  <motion.div 
                    animate={{ x: notificationsEnabled ? 28 : 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`w-4 h-4 rounded-full shadow-md transition-colors duration-300 ${notificationsEnabled ? 'bg-white' : 'bg-slate-400'}`}
                  />
                </button>
              </div>
              
              {notificationsEnabled && (
                <div className="px-6 pb-6 pt-2">
                  <button
                    onClick={() => NotificationService.send(user.uid, 'نظام كودو - اختبار التنبيهات', 'أهلاً بك! نظام التنبيهات الذكي يعمل بنجاح على جهازك.')}
                    className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] border border-slate-100"
                  >
                    إرسال إشعار تجريبي للاختبار
                  </button>
                </div>
              )}
            </div>
          </div>
          {notificationsEnabled && (
             <motion.p 
               initial={{ opacity: 0, y: -5 }}
               animate={{ opacity: 1, y: 0 }}
               className="text-[9px] font-black text-emerald-600 text-center uppercase tracking-tighter"
             >
               • التنبيهات مفعلة الآن على هذا الجهاز •
             </motion.p>
          )}
        </section>

        {/* Attendance Summary Section */}
        <section className="space-y-4">
          <h3 className="text-[9px] font-black text-slate-400 uppercase   px-4 opacity-60">سجل الحضور الشهري</h3>
          <div className="bg-slate-900 rounded-[32px] md:rounded-[48px] p-6 md:p-10 text-white relative overflow-hidden shadow-2xl shadow-slate-300">
            <div className="absolute top-0 left-0 w-32 h-32 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl opacity-20"></div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-8 relative z-10">
              <StatItem label="أيام العمل" value={`${user.workDaysCount || 0} / 30`} />
              <StatItem label="أيام الغياب" value={`${stats.absenceDays} يوم`} />
              <StatItem label="عدد التأخيرات" value={`${user.lateCount || 0} مرة`} />
              <StatItem label="ساعات العمل" value={`${stats.workingHours} ساعة`} />
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="flex flex-col gap-4 mt-4">
          <button 
            onClick={() => setIsEditing(true)}
            className="flex items-center justify-between p-6 bg-white rounded-3xl border border-slate-50 shadow-sm transition-all hover:border-slate-200 active:scale-[0.98] group"
          >
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-[#E31E24] transition-colors">
                <span className="material-symbols-outlined text-2xl">edit_note</span>
              </div>
              <div className="text-right">
                <span className="block text-sm font-black text-slate-800  ">تعديل البيانات</span>
                <span className="block text-[10px] font-bold text-slate-400 uppercase   opacity-60">تحديث معلوماتك الشخصية</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-slate-300 text-xl">chevron_left</span>
          </button>

          <button 
            onClick={handleSignOut}
            className="flex items-center justify-center gap-3 p-6 bg-[#E31E24] rounded-[32px] shadow-xl shadow-red-100 text-white font-black transition-all active:scale-[0.98] mt-2 uppercase   text-sm"
          >
            <span className="material-symbols-outlined text-2xl">logout</span>
            <span>تسجيل الخروج</span>
          </button>
        </section>
      </main>

      {/* Edit Form Overlay */}
      <AnimatePresence>
        {isEditing && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 m-auto bg-white rounded-[32px] md:rounded-[40px] z-50 p-6 md:p-8 shadow-2xl h-fit max-h-[90vh] w-[90%] max-w-lg overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-slate-800">تعديل البيانات</h3>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-400"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 mr-2">الاسم الكامل</label>
                  <input 
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm({...editForm, displayName: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:border-[#EC0B01] focus:ring-1 focus:ring-[#EC0B01] outline-none transition-all font-bold text-slate-700"
                    placeholder="أدخل الاسم الكامل"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 mr-2">رقم الهاتف</label>
                  <input 
                    type="tel"
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm({...editForm, phoneNumber: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:border-[#EC0B01] focus:ring-1 focus:ring-[#EC0B01] outline-none transition-all font-bold text-slate-700"
                    placeholder="أدخل رقم الهاتف"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 mr-2">العنوان</label>
                  <input 
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm({...editForm, address: e.target.value})}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:border-[#EC0B01] focus:ring-1 focus:ring-[#EC0B01] outline-none transition-all font-bold text-slate-700"
                    placeholder="أدخل العنوان الحالي"
                  />
                </div>


                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex-1 bg-[#EC0B01] text-white p-5 rounded-2xl font-bold shadow-lg shadow-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      <span className="material-symbols-outlined text-xl">save</span>
                    )}
                    <span>حفظ التغييرات</span>
                  </button>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-8 bg-slate-100 text-slate-500 rounded-2xl font-bold active:scale-[0.98] transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </>
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

function WorkCard({ label, value, icon, isStatus }: { label: string, value: string, icon: string, isStatus?: boolean }) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-slate-100 flex flex-col gap-3 shadow-sm">
      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-300 border border-slate-100">
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold text-slate-400 mb-1">{label}</span>
        <span className={`text-xs font-bold ${isStatus ? 'text-green-600' : 'text-slate-700'}`}>{value}</span>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-bold text-white/50 mb-1">{label}</span>
      <span className="text-xl font-black">{value}</span>
    </div>
  );
}
