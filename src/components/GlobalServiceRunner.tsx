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

    // Run notification processor every 5 minutes (increased from 2)
    const interval = setInterval(() => {
      NotificationService.processScheduledNotifications(user.uid);
    }, 300000);
    
    // Initial run with delay
    const timeout = setTimeout(() => {
      NotificationService.processScheduledNotifications(user.uid);
    }, 10000);
    
    // Only management runs End of Day processor
    if (isManagement) {
      NotificationService.processEndOfDay();
    }
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [user]);

  return null; // This component doesn't render anything
}
