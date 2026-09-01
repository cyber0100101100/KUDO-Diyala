import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { isFirestoreQuotaExhausted } from '../lib/firebase';

export default function QuotaBanner() {
  const [isExhausted, setIsExhausted] = useState(isFirestoreQuotaExhausted());

  useEffect(() => {
    const handleExhausted = () => setIsExhausted(true);
    window.addEventListener('firestore-quota-exhausted', handleExhausted);
    
    // Periodically check if quota has reset (e.g. after an hour)
    const interval = setInterval(() => {
      setIsExhausted(isFirestoreQuotaExhausted());
    }, 60000);

    return () => {
      window.removeEventListener('firestore-quota-exhausted', handleExhausted);
      clearInterval(interval);
    };
  }, []);

  return (
    <AnimatePresence>
      {isExhausted && (
        <motion.div
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          exit={{ y: -100 }}
          className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white px-4 py-3 shadow-lg flex items-center justify-center gap-3 text-center"
        >
          <span className="material-symbols-outlined text-xl">warning</span>
          <p className="text-xs font-black uppercase tracking-wider">
            عذراً، تم تجاوز حد العمليات اليومي المسموح به. قد لا تعمل بعض الميزات بشكل صحيح حتى يتم تصفير العداد.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
