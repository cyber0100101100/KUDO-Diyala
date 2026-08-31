import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess(true);
      setEmail('');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('عذراً، هذا البريد الإلكتروني غير مسجل في نظامنا.');
      } else if (err.code === 'auth/invalid-email') {
        setError('عنوان البريد الإلكتروني الذي أدخلته غير صالح.');
      } else {
        setError('حدث خطأ أثناء محاولة إرسال رابط إعادة التعيين. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen flex items-center justify-center p-6 font-sans antialiased rtl">
      <div className="bg-white rounded-[40px] shadow-2xl shadow-slate-200/40 w-full max-w-md p-10 flex flex-col items-center border border-white relative overflow-hidden">
        {/* Top Accent */}
        <div className="absolute top-0 left-0 w-full h-2 bg-[#E31E24]"></div>
        
        <div className="flex flex-col items-center mb-10 w-full">
          <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-[#E31E24] mb-8 shadow-sm">
            <span className="material-symbols-outlined text-2xl">lock_reset</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-2  ">استعادة كلمة المرور</h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase   opacity-70 text-center px-4">
            أدخل بريدك الإلكتروني لإرسال رابط إعادة تعيين كلمة المرور
          </p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-red-50 text-[#E31E24] p-5 rounded-2xl text-center mb-8 font-bold text-xs border border-red-100/50"
          >
            {error}
          </motion.div>
        )}

        {success && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-green-50 text-green-600 p-6 rounded-[32px] text-center mb-8 font-bold text-sm border border-green-100 flex flex-col items-center gap-3"
          >
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">check_circle</span>
            </div>
            <span>تم إرسال رابط إعادة التعيين بنجاح! يرجى التحقق من بريدك الإلكتروني.</span>
          </motion.div>
        )}

        <form onSubmit={handleReset} className="w-full space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60">البريد الإلكتروني</label>
            <div className="relative group">
              <input 
                className="w-full p-4.5 border border-slate-100 rounded-2xl text-base font-bold bg-slate-50/50 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-right pr-4 pl-12"
                id="email" 
                type="email" 
                placeholder="name@kudo.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#E31E24] transition-colors">mail</span>
            </div>
          </div>

          <button 
            disabled={loading || success}
            className="w-full py-5 bg-[#E31E24] text-white rounded-2xl text-lg font-bold shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] flex items-center justify-center disabled:opacity-50 disabled:shadow-none mt-4"
            type="submit"
          >
            {loading ? 'جاري الإرسال...' : 'إرسال رابط الاستعادة'}
          </button>

          <div className="text-center pt-6">
            <Link to="/login" className="flex items-center justify-center gap-2 text-[#E31E24] font-black hover:underline text-xs uppercase  ">
              <span>العودة لتسجيل الدخول</span>
              <span className="material-symbols-outlined text-sm">arrow_back</span>
            </Link>
          </div>
        </form>

        <div className="mt-12 w-full h-12 flex items-center justify-center opacity-20">
          <img src="/icon.png" alt="KUDO" className="h-full object-contain" />
        </div>
      </div>
    </div>
  );
}
