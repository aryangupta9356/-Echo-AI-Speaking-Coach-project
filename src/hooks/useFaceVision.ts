import { useCallback, useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export type VisionState = 'off' | 'initializing' | 'active' | 'error';

export interface VisionReading {
  eyeContactScore: number;
  smileScore: number;
  faceDetected: boolean;
}

const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let activeTfliteFilterCount = 0;
let originalConsoleError: typeof console.error | null = null;

function isBenignTfliteInfoLog(args: unknown[]): boolean {
  const first = args[0];
  return typeof first === 'string' && /^INFO:\s*Created TensorFlow Lite\b/i.test(first.trim());
}

function acquireTfliteLogFilter(): () => void {
  if (activeTfliteFilterCount === 0) {
    originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (isBenignTfliteInfoLog(args)) {
        console.info(...args);
        return;
      }
      originalConsoleError?.apply(console, args);
    };
  }
  activeTfliteFilterCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeTfliteFilterCount = Math.max(0, activeTfliteFilterCount - 1);
    if (activeTfliteFilterCount === 0 && originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = null;
    }
  };
}

export function useFaceVision() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const releaseLogFilterRef = useRef<(() => void) | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const lastSampleTimeRef = useRef<number>(0);

  const [visionEnabled, setVisionEnabled] = useState(false);
  const [visionState, setVisionState] = useState<VisionState>('off');
  const [visionError, setVisionError] = useState<string | null>(null);
  const [reading, setReading] = useState<VisionReading>({
    eyeContactScore: 0,
    smileScore: 0,
    faceDetected: false,
  });

  // Track smoothed averages across session
  const emaEyeRef = useRef<number>(0);
  const emaSmileRef = useRef<number>(0);
  const sampleCountRef = useRef<number>(0);
  const sumEyeRef = useRef<number>(0);
  const sumSmileRef = useRef<number>(0);

  const stopVision = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    releaseLogFilterRef.current?.();
    releaseLogFilterRef.current = null;
    setVisionEnabled(false);
    setVisionState('off');
    setVisionError(null);
  }, []);

  const resetAverages = useCallback(() => {
    emaEyeRef.current = 0;
    emaSmileRef.current = 0;
    sampleCountRef.current = 0;
    sumEyeRef.current = 0;
    sumSmileRef.current = 0;
    setReading({ eyeContactScore: 0, smileScore: 0, faceDetected: false });
  }, []);

  const getSessionAverages = useCallback(() => {
    if (sampleCountRef.current === 0) {
      return {
        avgEyeContact: Math.round(emaEyeRef.current),
        avgSmile: Math.round(emaSmileRef.current),
      };
    }
    return {
      avgEyeContact: Math.round(sumEyeRef.current / sampleCountRef.current),
      avgSmile: Math.round(sumSmileRef.current / sampleCountRef.current),
    };
  }, []);

  const startVision = useCallback(async () => {
    setVisionError(null);
    setVisionState('initializing');
    setVisionEnabled(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (!releaseLogFilterRef.current) {
        releaseLogFilterRef.current = acquireTfliteLogFilter();
      }

      if (!landmarkerRef.current) {
        const fileset = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
        landmarkerRef.current = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      }

      setVisionState('active');

      const renderLoop = (now: number) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = landmarkerRef.current;

        if (!video || !landmarker || !streamRef.current) {
          return;
        }

        // Throttle detection to ~15 fps for smooth CPU usage
        if (now - lastSampleTimeRef.current >= 66 && video.readyState >= 2) {
          lastSampleTimeRef.current = now;
          if (video.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = video.currentTime;
            const result = landmarker.detectForVideo(video, now);

            if (canvas) {
              if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
                canvas.width = video.videoWidth || 640;
                canvas.height = video.videoHeight || 480;
              }
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                  const landmarks = result.faceLandmarks[0];
                  ctx.fillStyle = 'rgba(16, 185, 129, 0.55)';
                  // Draw subtle subset of landmarks (eyes, mouth, contour)
                  for (let i = 0; i < landmarks.length; i += 4) {
                    const lm = landmarks[i];
                    ctx.beginPath();
                    ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 1.4, 0, Math.PI * 2);
                    ctx.fill();
                  }
                }
              }
            }

            const blendshapes = result.faceBlendshapes?.[0]?.categories;
            if (blendshapes && blendshapes.length > 0) {
              const scoreMap = new Map<string, number>();
              for (const cat of blendshapes) {
                scoreMap.set(cat.categoryName, cat.score);
              }

              // Smile estimate from mouthSmileLeft & mouthSmileRight
              const smileL = scoreMap.get('mouthSmileLeft') ?? 0;
              const smileR = scoreMap.get('mouthSmileRight') ?? 0;
              const rawSmile = Math.min(100, Math.round(((smileL + smileR) / 2) * 145));

              // Eye-contact estimate from gaze deviation blendshapes + head centering
              const gazeDeviations = [
                scoreMap.get('eyeLookInLeft') ?? 0,
                scoreMap.get('eyeLookOutLeft') ?? 0,
                scoreMap.get('eyeLookUpLeft') ?? 0,
                scoreMap.get('eyeLookDownLeft') ?? 0,
                scoreMap.get('eyeLookInRight') ?? 0,
                scoreMap.get('eyeLookOutRight') ?? 0,
                scoreMap.get('eyeLookUpRight') ?? 0,
                scoreMap.get('eyeLookDownRight') ?? 0,
              ];
              const avgGazeDeviation =
                gazeDeviations.reduce((sum, val) => sum + val, 0) / gazeDeviations.length;

              let headPenalty = 0;
              const landmarks = result.faceLandmarks?.[0];
              if (landmarks && landmarks[1]) {
                // Nose tip horizontal/vertical centering
                const dx = Math.abs(landmarks[1].x - 0.5);
                const dy = Math.abs(landmarks[1].y - 0.5);
                headPenalty = Math.max(0, (dx - 0.16) * 140) + Math.max(0, (dy - 0.18) * 110);
              }

              const rawEye = Math.max(
                0,
                Math.min(100, Math.round(100 - avgGazeDeviation * 190 - headPenalty))
              );

              const alpha = 0.25;
              emaEyeRef.current =
                sampleCountRef.current === 0
                  ? rawEye
                  : alpha * rawEye + (1 - alpha) * emaEyeRef.current;
              emaSmileRef.current =
                sampleCountRef.current === 0
                  ? rawSmile
                  : alpha * rawSmile + (1 - alpha) * emaSmileRef.current;

              sampleCountRef.current += 1;
              sumEyeRef.current += rawEye;
              sumSmileRef.current += rawSmile;

              setReading({
                eyeContactScore: Math.round(emaEyeRef.current),
                smileScore: Math.round(emaSmileRef.current),
                faceDetected: true,
              });
            } else {
              setReading((prev) => ({ ...prev, faceDetected: false }));
            }
          }
        }

        rafRef.current = requestAnimationFrame(renderLoop);
      };

      rafRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      releaseLogFilterRef.current?.();
      releaseLogFilterRef.current = null;
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera permission denied or MediaPipe could not initialize.';
      setVisionError(msg);
      setVisionState('error');
      setVisionEnabled(false);
    }
  }, []);

  const toggleVision = useCallback(async () => {
    if (visionEnabled) {
      stopVision();
    } else {
      await startVision();
    }
  }, [visionEnabled, startVision, stopVision]);

  useEffect(() => {
    return () => {
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      stopVision();
    };
  }, [stopVision]);

  return {
    videoRef,
    canvasRef,
    visionEnabled,
    visionState,
    visionError,
    reading,
    toggleVision,
    startVision,
    stopVision,
    resetAverages,
    getSessionAverages,
  };
}
