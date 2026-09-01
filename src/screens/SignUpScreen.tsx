import React, { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import logo from '/logo_upscayl_4x_upscayl-standard-4x.png?url';
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

export default function SignUpScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const { role: urlRole } = useParams<{ role: string }>();
  const role = urlRole || 'employee';

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('كلمات المرور غير متطابقة');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Check if user already exists in Firestore with a different role
      // This is a bit tricky without being logged in, but we can try to create
      // and if it fails with 'email-already-in-use', we can't check role until login.
      // So we rely on the LoginScreen check after they redirect there.

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: fullName });
      
      // Generate custom 6-digit verification code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      const userData = {
        uid: userCredential.user.uid,
        displayName: fullName,
        email: email,
        phone: phone,
        role: role,
        employeeId: `KUDO-${Math.floor(1000 + Math.random() * 9000)}`,
        enrollmentComplete: false,
        baseSalary: 4000,
        jobTitle: role === 'employee' ? 'موظف خدمة' : 'مدير فرع',
        groupStatus: 'none',
        createdAt: serverTimestamp(),
        verificationCode: otpCode,
        isVerified: false
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      
      // Navigate to verification screen
      navigate('/verify-email');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setError('هذا الحساب موجود بالفعل. يرجى تسجيل الدخول بدلاً من إنشاء حساب جديد.');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور ضعيفة جداً. يرجى استخدام 6 أحرف على الأقل.');
      } else if (err.code === 'auth/invalid-email') {
        setError('عنوان البريد الإلكتروني الذي أدخلته غير صالح.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('خدمة تسجيل الاشتراك معطلة حالياً.');
      } else {
        setError('حدث خطأ أثناء إنشاء الحساب. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    setLoading(true);
    setError('');
    try {
      // Use signInWithPopup which is more reliable in AI Studio preview
      const result = await signInWithPopup(auth, provider);
      const userDocRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
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
          groupStatus: 'none',
          createdAt: serverTimestamp()
        };
        await setDoc(userDocRef, userData);
      } else {
        const userData = userDoc.data();
        const isAdmin = userData.role === 'admin' || userData.role === 'supervisor' || userData.role === 'manager';
        
        if (!isAdmin && userData.role !== role) {
          await auth.signOut();
          setError(role === 'employee' ? 'هذا الحساب مسجل مسبقاً كمدير.' : 'هذا الحساب مسجل مسبقاً كموظف.');
          return;
        }
      }
      
      if (role === 'employee') {
        navigate('/employee/home');
      } else {
        navigate('/admin/home');
      }
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('تم حظر النافذة المنبثقة. يرجى السماح بالمنبثقات لهذا الموقع من إعدادات المتصفح.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('هذا الحساب موجود بالفعل باستخدام وسيلة دخول مختلفة. يرجى تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('هذا النطاق (Domain) غير مخول لتسجيل الدخول عبر Google. يرجى إضافته في إعدادات Firebase Console.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError('تم إغلاق نافذة تسجيل الدخول قبل اكتمال العملية.');
      } else {
        setError('حدث خطأ أثناء التسجيل باستخدام Google. تأكد من تفعيل الخدمة في Firebase Console.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col justify-center items-center p-6 font-sans antialiased selection:bg-red-100 relative">
      <Link 
        to="/" 
        className="absolute top-8 right-8 flex items-center gap-2 text-slate-400 hover:text-[#E31E24] font-black text-xs transition-colors group"
      >
        <span>الرجوع للرئيسية</span>
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </Link>
      <main className="w-full max-w-md mx-auto">
        <div className="flex justify-center mb-10">
          <div className="h-16 flex items-center justify-center px-8">
            <img alt="KUDO KUDO" className="h-full object-contain" src={logo} />
          </div>
        </div>

        <div className="bg-white rounded-[48px] p-10 shadow-[0_32px_64px_-12px_rgba(15,23,42,0.08)] w-full border border-slate-100/50">
          <div className="text-center mb-10 space-y-2">
            <h1 className="text-3xl font-black text-slate-800  ">إنشاء حساب</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase   opacity-70">
              {role === 'manager' ? 'التسجيل كمدير نظام' : 'التسجيل كموظف كودو'}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full bg-red-50 text-[#E31E24] p-5 rounded-2xl text-center mb-8 font-bold text-xs border border-red-100/50 flex flex-col items-center gap-2.5"
            >
              <span>{error}</span>
              {(error.includes('تسجيل الدخول') || error.includes('موجود بالفعل')) && (
                <Link to={`/login/${role}`} className="mt-2 bg-white px-4 py-2 rounded-xl border border-red-100 shadow-sm hover:shadow-md transition-all">
                  انتقل لصفحة تسجيل الدخول
                </Link>
              )}
            </motion.div>
          )}

          <form onSubmit={handleSignUp} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60" htmlFor="fullName">الاسم الكامل</label>
              <div className="relative group">
                <input 
                  className="w-full p-4.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-right pr-4 pl-12" 
                  id="fullName" 
                  placeholder="محمد علي" 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required 
                />
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#E31E24] transition-colors">person</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60" htmlFor="email">البريد الإلكتروني</label>
              <div className="relative group">
                <input 
                  className="w-full p-4.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-left pr-12 pl-4" 
                  dir="ltr" 
                  id="email" 
                  placeholder="name@kudo.com" 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#E31E24] transition-colors">mail</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60" htmlFor="phone">رقم الهاتف</label>
              <div className="relative group">
                <input 
                  className="w-full p-4.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-left pr-12 pl-4" 
                  dir="ltr" 
                  id="phone" 
                  placeholder="+964 7XX XXX XXXX" 
                  type="tel" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required 
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-[#E31E24] transition-colors">phone</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60" htmlFor="password">كلمة المرور</label>
                <div className="relative group">
                  <input 
                    className="w-full p-4.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-left pl-4" 
                    dir="ltr" 
                    id="password" 
                    placeholder="••••••••" 
                    type={showPassword ? 'text' : 'password'} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 mr-2 uppercase   opacity-60" htmlFor="confirmPassword">تأكيد المرور</label>
                <div className="relative group">
                  <input 
                    className="w-full p-4.5 bg-slate-50/50 border border-slate-100 rounded-2xl text-base font-bold text-slate-800 focus:outline-none focus:border-red-100 focus:bg-white focus:shadow-lg focus:shadow-red-500/5 transition-all text-left pl-4" 
                    dir="ltr" 
                    id="confirmPassword" 
                    placeholder="••••••••" 
                    type={showPassword ? 'text' : 'password'} 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required 
                  />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button 
                disabled={loading}
                className="w-full py-5 bg-[#E31E24] text-white rounded-2xl text-xl font-bold shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:shadow-none" 
                type="submit"
              >
                {loading ? 'جاري إنشاء الحساب...' : 'إنشاء حساب جديد'}
              </button>
            </div>
          </form>

          <div className="mt-10 text-center">
            <p className="text-xs font-bold text-slate-400 uppercase  ">
              لديك حساب بالفعل؟{' '}
              <Link to={`/login/${role}`} className="text-[#E31E24] font-black hover:underline mr-2">تسجيل الدخول</Link>
            </p>
          </div>

          <div className="w-full flex items-center text-center my-10 text-slate-200 text-[10px] font-black before:content-[''] before:flex-1 before:border-b before:border-slate-50 before:ml-4 after:content-[''] after:flex-1 after:border-b after:border-slate-50 after:mr-4 uppercase  ">
            أو
          </div>

          <button 
            onClick={handleGoogleSignUp}
            className="w-full py-5 bg-white border-2 border-slate-100 rounded-3xl text-slate-700 font-black flex items-center justify-center gap-4 hover:bg-slate-50 hover:border-red-100 hover:text-red-600 transition-all active:scale-[0.98] shadow-[0_10px_20px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_20px_40px_-15px_rgba(227,30,36,0.1)] text-sm group relative overflow-hidden"
            type="button"
            disabled={loading}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-50/0 via-red-50/30 to-red-50/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 group-hover:scale-110 transition-transform" alt="Google" />
            <span className="relative z-10">المتابعة باستخدام Google</span>
          </button>
        </div>
      </main>
    </div>
  );
}
