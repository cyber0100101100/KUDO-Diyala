import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(() => {
      if (user) {
        if (user.role === 'manager' || user.role === 'admin') {
          navigate('/admin/home');
        } else {
          navigate('/employee/home');
        }
      } else {
        navigate('/selection');
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate, user, loading]);

  return (
    <div className="bg-[#ec0b01] h-screen w-full flex flex-col justify-between items-center overflow-hidden font-sans select-none relative">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.1 }}
          transition={{ duration: 2 }}
          className="absolute -top-[10%] -right-[10%] w-[50%] h-[50%] bg-white rounded-full blur-[100px]"
        />
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.05 }}
          transition={{ duration: 2, delay: 0.5 }}
          className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-white rounded-full blur-[80px]"
        />
      </div>

      <div className="flex-1"></div>

      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md mx-auto px-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
              duration: 1.2,
              ease: [0.16, 1, 0.3, 1]
            }}
            className="w-full max-w-[280px] md:max-w-[340px] aspect-[2/1] flex items-center justify-center mb-10 bg-white/10 rounded-[32px] p-6 backdrop-blur-md border border-white/20 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)]"
          >
            <img 
              alt="Kudo Kudo Logo" 
              className="object-contain w-full h-full" 
              src="/icon.png" 
            />
          </motion.div>

        <div className="text-center space-y-4">
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-[32px] md:text-[40px] leading-none font-black text-white  "
          >
            Smart Attendance
          </motion.h1>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ duration: 1, delay: 1.2 }}
            className="h-px w-12 bg-white mx-auto"
          />

          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="text-[18px] md:text-[22px] leading-relaxed text-white font-medium  "
          >
            إدارة فريقك بكل احترافية
          </motion.p>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end w-full pb-20 relative z-10">
        <div className="w-full max-w-[140px] mx-auto h-[3px] bg-white/10 rounded-full overflow-hidden">
          <motion.div 
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              ease: "easeInOut",
              repeatDelay: 0.2
            }}
            className="h-full w-2/3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"
          />
        </div>
      </div>
    </div>
  );
}
