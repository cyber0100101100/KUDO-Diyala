import { useEffect, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';

export function useLocationTracking(user: User | null) {
  const MIN_LOG_INTERVAL = 1000 * 60 * 15; // Log every 15 minutes to save battery/database

  useEffect(() => {
    if (!user || (user.role !== 'employee' && user.role !== 'admin')) return;

    const lastRunKey = `last_loc_log_${user.uid}`;
    
    let watchId: number;

    const startTracking = () => {
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            const now = Date.now();
            const lastRun = localStorage.getItem(lastRunKey);
            const lastTime = lastRun ? parseInt(lastRun, 10) : 0;
            
            // Safety check: Global quota
            const { isFirestoreQuotaExhausted, setFirestoreQuotaExhausted } = await import('../lib/firebase');
            if (isFirestoreQuotaExhausted()) return;

            // Log if it's the first time or if 15 minutes have passed
            if (now - lastTime >= MIN_LOG_INTERVAL) {
              try {
                await addDoc(collection(db, 'activity_logs'), {
                  userId: user.uid,
                  type: 'location_update',
                  latitude,
                  longitude,
                  timestamp: serverTimestamp(),
                });
                localStorage.setItem(lastRunKey, now.toString());
                console.log('Location logged:', latitude, longitude);
              } catch (error: any) {
                if (error?.code === 'resource-exhausted' || error?.message?.includes('Quota exceeded')) {
                  setFirestoreQuotaExhausted();
                }
                console.error('Error logging location:', error);
              }
            }
          },
          (error) => {
            if (error.code === 1) {
              // User denied Geolocation - log once as info and don't spam errors
              console.info('Geolocation access denied by user for background tracking.');
            } else {
              console.error('Geolocation tracking error:', error.code, error.message);
            }
          },
          {
            enableHighAccuracy: false, // Use cellular/WiFi for background tracking to save battery and reduce timeouts
            maximumAge: 60000,
            timeout: 30000,
          }
        );
      }
    };

    startTracking();

    return () => {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [user]);
}
