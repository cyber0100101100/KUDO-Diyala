import { useEffect } from 'react';
import { NotificationService } from '../services/NotificationService';
import { useAuthContext } from '../context/AuthContext';
import { requestNotificationPermission } from '../lib/firebase';
import { getTodayBaghdadStr } from '../lib/timeUtils';

export default function GlobalServiceRunner() {
  const { user } = useAuthContext();

  useEffect(() => {
    if (!user) return;

    // Request notification permissions and save token
    requestNotificationPermission(user.uid);

    const isManagement = user.role === 'admin' || user.role === 'manager' || user.role === 'supervisor' || user.email === 'antrippy1@gmail.com' || user.email === 'ath222139@gmail.com';

    // Run notification processor every 2 minutes
    const interval = setInterval(() => {
      // Employees only process their own notifications
      // Management processes all
      NotificationService.processScheduledNotifications(isManagement ? undefined : user.uid);
    }, 120000);
    
    // Initial run with delay to avoid slamming Firestore on mount
    const timeout = setTimeout(() => {
      NotificationService.processScheduledNotifications(isManagement ? undefined : user.uid);
    }, 5000);
    
    // Only management runs End of Day processor
    if (isManagement) {
      const lastRun = localStorage.getItem('last_eod_run');
      const todayStr = getTodayBaghdadStr();
      if (lastRun !== todayStr) {
        NotificationService.processEndOfDay().then(() => {
          localStorage.setItem('last_eod_run', todayStr);
        });
      }
    }
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [user]);

  return null; // This component doesn't render anything
}
