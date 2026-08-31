import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, collection, addDoc, query, where, getDocs, limit, serverTimestamp, getDoc } from 'firebase/firestore';
import { Attendance, Schedule } from '../types';
import { formatTime12h, formatLiveClock, getTodayBaghdadStr } from '../lib/timeUtils';
import { DEFAULT_WORK_LOCATION, calculateDistance } from '../lib/locationUtils';
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export default function AttendanceScreen() {
  const { user, loading: authLoading, today: globalToday } = useAuthContext();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setVideoStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<'checking' | 'inside' | 'outside' | 'denied'>('checking');
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [workLocation, setWorkLocation] = useState(DEFAULT_WORK_LOCATION);
  const [isStabilizing, setIsStabilizing] = useState(true);
  const [todaySchedule, setTodaySchedule] = useState<Schedule | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const processingRef = useRef(false);
  const stabilizationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadModels();
    
    if (!authLoading && user && !user.enrollmentComplete) {
      navigate('/employee/enrollment');
    }

    return () => {
      if (stabilizationTimerRef.current) {
        clearTimeout(stabilizationTimerRef.current);
      }
    };
  }, [user, navigate, authLoading]);

  useEffect(() => {
    if (authLoading || !user || !auth.currentUser) return;

    let watchId: number;

    const startLocationTracking = async () => {
      // First fetch current work location from DB
      let targetLat = DEFAULT_WORK_LOCATION.lat;
      let targetLng = DEFAULT_WORK_LOCATION.lng;
      let targetRadius = DEFAULT_WORK_LOCATION.radius;

      try {
        const docRef = doc(db, 'settings', 'workplace');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          targetLat = data.lat;
          targetLng = data.lng;
          targetRadius = data.radius;
          setWorkLocation({ lat: targetLat, lng: targetLng, radius: targetRadius });
        }
      } catch (err) {
        console.error('Error fetching work location:', err);
      }
      
      if (!navigator.geolocation) {
        setError('المتصفح لا يدعم تحديد الموقع');
        setLocationStatus('denied');
        setIsStabilizing(false);
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const dist = calculateDistance(
            latitude,
            longitude,
            targetLat,
            targetLng
          );
          
          setCurrentCoords({ lat: latitude, lng: longitude });
          setDistance(dist);
          
          if (dist <= targetRadius) {
            // If inside, cancel any "outside" stabilization timer and set status immediately
            if (stabilizationTimerRef.current) {
              clearTimeout(stabilizationTimerRef.current);
              stabilizationTimerRef.current = null;
            }
            setLocationStatus('inside');
            setError(null);
            setIsStabilizing(false);
            // Auto start camera when inside
            if (!stream) startCamera();
          } else {
            // If outside, only set to 'outside' if we weren't already outside and no timer is running
            if (locationStatus !== 'outside' && !stabilizationTimerRef.current) {
              // Wait 5 seconds before confirming the user is outside
              stabilizationTimerRef.current = setTimeout(() => {
                setLocationStatus('outside');
                setError(`أنت خارج نطاق العمل بمسافة ${Math.round(dist)} متر تقريباً`);
                setIsStabilizing(false);
                stabilizationTimerRef.current = null;
              }, 5000);
            } else if (locationStatus === 'outside') {
              // Update distance error message if already confirmed outside
              setError(`أنت خارج نطاق العمل بمسافة ${Math.round(dist)} متر تقريباً`);
            }
          }
        },
        (error) => {
          if (error.code === 1) {
            // User denied Geolocation
            console.info('Geolocation access denied in AttendanceScreen');
          } else {
            console.error('Geolocation error in AttendanceScreen:', error.code, error.message);
          }
          setIsStabilizing(false);
          if (error.code === 1) {
            setLocationStatus('denied');
            setError('يرجى السماح بالوصول إلى الموقع الجغرافي لتسجيل الحضور (GPS مطلوب)');
          } else if (error.code === 3) {
            // On timeout, don't necessarily set to denied, let it keep trying
            setError('انتهت مهلة تحديد الموقع. يرجى التأكد من قوة إشارة الـ GPS والمحاولة مرة أخرى.');
          } else {
            setLocationStatus('denied');
            setError('تعذر تحديد موقعك الحالي. تأكد من تفعيل الـ GPS وصلاحيات الموقع.');
          }
        },
        { 
          enableHighAccuracy: true, 
          timeout: 20000, 
          maximumAge: 10000 
        }
      );
    };

    const checkTodaySchedule = async () => {
      if (!user) return;
      const today = getTodayBaghdadStr();
      const q = query(
        collection(db, 'schedules'),
        where('userId', '==', user.uid),
        where('date', '==', today),
        limit(1)
      );
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          setTodaySchedule({ id: snap.docs[0].id, ...snap.docs[0].data() } as Schedule);
        }
      } catch (err) {
        console.error('Error fetching schedule:', err);
      }
    };

    const checkTodayAttendance = async () => {
      if (!user) return;
      const today = getTodayBaghdadStr();
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user.uid),
        where('date', '==', today),
        limit(1)
      );
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          setAttendance({ id: snap.docs[0].id, ...snap.docs[0].data() } as Attendance);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'attendance');
      }
    };

    startLocationTracking();
    checkTodaySchedule();
    checkTodayAttendance();

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [user, navigate, stream, globalToday]);

  // Auto verification loop
  useEffect(() => {
    let intervalId: any;

    const runAutoVerify = async () => {
      if (!modelsLoaded || !stream || verifying || processingRef.current || locationStatus !== 'inside' || (attendance && attendance.checkOutTime)) return;
      
      try {
        processingRef.current = true;
        const detection = await faceapi
          .detectSingleFace(videoRef.current!)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          const isCorrectPose = validatePose(detection.landmarks);
          if (isCorrectPose) {
            // Compare with stored embedding
            if (user?.faceEmbedding) {
              const storedEmbedding = new Float32Array(user.faceEmbedding);
              const dist = faceapi.euclideanDistance(storedEmbedding, detection.descriptor);
              
              if (dist <= 0.5) {
                // Success! Auto trigger attendance
                await handleAttendanceInternal();
              }
            }
          }
        }
      } catch (err) {
        console.error('Auto verify error:', err);
      } finally {
        processingRef.current = false;
      }
    };

    if (modelsLoaded && stream && locationStatus === 'inside') {
      intervalId = setInterval(runAutoVerify, 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [modelsLoaded, stream, verifying, locationStatus, attendance, user]);

  const loadModels = async () => {
    try {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      setModelsLoaded(true);
    } catch (err) {
      console.error('Error loading face models:', err);
      setError('خطأ في تحميل محرك التعرف على الوجه.');
    }
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(console.error);
      };
    }
  }, [stream]);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        } 
      });
      setVideoStream(s);
    } catch (err) {
      setError('لا يمكن الوصول إلى الكاميرا. يرجى السماح بالوصول.');
    }
  };

  const validatePose = (landmarks: faceapi.FaceLandmarks68) => {
    const nose = landmarks.getNose()[6]; // Tip
    const jaw = landmarks.getJawOutline();
    const jawLeft = jaw[0];
    const jawRight = jaw[16];
    const noseBridge = landmarks.getNose()[0];
    const chin = jaw[8];

    const jawWidth = jawRight.x - jawLeft.x;
    const nosePos = (nose.x - jawLeft.x) / jawWidth;

    const faceHeight = chin.y - noseBridge.y;
    const noseVerticalPos = (nose.y - noseBridge.y) / faceHeight;

    // Attendance always requires front face
    return nosePos > 0.4 && nosePos < 0.6 && noseVerticalPos > 0.35 && noseVerticalPos < 0.6;
  };

  const handleAttendance = () => handleAttendanceInternal();

  // Check if check-in is allowed
  const canCheckIn = () => {
    if (!todaySchedule || attendance || locationStatus !== 'inside') return false;
    
    const [startH, startM] = todaySchedule.startTime.split(':').map(Number);
    const [endH, endM] = todaySchedule.endTime.split(':').map(Number);
    
    const startTime = new Date();
    startTime.setHours(startH, startM, 0, 0);
    
    const endTime = new Date();
    endTime.setHours(endH, endM, 0, 0);
    
    // Allow check-in from start time until end time
    return currentTime >= startTime && currentTime < endTime;
  };

  // Check if check-out is allowed
  const canCheckOut = () => {
    if (!attendance || attendance.checkOutTime || locationStatus !== 'inside' || !todaySchedule) return false;
    
    const [endH, endM] = todaySchedule.endTime.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(endH, endM, 0, 0);
    
    // Only allow check-out after the end time specified by manager
    return currentTime >= endTime;
  };

  const handleAttendanceInternal = async () => {
    if (locationStatus !== 'inside') {
      setError('يجب أن تكون داخل نطاق المطعم لتسجيل الحضور');
      return;
    }

    if (!stream) {
      await startCamera();
      return;
    }

    if (!modelsLoaded) {
      setError('جاري تحميل محرك التحقق... يرجى الانتظار');
      return;
    }

    // New validation: Must have a schedule
    if (!todaySchedule) {
      setError('لا يوجد جدول عمل محدد لك اليوم. يرجى التواصل مع المدير.');
      return;
    }

    // New validation: Time windows
    if (!attendance && !canCheckIn()) {
      setError('لا يمكنك تسجيل الحضور قبل أو بعد وقت الدوام المحدد في الجدول.');
      return;
    }

    if (attendance && !attendance.checkOutTime && !canCheckOut()) {
      setError('لا يمكنك تسجيل الانصراف قبل موعد نهاية الدوام المحدد من قبل المدير.');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      // 3. Proceed with Attendance record
      const today = new Date();
      const dateStr = getTodayBaghdadStr();
      
      if (!attendance) {
        // Check-in
        const checkInDate = new Date();
        const [startHour, startMinute] = todaySchedule.startTime.split(':').map(Number);
        const schedStart = new Date(checkInDate);
        schedStart.setHours(startHour, startMinute, 0, 0);

        const diffMs = checkInDate.getTime() - schedStart.getTime();
        const lateMinutes = Math.floor(diffMs / (1000 * 60));
        
        // Mark as late if more than 20 minutes past scheduled start
        const status = lateMinutes >= 20 ? 'late' : 'present';

        const newAttendance: Attendance = {
          userId: user!.uid,
          date: dateStr,
          checkInTime: checkInDate.toISOString(),
          status: status,
          locationVerified: true,
          scheduleId: todaySchedule.id,
          checkInLocation: { lat: currentCoords?.lat || 0, lng: currentCoords?.lng || 0 }
        };
        const docRef = await addDoc(collection(db, 'attendance'), newAttendance);
        setAttendance({ id: docRef.id, ...newAttendance });

        // Update User 30-day work cycle and Status
        const userRef = doc(db, 'users', user!.uid);
        const newWorkDaysCount = (user!.workDaysCount || 0) + 1;
        const cycleStartDate = user!.cycleStartDate || dateStr;

        const newLateCount = status === 'late' ? (user!.lateCount || 0) + 1 : (user!.lateCount || 0);
        
        // If it's the 4th lateness (or multiple of 4), record a financial deduction
        if (status === 'late' && newLateCount % 4 === 0) {
          const dailyRate = (user!.baseSalary || 0) / 30;
          await addDoc(collection(db, 'financial_records'), {
            userId: user!.uid,
            userName: user!.displayName,
            bonus: 0,
            advance: 0,
            deduction: dailyRate,
            overtime: 0,
            period: dateStr.slice(0, 7),
            reason: `خصم 4 تأخيرات (التأخير رقم ${newLateCount})`,
            createdAt: serverTimestamp(),
            createdBy: 'system'
          });
        }

        await updateDoc(userRef, { 
          status: status,
          lateMinutes: status === 'late' ? lateMinutes : (user!.lateMinutes || 0),
          lateCount: newLateCount,
          workDaysCount: newWorkDaysCount > 30 ? 1 : newWorkDaysCount,
          cycleStartDate: newWorkDaysCount > 30 ? dateStr : cycleStartDate
        });

        // Activity Log
        await addDoc(collection(db, 'activity_logs'), {
          userId: user!.uid,
          type: 'check_in',
          timestamp: serverTimestamp(),
          latitude: currentCoords?.lat || 0,
          longitude: currentCoords?.lng || 0,
          status
        });

        // Notification for admin
        await addDoc(collection(db, 'notifications'), {
          userId: null,
          title: status === 'late' ? 'تأخير موظف' : 'تسجيل حضور جديد',
          message: `قام الموظف ${user!.displayName} بتسجيل الحضور الآن (${status === 'late' ? 'متأخر' : 'في الموعد'}).`,
          type: 'attendance',
          isRead: false,
          createdAt: serverTimestamp()
        });
      } else if (!attendance.checkOutTime) {
        // Check-out
        await updateDoc(doc(db, 'attendance', attendance.id!), {
          checkOutTime: today.toISOString(),
          checkOutLocation: { lat: currentCoords?.lat || 0, lng: currentCoords?.lng || 0 }
        });
        setAttendance({ ...attendance, checkOutTime: today.toISOString() });

        // Activity Log
        await addDoc(collection(db, 'activity_logs'), {
          userId: user!.uid,
          type: 'check_out',
          timestamp: serverTimestamp(),
          latitude: currentCoords?.lat || 0,
          longitude: currentCoords?.lng || 0
        });

        // Notification for admin
        await addDoc(collection(db, 'notifications'), {
          userId: null,
          title: 'تسجيل انصراف جديد',
          message: `قام الموظف ${user!.displayName} بتسجيل الانصراف الآن.`,
          type: 'attendance',
          isRead: false,
          createdAt: serverTimestamp()
        });
      }
      
      setVerifying(false);
      stopCamera();
    } catch (err) {
      console.error('Attendance error:', err);
      handleFirestoreError(err, OperationType.WRITE, 'attendance');
      setError('حدث خطأ أثناء معالجة البيانات');
      setVerifying(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stream]);

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col antialiased pt-16 md:pt-20">
      <div className="w-full bg-white min-h-screen relative flex flex-col">
        <header className="bg-white/90 backdrop-blur-xl px-4 py-3 md:px-6 md:py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 border-b border-slate-100/50 shadow-sm">
          <button onClick={() => navigate('/employee/home')} className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
            <span className="material-symbols-outlined text-lg md:text-xl">arrow_forward</span>
          </button>
          <h1 className="text-sm md:text-base font-black text-slate-900  ">تسجيل الحضور</h1>
          <div className="w-9"></div>
        </header>

        <main className="flex-grow flex flex-col p-6 pb-32 max-w-md mx-auto w-full">
      <div className="bg-white rounded-3xl md:rounded-[32px] p-5 md:p-6 border border-slate-50 shadow-sm flex flex-col items-center justify-center mb-8 md:mb-10 transition-all hover:shadow-md">
            <div className="flex items-center gap-3 mb-2 md:mb-3">
              <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${locationStatus === 'inside' ? 'bg-green-500 animate-pulse' : 'bg-red-500'} shadow-[0_0_10px_currentColor]`}></div>
              <span className={`text-[9px] md:text-[11px] font-black uppercase   ${locationStatus === 'inside' ? 'text-green-600' : 'text-red-600'}`}>
                {locationStatus === 'checking' ? 'جاري التحقق...' : locationStatus === 'inside' ? 'داخل نطاق العمل' : 'خارج نطاق العمل'}
              </span>
            </div>
            <p className="text-[9px] md:text-xs font-bold text-slate-400 opacity-60 uppercase  ">
              {distance !== null && locationStatus !== 'inside' ? `المسافة الحالية: ${Math.round(distance)} متر 📍` : 'الفرع الرئيسي - KUDO Restaurant 📍'}
            </p>
          </div>

          <div className="flex-grow flex flex-col items-center justify-center py-4">
            <div className="mb-6 flex flex-col items-center">
              <span className="text-[10px] font-black text-[#E31E24] uppercase tracking-widest mb-1">الوقت الحالي</span>
              <div className="text-4xl font-black text-slate-900 tracking-tighter tabular-nums">
                {formatLiveClock(currentTime)}
              </div>
            </div>
            
            <div className="relative w-72 h-72 mb-10 flex items-center justify-center">
              <div className={`absolute inset-0 rounded-[64px] border-[12px] border-slate-50 ${verifying ? 'animate-pulse' : ''}`}></div>
              <div className="relative w-full h-full rounded-[56px] bg-white shadow-2xl shadow-slate-200 flex items-center justify-center overflow-hidden border-4 border-white">
                {stream ? (
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-50">
                    <span className="material-symbols-outlined text-slate-200 text-8xl filled-icon">face</span>
                    {!modelsLoaded && <p className="absolute bottom-10 text-[9px] font-bold text-slate-400 uppercase   animate-pulse">جاري تحميل المحرك...</p>}
                  </div>
                )}
                {verifying && (
                  <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#E31E24] shadow-[0_0_20px_rgba(227,30,36,1)] animate-[scan_2.5s_ease-in-out_infinite_alternate] z-10"></div>
                )}
              </div>
              
              <div className="absolute -top-4 -right-4 w-16 h-16 border-t-4 border-r-4 border-[#E31E24] rounded-tr-[32px] opacity-20"></div>
              <div className="absolute -top-4 -left-4 w-16 h-16 border-t-4 border-l-4 border-[#E31E24] rounded-tl-[32px] opacity-20"></div>
              <div className="absolute -bottom-4 -right-4 w-16 h-16 border-b-4 border-r-4 border-[#E31E24] rounded-br-[32px] opacity-20"></div>
              <div className="absolute -bottom-4 -left-4 w-16 h-16 border-b-4 border-l-4 border-[#E31E24] rounded-bl-[32px] opacity-20"></div>
            </div>
            
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-slate-800  ">
                {verifying ? 'جاري التحقق...' : stream ? 'انظر إلى الكاميرا' : 'بصمة الوجه'}
              </h2>
              <p className="text-[11px] font-bold text-slate-400 uppercase   opacity-70">يرجى تثبيت الوجه داخل الإطار</p>
            </div>
          </div>

          <div className="mt-12 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-5 rounded-2xl text-center text-xs font-bold border border-red-100/50 relative overflow-hidden">
                {isStabilizing && locationStatus === 'checking' && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center gap-3">
                    <div className="w-3 h-3 border-2 border-[#E31E24] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] text-slate-500">جاري تثبيت الموقع...</span>
                  </div>
                )}
                {error}
              </div>
            )}
            
            {!attendance || !attendance.checkOutTime ? (
              <button 
                onClick={handleAttendance}
                disabled={verifying || locationStatus !== 'inside' || (!attendance && !canCheckIn()) || (attendance && !attendance.checkOutTime && !canCheckOut())}
                className="w-full py-5 bg-[#E31E24] text-white rounded-[28px] font-black text-lg shadow-xl shadow-red-100 hover:bg-red-700 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:shadow-none uppercase  "
              >
                <span className="material-symbols-outlined text-2xl filled-icon">
                  {attendance ? 'logout' : 'fingerprint'}
                </span>
                {attendance ? 'تسجيل الانصراف' : 'تسجيل الحضور'}
              </button>
            ) : (
              <div className="bg-green-50 text-green-600 p-6 rounded-[32px] text-center font-bold border border-green-100/50 flex items-center justify-center gap-3 shadow-sm">
                <span className="material-symbols-outlined filled-icon text-2xl">check_circle</span>
                تم إكمال الحضور لهذا اليوم
              </div>
            )}

            {/* Schedule Info */}
            {todaySchedule && (
              <div className={`rounded-[24px] p-4 text-center border transition-all ${
                (!attendance && !canCheckIn()) || (attendance && !attendance.checkOutTime && !canCheckOut())
                ? 'bg-amber-50 border-amber-100 text-amber-700'
                : 'bg-slate-100/50 border-slate-100 text-slate-700'
              }`}>
                <p className="text-[10px] font-black uppercase mb-1 opacity-60">وقت دوامك اليوم</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-sm font-black">{formatTime12h(todaySchedule.startTime)}</span>
                  <span className="material-symbols-outlined text-xs opacity-30">trending_flat</span>
                  <span className="text-sm font-black">{formatTime12h(todaySchedule.endTime)}</span>
                </div>
                
                {(!attendance && !canCheckIn()) && todaySchedule && (() => {
                  const [h, m] = todaySchedule.startTime.split(':').map(Number);
                  const sTime = new Date();
                  sTime.setHours(h, m, 0, 0);
                  return currentTime < sTime;
                })() && (
                   <div className="mt-2 flex items-center justify-center gap-2 text-[9px] font-black uppercase text-amber-600">
                     <span className="material-symbols-outlined text-xs">lock</span>
                     <span>لم يحن موعد الدخول بعد</span>
                   </div>
                )}

                {attendance && !attendance.checkOutTime && !canCheckOut() && (
                  <div className="mt-2 flex items-center justify-center gap-2 text-[9px] font-black uppercase text-amber-600">
                    <span className="material-symbols-outlined text-xs">lock</span>
                    <span>لا يمكنك تسجيل الانصراف قبل الموعد</span>
                  </div>
                )}
              </div>
            )}

            {attendance && (
              <div className="bg-white rounded-[32px] p-6 flex justify-between items-center border border-slate-50 shadow-sm">
                <div>
                  <span className="block text-[10px] font-black text-slate-400 mb-1 uppercase   opacity-60">آخر عملية: {attendance.checkOutTime ? 'انصراف' : 'دخول'}</span>
                  <span className="block text-xl font-black text-slate-800">
                    {formatTime12h(attendance.checkOutTime || attendance.checkInTime)}
                    <span className="text-xs font-bold text-slate-400 mr-2">اليوم</span>
                  </span>
                </div>
                <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center shadow-inner border border-green-100">
                  <span className="material-symbols-outlined text-green-500 filled-icon text-2xl">check_circle</span>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0.8; }
          100% { transform: translateY(192px); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}

