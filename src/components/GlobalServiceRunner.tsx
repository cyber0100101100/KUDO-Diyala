import { useEffect } from 'react';
import { NotificationService } from '../services/NotificationService';
import { useAuthContext } from '../context/AuthContext';
import { requestNotificationPermission } from '../lib/firebase';

export default function GlobalServiceRunner() {
  const { user } = useAuthContext();

  useEffect(() => {
    if (!user) return;

    // Request notification permissions and save token
    requestNotificationPermission(user.uid);

    const isManagement = user.role === 'admin' || user.role === 'manager' || user.role === 'supervisor' || user.email === 'antrippy1@gmail.com' || user.email === 'ath222139@gmail.com';

    // Run notification processor every minute
    const interval = setInterval(() => {
      // Employees only process their own notifications
      // Management processes all
      NotificationService.processScheduledNotifications(isManagement ? undefined : user.uid);
    }, 60000);
    
    // Initial run
    NotificationService.processScheduledNotifications(isManagement ? undefined : user.uid);
    
    // Only management runs End of Day processor
    if (isManagement) {
      NotificationService.processEndOfDay();
    }
    
    return () => clearInterval(interval);
  }, [user]);

  return null; // This component doesn't render anything
}
