import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { motion } from 'motion/react';
import { User } from '../types';

export default function AccountVerificationScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [userData, setUserData] = useState<User | null>(null);
  const navigate = useNavigate();

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as User;
        setUserData(data);
        if (data.isVerified) {
          navigate(data.role === 'employee' ? '/employee/home' : '/admin/home');
        }
      }
    });

    return () => unsubscribe();
  }, [user, navigate]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerify = async () => {
    const enteredCode = code.join('');
    if (enteredCode.length !== 6) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام');
      return;
    }

    if (!user || !userData) return;

    setLoading(true);
    setError('');

    try {
      if (enteredCode === userData.verificationCode) {
        await updateDoc(doc(db, 'users', user.uid), {
          isVerified: true
        });
        // Navigation is handled by the onSnapshot listener
      } else {
        setError('رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى.');
      }
    } catch (err: any) {
      setError('حدث خطأ أثناء التحقق. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col justify-center items-center p-6 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="flex justify-center mb-8">
          <img alt="Logo" className="h-20" src="/icon.png" />
        </div>

        <div className="bg-white rounded-[40px] p-10 shadow-xl shadow-slate-200/50 text-center">
          <div className="w-20 h-20 bg-blue-50 text-[#E31E24] rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">verified_user</span>
          </div>
          
          <h1 className="text-2xl font-bold text-slate-800 mb-2">تأكيد الحساب</h1>
          <p className="text-slate-500 font-bold mb-8 leading-relaxed text-sm">
            يرجى إدخال رمز التحقق المكون من 6 أرقام لتفعيل حسابك
          </p>

          <div className="flex justify-center gap-2 mb-8" dir="ltr">
            {code.map((digit, idx) => (
              <input
                key={idx}
                id={`code-${idx}`}
                type="text"
                inputMode="numeric"
                value={digit}
                onChange={(e) => handleChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className="w-12 h-14 bg-slate-50 border border-slate-100 rounded-xl text-center text-xl font-bold text-slate-800 focus:outline-none focus:border-[#E31E24] focus:bg-white transition-all"
                maxLength={1}
              />
            ))}
          </div>

          {/* Dev/Demo Mode Code Display */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-8 text-center">
            <p className="text-[10px] text-amber-600 font-bold uppercase   mb-1">وضع التطوير (تجنب Gmail)</p>
            <p className="text-lg font-mono font-bold text-amber-800  ">
              {userData?.verificationCode || '------'}
            </p>
            <p className="text-[10px] text-amber-400 mt-1">استخدم هذا الرمز للتفعيل فوراً</p>
          </div>

          {error && <p className="text-red-500 text-xs font-bold mb-6">{error}</p>}

          <button 
            onClick={handleVerify}
            disabled={loading || code.some(d => !d)}
            className="w-full py-4 bg-[#E31E24] text-white rounded-2xl font-bold shadow-lg shadow-red-100 hover:bg-red-700 transition-all active:scale-95 disabled:opacity-50 mb-4"
          >
            {loading ? 'جاري التحقق...' : 'تفعيل الحساب الآن'}
          </button>

          <button 
            onClick={() => navigate(userData?.role === 'employee' ? '/employee/home' : '/admin/home')}
            className="w-full py-4 bg-white border border-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-50 transition-all active:scale-95 mb-6"
          >
            تخطي الآن
          </button>

          <button 
            onClick={handleLogout}
            className="text-slate-400 font-bold hover:text-slate-600 transition-colors text-sm"
          >
            تسجيل خروج والعودة للرئيسية
          </button>
        </div>
      </motion.div>
    </div>
  );
}
