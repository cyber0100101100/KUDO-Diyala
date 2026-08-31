import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer, 
  collection, 
  addDoc, 
  updateDoc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  Timestamp, 
  increment,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';
import { User, Attendance, LeaveRequest, Notification as AppNotification, ChatMessage } from '../types';
import { getTodayBaghdadStr } from './timeUtils';

// Initialize Firebase
if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error('Firebase configuration is missing or incomplete. Check firebase-applet-config.json.');
}
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const databaseId = (firebaseConfig as any).firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

// Test connection on boot gracefully
async function testConnection() {
  try {
    const { getDoc, doc } = await import('firebase/firestore');
    await getDoc(doc(db, '_connection_test_', 'check'));
    console.log('Firestore connection verified.');
  } catch (error: any) {
    if (error?.code === 'unavailable' || error?.message?.includes('the client is offline') || error?.message?.includes('offline')) {
      console.info('Firestore initialized (offline persistence active).');
    } else {
      console.warn('Firestore connection check:', error?.message || error);
    }
  }
}
testConnection();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

// Initialize Messaging
let messaging: any = null;
try {
  // Only initialize messaging if supported (fails in some iframe/incognito contexts)
  messaging = getMessaging(app);
} catch (err) {
  console.warn('FCM not supported in this browser context:', err);
}

export async function requestNotificationPermission(userId: string) {
  if (!messaging) {
    console.warn('Messaging not supported or initialized');
    if ('Notification' in window) await window.Notification.requestPermission();
    return false;
  }
  
  try {
    const permission = await window.Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, {
        vapidKey: (firebaseConfig as any).fcmVapidKey || 'BD8k1-M1c6Y8Jk5V_v7zU9_vE8zY_zY_vE8zY_zY_vE8zY_zY_vE8zY_zY' 
      }).catch(err => {
        console.warn('Could not get FCM token:', err);
        return null;
      });
      
      const updates: any = { notificationsEnabled: true };
      if (token) {
        updates.fcmToken = token;
        console.log('FCM Token obtained');
      }
      
      await updateDoc(doc(db, 'users', userId), updates);
      return true;
    } else {
      console.warn('Notification permission denied');
      await updateDoc(doc(db, 'users', userId), { notificationsEnabled: false });
      return false;
    }
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return false;
  }
}

export function onMessageListener() {
  if (!messaging) return null;
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
  });
}

// Error handler based on skill
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  const isUnavailable = error?.code === 'unavailable' || error?.message?.includes('the client is offline');
  
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };

  if (isUnavailable) {
    console.warn('Firestore connection unavailable (offline mode). Operation will be retried automatically when online.', errInfo);
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  // Optionally notify the user or UI via a global state/event if needed
}

// User helpers
export async function getCurrentUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
  if (userDoc.exists()) {
    return userDoc.data() as User;
  }
  return null;
}

export async function saveAttendance(attendance: Attendance) {
  try {
    const colRef = collection(db, 'attendance');
    await addDoc(colRef, attendance);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'attendance');
  }
}

export async function getTodaysAttendance(userId: string): Promise<Attendance | null> {
  const today = getTodayBaghdadStr();
  const q = query(
    collection(db, 'attendance'),
    where('userId', '==', userId),
    where('date', '==', today),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Attendance;
  }
  return null;
}
