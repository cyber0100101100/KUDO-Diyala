import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { collection, query, getDocs, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useAuth } from '../hooks/useAuth';
import { Group } from '../types';

export default function JoinGroupScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.groupStatus === 'joined') {
      navigate('/employee/home');
      return;
    }

    const fetchGroups = async () => {
      try {
        const q = query(collection(db, 'groups'));
        const snap = await getDocs(q);
        const fetchedGroups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
        setGroups(fetchedGroups);
      } catch (err) {
        console.error('Error fetching groups:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [user, navigate]);

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleJoinRequest = async (groupId: string, groupName: string) => {
    if (!user || requestingId) return;
    setRequestingId(groupId);

    try {
      // 1. Create a request in 'requests' collection
      await addDoc(collection(db, 'requests'), {
        userId: user.uid,
        userName: user.displayName,
        type: 'group_join',
        groupId: groupId,
        groupName: groupName,
        status: 'pending',
        createdAt: serverTimestamp(),
        reason: `طلب انضمام إلى مجموعة: ${groupName}`
      });

      // 2. Update user's groupStatus to 'pending'
      await updateDoc(doc(db, 'users', user.uid), {
        groupStatus: 'pending',
        groupId: groupId
      });

      alert('تم إرسال طلب الانضمام بنجاح. يرجى انتظار موافقة المدير.');
    } catch (err) {
      console.error('Error joining group:', err);
      alert('حدث خطأ أثناء إرسال الطلب');
    } finally {
      setRequestingId(null);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans rtl flex flex-col p-6 items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-[40px] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden">
        <div className="p-8 pb-4 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
            <span className="material-symbols-outlined text-3xl text-[#E31E24]">group_add</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-1">انضم إلى مجموعة عمل</h1>
          <p className="text-[10px] font-bold text-slate-400">يرجى اختيار مجموعة العمل التي تتبع لها للمتابعة</p>
        </div>

        {user?.groupStatus === 'pending' ? (
          <div className="p-10 text-center">
            <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-4xl text-amber-500 animate-pulse">hourglass_top</span>
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-2">طلبك قيد الانتظار</h3>
            <p className="text-xs font-bold text-slate-400 leading-relaxed max-w-[240px] mx-auto mb-8">
              لقد قمت بالفعل بإرسال طلب انضمام. سيتم تفعيل حسابك بالكامل بمجرد موافقة المدير على طلبك.
            </p>
            
            <button
              onClick={handleLogout}
              className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-xs hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              تسجيل الخروج والعودة
            </button>
          </div>
        ) : (
          <div className="p-8 pt-0">
            {/* Search Box */}
            <div className="relative mb-6">
              <input 
                type="text"
                placeholder="ابحث عن مجموعة..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3.5 pr-12 pl-4 text-right text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
              />
              <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredGroups.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-slate-200 text-4xl mb-2">sentiment_dissatisfied</span>
                  <p className="text-[10px] font-bold text-slate-400">لا توجد مجموعات تطابق بحثك</p>
                </div>
              ) : (
                filteredGroups.map(group => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl overflow-hidden bg-white shadow-sm shrink-0">
                        <img 
                          src={group.imageUrl || 'https://via.placeholder.com/150'} 
                          alt={group.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-900 text-xs truncate">{group.name}</h4>
                        <p className="text-[9px] font-bold text-slate-400">
                          {group.employeeCount || 0} موظف
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => group.id && handleJoinRequest(group.id, group.name)}
                      disabled={!!requestingId}
                      className="bg-[#E31E24] text-white px-4 py-2 rounded-xl font-black text-[10px] shadow-lg shadow-red-100 active:scale-95 transition-transform disabled:opacity-50 shrink-0"
                    >
                      {requestingId === group.id ? 'جاري...' : 'انضمام'}
                    </button>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
