import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc,
  Timestamp,
  initializeFirestore,
  addDoc,
  limit
} from 'firebase/firestore';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Web SDK for Server
const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);

// Critical for sandboxed environments like AI Studio
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

console.log(`Firebase Web SDK initialized for server-side tasks`);

// Test connection
async function testConnection() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('__dummy__', '==', 'check'), limit(1)));
    console.log('Server Firestore connection verified via Web SDK.');
  } catch (error: any) {
    console.warn('Server Firestore connection test warning (expected if rules are restricted):', error.message);
  }
}
testConnection();

// Mock push notification (since Web SDK cannot send FCM directly from server easily)
// We will instead write to the 'notifications' collection which the client listens to
async function sendSystemNotification(userId: string, title: string, body: string, type = 'system') {
  try {
    await addDoc(collection(db, 'notifications'), {
      userId,
      title,
      message: body,
      type,
      read: false,
      createdAt: Timestamp.now()
    });
    console.log(`System notification queued for ${userId}: ${title}`);
  } catch (error) {
    console.error(`Error queuing notification for ${userId}:`, error);
  }
}

// 1. Every Minute: Attendance & Departure Reminders
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const q = query(
      collection(db, 'schedules'),
      where('date', '==', todayStr),
      where('status', '==', 'scheduled')
    );
    const snapshot = await getDocs(q);

    for (const scheduleDoc of snapshot.docs) {
      const schedule = scheduleDoc.data();
      const sent = schedule.notificationsSent || {};
      const updates: any = {};

      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const schedStart = new Date(now);
      schedStart.setHours(startH, startM, 0, 0);
      const diffMins = (schedStart.getTime() - now.getTime()) / (1000 * 60);

      if (diffMins <= 10.5 && diffMins > 9.5 && !sent.tenMin) {
        await sendSystemNotification(schedule.userId, 'تنبيه: 10 دقائق للبدء', 'يرجى التوجه إلى موقع العمل، موعد بدأ دوانك خلال 10 دقائق.');
        updates['notificationsSent.tenMin'] = true;
      }
      if (diffMins <= 5.5 && diffMins > 4.5 && !sent.fiveMin) {
        await sendSystemNotification(schedule.userId, 'استعداد: 5 دقائق للبدء', 'استعد لتسجيل الحضور، بقي 5 دقائق فقط.');
        updates['notificationsSent.fiveMin'] = true;
      }
      if (diffMins <= 0.5 && diffMins > -0.5 && !sent.start) {
        await sendSystemNotification(schedule.userId, 'بدء العمل الآن', 'تسجيل الحضور متاح الآن. يرجى تسجيل حضورك فور وصولك.');
        updates['notificationsSent.start'] = true;
      }
      if (diffMins <= -9.5 && diffMins > -10.5 && !sent.tenMinLate) {
        await sendSystemNotification(schedule.userId, 'تنبيه تأخير', 'لقد مضى 10 دقائق على موعد بدأ عملك ولم تسجل حضورك بعد.');
        updates['notificationsSent.tenMinLate'] = true;
      }

      const [endH, endM] = schedule.endTime.split(':').map(Number);
      const schedEnd = new Date(now);
      schedEnd.setHours(endH, endM, 0, 0);
      const diffEndMins = (schedEnd.getTime() - now.getTime()) / (1000 * 60);

      if (diffEndMins <= 10.5 && diffEndMins > 9.5 && !sent.endTenMin) {
        await sendSystemNotification(schedule.userId, 'تنبيه انصراف', 'بقي 10 دقائق على نهاية موعد دوانك.');
        updates['notificationsSent.endTenMin'] = true;
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'schedules', scheduleDoc.id), updates);
      }
    }
  } catch (err) {
    console.error('Error in attendance cron:', err);
  }
});

// 2. Financial & Social Polling
let lastPollTime = Timestamp.now();
cron.schedule('*/5 * * * *', async () => {
  try {
    const currentPollTime = Timestamp.now();
    
    // Financials
    const finQ = query(
      collection(db, 'financial_records'),
      where('createdAt', '>', lastPollTime)
    );
    const finSnap = await getDocs(finQ);
    for (const recordDoc of finSnap.docs) {
      const data = recordDoc.data();
      let body = '';
      if (data.bonus > 0) body = `تم إضافة مكافأة بقيمة ${data.bonus} إلى حسابك.`;
      if (data.deduction > 0) body = `تم تسجيل خصم بقيمة ${data.deduction} من حسابك.`;
      if (body) await sendSystemNotification(data.userId, 'تحديث مالي', body);
    }

    lastPollTime = currentPollTime;
  } catch (err) {
    console.error('Error in polling cron:', err);
  }
});

async function startServer() {
  const app = express();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(3000, "0.0.0.0", () => console.log('Server running on port 3000 (Web SDK Mode)'));
}
startServer();
