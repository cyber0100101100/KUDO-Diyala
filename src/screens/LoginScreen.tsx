import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const navigate = useNavigate();
  const { role: urlRole } = useParams<{ role: string }>();
  const role = urlRole || 'employee';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // STRICT ROLE VALIDATION
        if (userData.role !== role && userData.role !== 'admin' && userData.role !== 'supervisor') {
          await auth.signOut();
          if (role === 'employee') {
            setError('هذا الحساب مسجل كمدير. يرجى التوجه لصفحة دخول المديرين.');
          } else {
            setError('هذا الحساب مسجل كموظف. يرجى التوجه لصفحة دخول الموظفين.');
          }
          return;
        }

        // If employee logs in, redirect to employee home
        if (userData.role === 'employee') {
          navigate('/employee/home');
        } else if (userData.role === 'admin' || userData.role === 'supervisor') {
          // Admins/Supervisors can use both, but default to employee view if they used the employee login
          if (role === 'employee') {
            navigate('/employee/home');
          } else {
            navigate('/admin/home');
          }
        } else {
          navigate('/admin/home');
        }
      } else {
        await auth.signOut();
        setError('بيانات الدور غير موجودة لهذا الحساب. يرجى التواصل مع الدعم التقني.');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('بيانات الدخول غير صحيحة. هل تود إنشاء حساب جديد؟');
      } else if (err.code === 'auth/too-many-requests') {
        setError('محاولات كثيرة خاطئة. تم تجميد الحساب مؤقتاً.');
      } else {
        setError('فشل تسجيل الدخول. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, provider);
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // Create user record if it doesn't exist
        const userData = {
          uid: result.user.uid,
          displayName: result.user.displayName || 'مستخدم جديد',
          email: result.user.email,
          phone: result.user.phoneNumber || '',
          role: role,
          employeeId: `KUDO-G-${Math.floor(1000 + Math.random() * 9000)}`,
          enrollmentComplete: false,
          baseSalary: 4000,
          jobTitle: role === 'employee' ? 'موظف خدمة' : 'مدير فرع',
          group: 'الفرع الرئيسي',
          createdAt: serverTimestamp()
        };
        await setDoc(userDocRef, userData);
        
        if (role === 'employee') {
          navigate('/employee/home');
        } else {
          navigate('/admin/home');
        }
      } else {
        const userData = userDoc.data();
        
        // Validate if the user role matches the selected role
        // Admins and supervisors can log into any role
        const isAdmin = userData.role === 'admin' || userData.role === 'supervisor' || userData.role === 'manager';
        
        if (!isAdmin && userData.role !== role) {
          await auth.signOut();
          if (role === 'employee') {
            setError('هذا الحساب مسجل كمدير. يرجى اختيار "أنا مدير" لتسجيل الدخول.');
          } else {
            setError('هذا الحساب مسجل كموظف. يرجى اختيار "أنا موظف" لتسجيل الدخول.');
          }
          return;
        }

        if (userData.role === 'employee') {
          navigate('/employee/home');
        } else {
          navigate('/admin/home');
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setError('تم حظر النافذة المنبثقة. يرجى السماح بالمنبثقات لهذا الموقع.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('هذا الحساب موجود بالفعل باستخدام وسيلة دخول مختلفة. يرجى تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور.');
      } else {
        setError('فشل تسجيل الدخول باستخدام Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen flex items-center justify-center p-6 font-sans antialiased selection:bg-red-100 relative">
      <Link 
        to="/" 
        className="absolute top-8 right-8 flex items-center gap-2 text-slate-400 hover:text-[#E31E24] font-black text-xs transition-colors group"
      >
        <span>الرجوع للرئيسية</span>
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </Link>
      <div className="bg-white rounded-[48px] shadow-[0_32px_64px_-12px_rgba(15,23,42,0.08)] w-full max-w-md p-10 flex flex-col items-center border border-slate-100/50">
        <div className="flex flex-col items-center mb-10 w-full">
          <div className="w-full h-24 flex items-center justify-center mb-10 px-8">
            <img src="/icon.png" alt="KUDO KUDO" className="h-full object-contain" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-2  ">
            {role === 'manager' ? 'مدير كودو' : 'موظف كودو'}
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase   opacity-70">أهلاً بك، يرجى تسجيل الدخول</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full bg-red-50 text-[#E31E24] p-5 rounded-2xl text-center mb-8 font-bold text-xs border border-red-100/50 flex flex-col items-center gap-2.5"
          >
            <span>{error}</span>
            {error.includes('إنشاء حساب') && (
              <Link to={`/signup/${role}`} className="underline decoration-2 underline-offset-4 decoration-red-200 hover:text-red-700 transition-colors">
                انتقل لصفحة إنشاء الحساب
              </Link>
            )}
          </motion.div>
        )}

        <form onSubmit={handleLogin} className="w-full space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60">البريد الإلكتروني</label>
            <div className="relative group">
              <input 
                className="w-full p-4.5 border border-slate-100 rounded-2xl text-base font-bold bg-slate-50/50 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-right pr-4 pl-12"
                id="email" 
                type="text" 
                placeholder="name@kudo.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required 
              />
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#E31E24] transition-colors">mail</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60">كلمة المرور</label>
            <div className="relative group">
              <input 
                className="w-full p-4.5 border border-slate-100 rounded-2xl text-base font-bold bg-slate-50/50 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-right pr-4 pl-12"
                id="password" 
                type={showPassword ? 'text' : 'password'} 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
              <span 
                onClick={() => setShowPassword(!showPassword)}
                className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 cursor-pointer hover:text-[#E31E24] transition-colors"
              >
                {showPassword ? 'visibility' : 'visibility_off'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center text-xs text-slate-400 cursor-pointer font-bold select-none">
              <input className="ml-2 w-4.5 h-4.5 rounded-lg border-slate-200 accent-[#E31E24]" type="checkbox" />
              <span>تذكرني</span>
            </label>
            <Link className="text-xs text-[#E31E24] font-black hover:underline uppercase  er" to="/forgot-password">نسيت كلمة المرور؟</Link>
          </div>

          <button 
            disabled={loading}
            className="w-full py-5 bg-[#E31E24] text-white rounded-2xl text-lg font-bold shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] flex items-center justify-center disabled:opacity-50 disabled:shadow-none mt-4"
            type="submit"
          >
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول'}
          </button>

          <div className="text-center pt-4">
            <p className="text-slate-400 font-bold text-xs uppercase  ">
              ليس لديك حساب؟{' '}
              <Link to={`/signup/${role}`} className="text-[#E31E24] font-black hover:underline mr-1">إنشاء حساب جديد</Link>
            </p>
          </div>
        </form>

        <div className="w-full flex items-center text-center my-10 text-slate-200 text-[10px] font-black before:content-[''] before:flex-1 before:border-b before:border-slate-50 before:ml-4 after:content-[''] after:flex-1 after:border-b after:border-slate-50 after:mr-4 uppercase  ">
          أو
        </div>

        <button 
          onClick={handleGoogleLogin}
          className="w-full py-4.5 bg-white border border-slate-200 rounded-2xl text-slate-700 font-bold flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.98] shadow-sm text-sm"
          type="button"
          disabled={loading}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
          <span>المتابعة باستخدام Google</span>
        </button>
      </div>
    </div>
  );
}
