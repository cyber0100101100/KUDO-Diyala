import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import * as faceapi from '@vladmandic/face-api';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const FACE_API_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

export default function FaceEnrollmentScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setVideoStream] = useState<MediaStream | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptors, setDescriptors] = useState<Float32Array[]>([]);
  const [poseValid, setPoseValid] = useState(false);
  const [poseFeedback, setPoseFeedback] = useState<string>('');
  
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const processingRef = useRef(false);
  const captureHoldRef = useRef<number | null>(null);

  const steps = [
    { id: 1, label: 'الوجه الأمامي' },
    { id: 2, label: 'الاتجاه إلى اليمين' },
    { id: 3, label: 'الاتجاه إلى اليسار' },
    { id: 4, label: 'النظر إلى الأعلى' },
    { id: 5, label: 'النظر إلى الأسفل' },
  ];

  useEffect(() => {
    const initialize = async () => {
      await loadModels();
      await startCamera();
    };
    initialize();
    return () => stopCamera();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      
      // Load MediaPipe Face Landmarker
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });

      // Load Face-API models for embedding generation
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_API_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL)
      ]);

      setModelsLoaded(true);
    } catch (err) {
      console.error('Error loading models:', err);
      setError('خطأ في تحميل محركات الذكاء الاصطناعي. تأكد من اتصال الإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      setVideoStream(s);
    } catch (err) {
      console.error('Camera error:', err);
      setError('نحتاج إلى الوصول إلى الكاميرا لإتمام عملية البصمة.');
    }
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(err => {
          console.error("Video play error:", err);
        });
      };
    }
  }, [stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
  };

  useEffect(() => {
    let animationId: number;
    
    const runDetection = async () => {
      if (!modelsLoaded || !videoRef.current || !faceLandmarkerRef.current || loading || processingRef.current || currentStep > 5) {
        animationId = requestAnimationFrame(runDetection);
        return;
      }

      const video = videoRef.current;
      if (video.readyState < 2) {
        animationId = requestAnimationFrame(runDetection);
        return;
      }

      const startTimeMs = performance.now();
      const results = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        const landmarks = results.faceLandmarks[0];
        const { yaw, pitch } = calculateOrientation(landmarks);
        
        const isValid = checkPoseRequirement(yaw, pitch, currentStep);
        setPoseValid(isValid);

        if (isValid) {
          if (!captureHoldRef.current) {
            captureHoldRef.current = Date.now();
          } else if (Date.now() - captureHoldRef.current > 500) { // Fast hold (0.5s)
            await captureDescriptor();
          }
        } else {
          captureHoldRef.current = null;
          updateFeedback(yaw, pitch, currentStep);
        }
      } else {
        setPoseValid(false);
        setPoseFeedback('يرجى وضع وجهك أمام الكاميرا');
        captureHoldRef.current = null;
      }

      animationId = requestAnimationFrame(runDetection);
    };

    if (modelsLoaded && stream) {
      animationId = requestAnimationFrame(runDetection);
    }

    return () => cancelAnimationFrame(animationId);
  }, [modelsLoaded, stream, loading, currentStep, descriptors]);

  const calculateOrientation = (landmarks: any[]) => {
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const eyeCenter = (leftEye.x + rightEye.x) / 2;
    const eyeDist = rightEye.x - leftEye.x;
    const yaw = ((nose.x - eyeCenter) / eyeDist) * 100;

    const faceVerticalCenter = (forehead.y + chin.y) / 2;
    const faceHeight = chin.y - forehead.y;
    const pitch = ((nose.y - faceVerticalCenter) / faceHeight) * 100;

    return { yaw, pitch };
  };

  const checkPoseRequirement = (yaw: number, pitch: number, step: number) => {
    switch (step) {
      case 1: return Math.abs(yaw) < 8 && Math.abs(pitch) < 8;
      case 2: return yaw > 20;
      case 3: return yaw < -20;
      case 4: return pitch < -15;
      case 5: return pitch > 15;
      default: return false;
    }
  };

  const updateFeedback = (yaw: number, pitch: number, step: number) => {
    switch (step) {
      case 1: setPoseFeedback('ضع وجهك في المنتصف'); break;
      case 2: setPoseFeedback(yaw < -5 ? 'أنت تلتفت لليسار! أدر وجهك لليمين' : 'أدر وجهك لليمين أكثر'); break;
      case 3: setPoseFeedback(yaw > 5 ? 'أنت تلتفت لليمين! أدر وجهك لليسار' : 'أدر وجهك لليسار أكثر'); break;
      case 4: setPoseFeedback('ارفع رأسك للأعلى'); break;
      case 5: setPoseFeedback('اخفض رأسك للأسفل'); break;
    }
  };

  const captureDescriptor = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    
    try {
      setPoseFeedback('تم الالتقاط! ابق ثابتاً...');
      const video = videoRef.current!;
      const detection = await faceapi
        .detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        const newDescriptors = [...descriptors, detection.descriptor];
        setDescriptors(newDescriptors);
        if (currentStep < 5) {
          setCurrentStep(prev => prev + 1);
          captureHoldRef.current = null;
        } else {
          await completeEnrollment(newDescriptors);
        }
      } else {
        captureHoldRef.current = null;
      }
    } catch (err) {
      console.error('Capture error:', err);
    } finally {
      processingRef.current = false;
    }
  };

  const completeEnrollment = async (finalDescriptors: Float32Array[]) => {
    setLoading(true);
    try {
      if (user && finalDescriptors.length > 0) {
        const descriptorLength = finalDescriptors[0].length;
        const avgDescriptor = new Float32Array(descriptorLength);
        for (let i = 0; i < descriptorLength; i++) {
          let sum = 0;
          for (const d of finalDescriptors) sum += d[i];
          avgDescriptor[i] = sum / finalDescriptors.length;
        }
        await updateDoc(doc(db, 'users', user.uid), {
          enrollmentComplete: true,
          faceEmbedding: Array.from(avgDescriptor)
        });
        navigate('/employee/home');
      }
    } catch (err) {
      setError('حدث خطأ أثناء حفظ البصمة.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 text-slate-800 min-h-screen flex flex-col font-sans">
      <div className="w-full bg-white min-h-screen relative flex flex-col">
        <header className="bg-white/90 backdrop-blur-xl px-6 py-4 flex items-center justify-between sticky top-0 z-50 border-b border-slate-100/50 shadow-sm">
          <button onClick={() => navigate('/employee/home')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all active:scale-95">
            <span className="material-symbols-outlined text-xl">arrow_forward</span>
          </button>
          <h1 className="text-base font-black text-slate-900  ">إعداد بصمة الوجه</h1>
          <div className="w-9"></div>
        </header>

        <main className="flex-1 flex flex-col p-6 pb-32 max-w-2xl mx-auto w-full">
          <div className="w-full flex justify-center mb-6">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-lg border border-slate-50 flex items-center justify-center">
              <img alt="KUDO Logo" className="h-10 w-auto object-contain" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBoGgSNGhdMLpQ2C5v6Jp3NxcRlZc4D9tKntgy6K_TUwwUsvoZTh_Gm_92I03yMOtVXLB4a05Btsma6JgrC_FLRp9Qp6LqpnhtSSLMN6RkdVv5610MQpGkySxlPQVnaKGhkRClEFaaAXoffQJ309MfB3555EI8sOU89APs6_KuMit6P5jidaz9QT4O-KV6eYqhJPNNyM7FHffRmo8cGHshA1a3DVzxmLwMZnsBzYj9Y2g4GvQoLvP7PJNZQORmCoLobLUw" />
            </div>
          </div>

          <div className="text-center mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase   mb-1">الخطوة {currentStep} من 5</p>
            <h2 className="text-xl font-black text-slate-900">{steps.find(s => s.id === currentStep)?.label}</h2>
          </div>

          <div className="relative w-64 h-64 md:w-80 md:h-80 mx-auto mb-10 flex items-center justify-center">
            <div className={`absolute inset-0 rounded-full blur-2xl animate-pulse transition-all duration-500 ${poseValid ? 'bg-green-100' : 'bg-red-50'}`}></div>
            <div className={`relative w-full h-full rounded-full border-4 transition-all duration-300 flex flex-col items-center justify-center bg-white shadow-xl z-10 overflow-hidden ${poseValid ? 'border-green-500' : 'border-slate-100'}`}>
              {stream ? (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="flex flex-col items-center gap-4 text-slate-300">
                  <span className="material-symbols-outlined text-7xl filled-icon">face</span>
                  <p className="text-[10px] font-black uppercase  ">{loading ? 'جاري التحميل...' : 'تجهيز الكاميرا'}</p>
                </div>
              )}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle cx="50%" cy="50%" r="48%" fill="none" stroke={poseValid ? '#22c55e' : '#f1f5f9'} strokeWidth="8" strokeDasharray="301.5" strokeDashoffset={poseValid ? "0" : "301.5"} className="transition-all duration-500 ease-linear" />
                </svg>
              </div>
            </div>
            <div className={`absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 rounded-tr-3xl translate-x-2 -translate-y-2 z-20 transition-all ${poseValid ? 'border-green-500' : 'border-[#E31E24]'}`}></div>
            <div className={`absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 rounded-tl-3xl -translate-x-2 -translate-y-2 z-20 transition-all ${poseValid ? 'border-green-500' : 'border-[#E31E24]'}`}></div>
            <div className={`absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 rounded-br-3xl translate-x-2 translate-y-2 z-20 transition-all ${poseValid ? 'border-green-500' : 'border-[#E31E24]'}`}></div>
            <div className={`absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 rounded-bl-3xl -translate-x-2 translate-y-2 z-20 transition-all ${poseValid ? 'border-green-500' : 'border-[#E31E24]'}`}></div>
          </div>

          <div className="bg-white rounded-[32px] p-6 border border-slate-50 shadow-sm mb-8">
             <div className="flex justify-between gap-2">
                {steps.map((step) => (
                  <div key={step.id} className="flex-1 flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${
                      currentStep === step.id ? 'bg-[#E31E24] text-white shadow-lg shadow-red-100 scale-110' : 
                      currentStep > step.id ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-300'
                    }`}>
                      <span className="material-symbols-outlined text-lg">
                        {currentStep > step.id ? 'check' : 
                         step.id === 1 ? 'face' : 
                         step.id === 2 ? 'arrow_forward' : 
                         step.id === 3 ? 'arrow_back' : 
                         step.id === 4 ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    </div>
                    <span className="text-[8px] font-black uppercase text-slate-400  er">{step.label.split(' ').pop()}</span>
                  </div>
                ))}
             </div>
          </div>

          <div className="mt-auto">
            {error && <p className="bg-red-50 text-[#E31E24] p-4 rounded-2xl text-center mb-6 font-bold text-sm border border-red-100">{error}</p>}
            <div className={`w-full py-5 px-6 rounded-3xl flex flex-col items-center gap-2 transition-all ${poseValid ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
               <p className="text-xs font-black uppercase  ">{poseValid ? 'الوضعية صحيحة' : 'تعليمات التحقق'}</p>
               <p className="text-sm font-bold">{poseFeedback || 'جاري المسح...'}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

