import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';

export default function RequestsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialType = (location.state as any)?.type || 'leave';
  
  const [type, setType] = useState<'leave' | 'advance'>(initialType);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [daysCount, setDaysCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (type === 'leave') {
      if (!reason || !daysCount) return;
    } else {
      if (!reason || !amount) return;
    }
    
    setLoading(true);
    try {
      // 1. Send Request to Administration
      await addDoc(collection(db, 'requests'), {
        userId: user!.uid,
        type,
        amount: type === 'advance' ? Number(amount) : null,
        reason,
        startDate: null,
        endDate: null,
        daysCount: type === 'leave' ? Number(daysCount) : null,
        status: 'pending',
        createdAt: serverTimestamp()
      });

      // 2. Notification for Admin (Global)
      await addDoc(collection(db, 'notifications'), {
        userId: 'global',
        title: type === 'leave' ? 'طلب إجازة جديد' : 'طلب سلفة جديد',
        message: type === 'leave' 
          ? `قام الموظف ${user!.displayName} بتقديم طلب إجازة لمدة ${daysCount} يوم.`
          : `قام الموظف ${user!.displayName} بتقديم طلب سلفة بمبلغ ${Math.trunc(Number(amount))} د.ع.`,
        type: 'request',
        isRead: false,
        createdAt: serverTimestamp()
      });

      // 3. Notification for Employee (Self)
      await addDoc(collection(db, 'notifications'), {
        userId: user!.uid,
        title: 'تم إرسال طلبك',
        message: 'تم استلام طلبك وبانتظار مراجعة الإدارة، سيتم إشعارك عند الرد.',
        type: 'request',
        isRead: false,
        createdAt: serverTimestamp()
      });

      setSuccess(true);
      setTimeout(() => navigate('/employee/home'), 2000);
    } catch (err) {
      console.error('Error submitting request:', err);
      alert('حدث خطأ أثناء إرسال الطلب، يرجى المحاولة لاحقاً');
    } finally {
      setLoading(false);
    }
  };

  const isButtonDisabled = loading || !reason || (type === 'advance' && !amount) || (type === 'leave' && !daysCount);

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center bg-white">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-24 h-24 bg-emerald-50 text-emerald-500 rounded-[32px] flex items-center justify-center mb-6 shadow-xl shadow-emerald-100"
        >
          <span className="material-symbols-outlined text-5xl">check_circle</span>
        </motion.div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">تم إرسال الطلب بنجاح</h2>
        <p className="text-sm font-bold text-slate-400">سيتم مراجعة طلبك من قبل الإدارة فوراً</p>
      </div>
    );
  }

  return (
    <div className="bg-white text-slate-800 min-h-screen flex flex-col pt-16 md:pt-20">
      <div className="w-full bg-white min-h-screen relative flex flex-col shadow-sm">
        <header className="bg-white/90 backdrop-blur-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b border-slate-100/50 shadow-sm">
          <button onClick={() => navigate(-1)} className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
            <span className="material-symbols-outlined text-lg md:text-xl">arrow_forward</span>
          </button>
          <h1 className="text-sm md:text-base font-black text-slate-900  ">{type === 'leave' ? 'طلب إجازة' : 'طلب سلفة'}</h1>
          <div className="w-9"></div>
        </header>

        <main className="flex-1 p-6 pb-32 flex flex-col gap-8 max-w-2xl mx-auto w-full">
          <div className="flex bg-white rounded-[24px] p-1.5 border border-slate-200/40">
            <button 
              onClick={() => setType('leave')}
              className={`flex-1 py-4 text-center rounded-[18px] text-[11px] font-black uppercase   transition-all ${type === 'leave' ? 'bg-white text-slate-900 shadow-xl shadow-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
            >
              طلب إجازة
            </button>
            <button 
              onClick={() => setType('advance')}
              className={`flex-1 py-4 text-center rounded-[18px] text-[11px] font-black uppercase   transition-all ${type === 'advance' ? 'bg-white text-[#E31E24] shadow-xl shadow-red-100/20' : 'text-slate-400 hover:text-slate-600'}`}
            >
              طلب سلفة
            </button>
          </div>

          <form className="flex flex-col gap-8" onSubmit={(e) => e.preventDefault()}>
            {type === 'leave' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6"
              >
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <span className="material-symbols-outlined">info</span>
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-900">طلب إجازة</h2>
                      <p className="text-[10px] font-bold text-slate-400">سيتم مراجعة طلب الإجازة من قبل الإدارة</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase   px-2">عدد أيام الإجازة المطلوبة</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        value={daysCount}
                        onChange={(e) => setDaysCount(e.target.value)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-100 text-slate-900 text-2xl font-black rounded-2xl p-5 focus:outline-none focus:border-[#E31E24] focus:ring-4 focus:ring-red-50/50 transition-all text-center  er"
                        dir="ltr"
                      />
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase   pointer-events-none">أيام</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {type === 'advance' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                    <span className="material-symbols-outlined">payments</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-slate-900">تحديد مبلغ السلفة</h2>
                    <p className="text-[10px] font-bold text-slate-400">سيتم خصم المبلغ من الراتب القادم</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <input 
                      className="w-full bg-white border border-slate-100 text-slate-900 text-3xl font-black rounded-2xl p-6 focus:outline-none focus:border-[#E31E24] focus:ring-4 focus:ring-red-50/50 transition-all text-center  er" 
                      dir="ltr" 
                      placeholder="0" 
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300 uppercase   pointer-events-none">IQD</div>
                  </div>
                  <div className="flex justify-center gap-2 mt-2">
                    {[25000, 50000, 100000, 250000].map(val => (
                      <button 
                        key={val}
                        onClick={() => setAmount(val.toString())}
                        className="px-3 py-1.5 rounded-lg border border-slate-100 text-[10px] font-black text-slate-500 hover:border-[#E31E24] hover:text-[#E31E24] transition-all"
                      >
                        {Math.trunc(val).toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
            
            <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">notes</span>
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-900">تفاصيل الطلب</h2>
                  <p className="text-[10px] font-bold text-slate-400">يرجى توضيح سبب الاحتياج للطلب</p>
                </div>
              </div>
              
              <textarea 
                className="w-full bg-white border border-slate-100 text-slate-900 text-sm font-bold rounded-2xl p-6 h-48 resize-none focus:outline-none focus:border-[#E31E24] focus:ring-4 focus:ring-red-50/50 transition-all leading-relaxed" 
                placeholder={`اكتب هنا سبب طلبك بالتفصيل...`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="mt-4 space-y-4">
              <button 
                onClick={handleSubmit}
                disabled={isButtonDisabled}
                className="w-full py-6 bg-[#E31E24] text-white text-base font-black uppercase   rounded-[24px] shadow-2xl shadow-red-200 active:scale-[0.98] transition-all disabled:opacity-50 disabled:bg-slate-300 disabled:shadow-none flex items-center justify-center gap-3" 
                type="button"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-xl">send</span>
                    إرسال الطلب للإدارة
                  </>
                )}
              </button>
              <p className="text-center text-[10px] font-black text-slate-300 uppercase  ">بإرسالك الطلب أنت توافق على شروط الخصم الإداري</p>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
