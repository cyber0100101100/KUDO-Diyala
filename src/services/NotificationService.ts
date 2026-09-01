import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, isFirestoreQuotaExhausted, setFirestoreQuotaExhausted } from '../lib/firebase';
import { Schedule, User } from '../types';
import { formatTime12h, getTodayBaghdadStr } from '../lib/timeUtils';

export class NotificationService {
  static async processScheduledNotifications(userId?: string) {
    if (isFirestoreQuotaExhausted()) return;

    // Cross-tab throttling: only run every 4 minutes (even if interval is 5)
    const lastRunKey = `last_notif_run_${userId || 'all'}`;
    const lastRun = localStorage.getItem(lastRunKey);
    if (lastRun && Date.now() - parseInt(lastRun, 10) < 240000) return;
    localStorage.setItem(lastRunKey, Date.now().toString());

    const todayStr = getTodayBaghdadStr();
    const now = new Date();
    
    try {
      let q = query(
        collection(db, 'schedules'),
        where('date', '==', todayStr),
        where('status', '==', 'scheduled')
      );

      if (userId) {
        q = query(q, where('userId', '==', userId));
      }
      
      const snap = await getDocs(q);
      for (const scheduleDoc of snap.docs) {
        const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() } as Schedule;
        await this.checkAndSend(schedule, now);
      }
    } catch (err: any) {
      if (err?.code === 'resource-exhausted') {
        setFirestoreQuotaExhausted();
      }
      console.error('Notification Service Error:', err);
    }
  }

  private static async checkAndSend(schedule: Schedule, now: Date) {
    if (isFirestoreQuotaExhausted()) return;

    const [startH, startM] = schedule.startTime.split(':').map(Number);
    const schedStart = new Date(now);
    schedStart.setHours(startH, startM, 0, 0);

    const diffMs = schedStart.getTime() - now.getTime();
    const diffMins = diffMs / (1000 * 60);

    const sent = schedule.notificationsSent || {};
    const updates: any = {};

    // 1. Half hour before (25-35 mins)
    if (diffMins <= 30 && diffMins > 10 && !sent.halfHour) {
      await this.send(schedule.userId, 'تذكير: موعد عملك يقترب', `بقي 30 دقيقة على بداية دوانك اليوم (${formatTime12h(schedule.startTime)})`);
      updates['notificationsSent.halfHour'] = true;
    }

    // 2. 10 minutes before
    if (diffMins <= 10 && diffMins > 5 && !sent.tenMin) {
      await this.send(schedule.userId, 'تنبيه: 10 دقائق للبدء', 'يرجى التوجه إلى موقع العمل، موعد بدأ دوانك خلال 10 دقائق.');
      updates['notificationsSent.tenMin'] = true;
    }

    // 3. 5 minutes before
    if (diffMins <= 5 && diffMins > 0 && !sent.fiveMin) {
      await this.send(schedule.userId, 'استعداد: 5 دقائق للبدء', 'استعد لتسجيل الحضور، بقي 5 دقائق فقط.');
      updates['notificationsSent.fiveMin'] = true;
    }

    // 4. At start time
    if (diffMins <= 0 && diffMins > -10 && !sent.start) {
      await this.send(schedule.userId, 'بدء العمل الآن', 'تسجيل الحضور متاح الآن. يرجى تسجيل حضورك فور وصولك لموقع العمل.');
      updates['notificationsSent.start'] = true;
    }

    // 5. 10 minutes late
    if (diffMins <= -10 && diffMins > -20 && !sent.tenMinLate) {
      await this.send(schedule.userId, 'تنبيه تأخير', 'لقد مضى 10 دقائق على موعد بدأ عملك ولم تسجل حضورك بعد.');
      updates['notificationsSent.tenMinLate'] = true;
    }

    // 6. 20 minutes late
    if (diffMins <= -20 && !sent.twentyMinLate) {
      await this.send(schedule.userId, 'تنبيه: أنت متأخر رسمياً', 'لقد تجاوزت مهلة الـ 20 دقيقة. سيتم تسجيل حالتك كمتأخر في التقرير اليومي.');
      updates['notificationsSent.twentyMinLate'] = true;
    }

    if (Object.keys(updates).length > 0) {
      try {
        await updateDoc(doc(db, 'schedules', schedule.id!), updates);
      } catch (err: any) {
        if (err?.code === 'resource-exhausted') {
          setFirestoreQuotaExhausted();
        }
        throw err;
      }
    }
  }

  static async processEndOfDay() {
    if (isFirestoreQuotaExhausted()) return;

    // Cross-tab throttling: only run every 12 hours (it only needs to run once a day)
    const lastRunKey = 'last_eod_run';
    const lastRun = localStorage.getItem(lastRunKey);
    if (lastRun && Date.now() - parseInt(lastRun, 10) < 12 * 60 * 60 * 1000) return;
    localStorage.setItem(lastRunKey, Date.now().toString());

    const now = new Date();
    const yesterday = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' }));
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');

    try {
      // Find all scheduled entries for yesterday that aren't completed
      const q = query(
        collection(db, 'schedules'),
        where('date', '==', dateStr),
        where('status', '==', 'scheduled')
      );

      const snap = await getDocs(q);
      for (const scheduleDoc of snap.docs) {
        const schedule = { id: scheduleDoc.id, ...scheduleDoc.data() } as Schedule;
        
        // 1. Check if user already has attendance for this day
        const attendQ = query(
          collection(db, 'attendance'),
          where('userId', '==', schedule.userId),
          where('date', '==', dateStr)
        );
        const attendSnap = await getDocs(attendQ);
        
        if (attendSnap.empty) {
          // No attendance found. Now check for approved leave
          const leaveQ = query(
            collection(db, 'requests'),
            where('userId', '==', schedule.userId),
            where('status', '==', 'approved'),
            where('type', '==', 'leave')
          );
          
          const leaveSnap = await getDocs(leaveQ);
          let isOnLeave = false;
          
          for (const lDoc of leaveSnap.docs) {
            const l = lDoc.data();
            if (dateStr >= l.startDate && dateStr <= l.endDate) {
              isOnLeave = true;
              break;
            }
          }

          if (isOnLeave) {
            // Auto-mark as present because of approved leave
            const leaveCheckInTime = new Date(yesterday);
            leaveCheckInTime.setHours(9, 0, 0, 0);

            await addDoc(collection(db, 'attendance'), {
              userId: schedule.userId,
              date: dateStr,
              checkInTime: leaveCheckInTime.toISOString(),
              status: 'present',
              locationVerified: true,
              reason: 'إجازة معتمدة'
            });
          } else {
            // Mark as absent
            await addDoc(collection(db, 'attendance'), {
              userId: schedule.userId,
              date: dateStr,
              checkInTime: '',
              status: 'absent',
              locationVerified: false
            });

            // Auto-record deduction for absence: Basic Salary / 30
            const userRef = doc(db, 'users', schedule.userId);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const u = userSnap.data() as User;
              const dailyRate = (u.baseSalary || 0) / 30;
              const period = dateStr.slice(0, 7); // YYYY-MM
              
              await addDoc(collection(db, 'financial_records'), {
                userId: schedule.userId,
                userName: schedule.userName,
                bonus: 0,
                advance: 0,
                deduction: dailyRate,
                overtime: 0,
                period,
                reason: `غياب بدون عذر يوم ${dateStr}`,
                createdAt: serverTimestamp(),
                createdBy: 'system'
              });
            }
          }
          
          // CRITICAL CHANGE: Always increment cycle count even if absent
          await this.incrementWorkCycle(schedule.userId, dateStr);
        }

        // Mark schedule as processed (completed or missed)
        await updateDoc(doc(db, 'schedules', schedule.id!), {
          status: attendSnap.empty ? 'missed' : 'completed'
        });
      }
    } catch (err) {
      console.error('End of Day Service Error:', err);
    }
  }

  private static async incrementWorkCycle(userId: string, date: string) {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const u = userSnap.data() as User;
      const newCount = (u.workDaysCount || 0) + 1;
      
      const updates: any = {
        workDaysCount: newCount > 30 ? 1 : newCount,
        cycleStartDate: newCount > 30 ? date : (u.cycleStartDate || date)
      };

      // Reset late count every 30 days
      if (newCount > 30) {
        updates.lateCount = 0;
      }

      await updateDoc(userRef, updates);
    }
  }

  public static async send(userId: string | null, title: string, message: string) {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message,
      type: 'attendance',
      createdAt: serverTimestamp(),
      isRead: false
    });

    // Show local notification if permission is granted and app is visible/backgrounded
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/icon.png'
      });
    }
  }

  static async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('هذا المتصفح لا يدعم التنبيهات.');
      return false;
    }

    try {
      if (Notification.permission === 'granted') {
        return true;
      }

      if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
    } catch (err) {
      console.error('Error requesting notification permission:', err);
    }

    return false;
  }
}
