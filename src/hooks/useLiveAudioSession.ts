import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateMetricsFromTranscript,
  createInitialMetrics,
} from '../shared/scoring.ts';
import type { CoachingNudge, LiveMetrics } from '../shared/types.ts';

export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

interface UseLiveAudioSessionOptions {
  sessionId: string;
  eyeContactScore: number;
  smileScore: number;
  visionEnabled: boolean;
}

function float32ToBase64Pcm16(float32Array: Float32Array): string {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function useLiveAudioSession(options: UseLiveAudioSessionOptions) {
  const { sessionId, eyeContactScore, smileScore, visionEnabled } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [liveWsState, setLiveWsState] = useState<SocketStatus>('idle');
  const [coachWsState, setCoachWsState] = useState<SocketStatus>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [metrics, setMetrics] = useState<LiveMetrics>(() => createInitialMetrics());
  const [nudges, setNudges] = useState<CoachingNudge[]>([
    {
      id: 'initial-nudge',
      timestamp: new Date().toISOString(),
      severity: 'info',
      message: 'Press Start to stream audio and track pace, fillers, and visual presence.',
    },
  ]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usingSpeechFallback, setUsingSpeechFallback] = useState(false);

  // Refs to avoid stale closures inside audio/timer callbacks
  const liveWsRef = useRef<WebSocket | null>(null);
  const coachWsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const tickIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const activeFramesRef = useRef<number>(0);
  const totalFramesRef = useRef<number>(0);
  const loudnessRef = useRef<number>(-48);
  const speechRecRef = useRef<any>(null);
  const receivedLiveTranscriptRef = useRef<boolean>(false);

  const eyeContactRef = useRef(eyeContactScore);
  const smileRef = useRef(smileScore);
  const visionEnabledRef = useRef(visionEnabled);
  const transcriptRef = useRef(transcript);

  useEffect(() => {
    eyeContactRef.current = eyeContactScore;
    smileRef.current = smileScore;
    visionEnabledRef.current = visionEnabled;
  }, [eyeContactScore, smileScore, visionEnabled]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);

    if (tickIntervalRef.current !== null) {
      window.clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }

    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      speechRecRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (liveWsRef.current) {
      liveWsRef.current.close();
      liveWsRef.current = null;
    }

    if (coachWsRef.current) {
      coachWsRef.current.close();
      coachWsRef.current = null;
    }

    setLiveWsState('idle');
    setCoachWsState('idle');
    setAudioLevel(0);
    setInterimTranscript('');
  }, []);

  const startBrowserSpeechFallback = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor || speechRecRef.current) return;

    try {
      const rec = new SpeechRecognitionCtor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        // If Gemini Live already emitted transcripts, prefer server transcription
        if (receivedLiveTranscriptRef.current) return;

        let interim = '';
        let finalAdded = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalAdded += `${res[0].transcript} `;
          } else {
            interim += res[0].transcript;
          }
        }
        if (finalAdded.trim()) {
          setTranscript((prev) => (prev ? `${prev} ${finalAdded.trim()}` : finalAdded.trim()));
          if (coachWsRef.current?.readyState === WebSocket.OPEN) {
            coachWsRef.current.send(
              JSON.stringify({
                type: 'metrics_tick',
                appendTranscript: finalAdded.trim(),
              })
            );
          }
        }
        setInterimTranscript(interim);
      };

      rec.onerror = () => {
        // Silent fallback guard
      };

      rec.start();
      speechRecRef.current = rec;
      setUsingSpeechFallback(true);
    } catch {
      // Browser SpeechRecognition unavailable
    }
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setUsingSpeechFallback(false);
    receivedLiveTranscriptRef.current = false;
    activeFramesRef.current = 0;
    totalFramesRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      mediaStreamRef.current = stream;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const baseWs = `${protocol}//${window.location.host}`;

      // 1. Connect /ws/coaching
      setCoachWsState('connecting');
      const coachWs = new WebSocket(`${baseWs}/ws/coaching?sessionId=${encodeURIComponent(sessionId)}`);
      coachWsRef.current = coachWs;

      coachWs.onopen = () => {
        setCoachWsState('connected');
      };

      coachWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'coaching_update') {
            if (typeof data.transcript === 'string' && data.transcript.length >= transcriptRef.current.length) {
              setTranscript(data.transcript);
            }
            if (typeof data.interimTranscript === 'string') {
              setInterimTranscript(data.interimTranscript);
            }
            if (data.metrics) {
              setMetrics(data.metrics);
            }
            if (Array.isArray(data.nudges)) {
              setNudges(data.nudges);
            }
          }
        } catch {
          // Ignore malformed coaching frame
        }
      };

      coachWs.onerror = () => {
        setCoachWsState('error');
      };

      coachWs.onclose = () => {
        setCoachWsState('closed');
      };

      // 2. Connect /ws/live
      setLiveWsState('connecting');
      const liveWs = new WebSocket(`${baseWs}/ws/live?sessionId=${encodeURIComponent(sessionId)}`);
      liveWsRef.current = liveWs;

      liveWs.onopen = () => {
        setLiveWsState('connected');
      };

      liveWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'status') {
            if (data.state === 'connected') {
              setLiveWsState('connected');
            } else if (data.state === 'closed') {
              setLiveWsState('closed');
            }
          } else if (data.type === 'interim') {
            receivedLiveTranscriptRef.current = true;
            setInterimTranscript(data.text || '');
          } else if (data.type === 'final') {
            receivedLiveTranscriptRef.current = true;
            setInterimTranscript('');
            if (typeof data.fullTranscript === 'string') {
              setTranscript(data.fullTranscript);
            } else if (data.text) {
              setTranscript((prev) => (prev ? `${prev} ${data.text}` : data.text));
            }
          } else if (data.type === 'error') {
            setLiveWsState('error');
            const SpeechRecognitionCtor =
              (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognitionCtor) {
              startBrowserSpeechFallback();
            } else {
              setErrorMessage(data.message || 'Live speech transcription unavailable.');
            }
          }
        } catch {
          // Ignore malformed frame
        }
      };

      liveWs.onerror = () => {
        setLiveWsState('error');
        startBrowserSpeechFallback();
      };

      liveWs.onclose = () => {
        setLiveWsState('closed');
      };

      // 3. Configure Web Audio API (16kHz PCM capture in ~256ms chunks = 4096 samples)
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;

      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);

        // Compute RMS loudness in dBFS
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        const db = rms > 0 ? Math.max(-60, Math.min(0, Math.round(20 * Math.log10(rms)))) : -60;
        loudnessRef.current = db;
        setAudioLevel(Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100))));

        totalFramesRef.current += 1;
        if (db > -44) {
          activeFramesRef.current += 1;
        }

        if (liveWsRef.current?.readyState === WebSocket.OPEN) {
          const base64Audio = float32ToBase64Pcm16(input);
          liveWsRef.current.send(JSON.stringify({ type: 'audio', audio: base64Audio }));
        }
      };

      startTimeRef.current = Date.now();
      setIsRecording(true);

      // Periodic 1s coaching telemetry tick
      tickIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        const speakingRatio =
          totalFramesRef.current > 0
            ? Math.round((activeFramesRef.current / totalFramesRef.current) * 100)
            : 0;

        if (coachWsRef.current?.readyState === WebSocket.OPEN) {
          coachWsRef.current.send(
            JSON.stringify({
              type: 'metrics_tick',
              durationSeconds: elapsed,
              loudnessDb: loudnessRef.current,
              speakingRatio,
              eyeContactScore: eyeContactRef.current,
              smileScore: smileRef.current,
              visionEnabled: visionEnabledRef.current,
            })
          );
        } else {
          // Local update if coaching socket is still connecting
          setMetrics(
            calculateMetricsFromTranscript(transcriptRef.current, elapsed, {
              loudnessDb: loudnessRef.current,
              speakingRatio,
              eyeContactScore: eyeContactRef.current,
              smileScore: smileRef.current,
              visionEnabled: visionEnabledRef.current,
            })
          );
        }
      }, 1000);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Microphone access denied. Please enable microphone permissions.';
      setErrorMessage(msg);
      stopRecording();
    }
  }, [sessionId, startBrowserSpeechFallback, stopRecording]);

  const resetSession = useCallback(() => {
    stopRecording();
    setTranscript('');
    setInterimTranscript('');
    setMetrics(createInitialMetrics());
    setNudges([
      {
        id: `nudge-reset-${Date.now()}`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        message: 'Session cleared — press Start whenever you are ready.',
      },
    ]);
    setErrorMessage(null);
  }, [stopRecording]);

  const setManualTranscript = useCallback(
    (text: string, simulatedDuration?: number) => {
      setTranscript(text);
      const dur =
        simulatedDuration ??
        Math.max(metrics.durationSeconds, Math.max(15, Math.round((text.split(/\s+/).filter(Boolean).length / 150) * 60)));
      const updated = calculateMetricsFromTranscript(text, dur, {
        loudnessDb: metrics.loudnessDb === -48 ? -24 : metrics.loudnessDb,
        speakingRatio: metrics.speakingRatio || 76,
        eyeContactScore: eyeContactRef.current,
        smileScore: smileRef.current,
        visionEnabled: visionEnabledRef.current,
      });
      setMetrics(updated);
      if (coachWsRef.current?.readyState === WebSocket.OPEN) {
        coachWsRef.current.send(
          JSON.stringify({
            type: 'metrics_tick',
            setTranscript: text,
            durationSeconds: dur,
          })
        );
      }
    },
    [metrics.durationSeconds, metrics.loudnessDb, metrics.speakingRatio]
  );

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    isRecording,
    liveWsState,
    coachWsState,
    transcript,
    interimTranscript,
    metrics,
    nudges,
    audioLevel,
    errorMessage,
    usingSpeechFallback,
    startRecording,
    stopRecording,
    resetSession,
    setManualTranscript,
  };
}
