import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { Modality, type LiveServerMessage } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  calculateMetricsFromTranscript,
  calculatePerformanceScores,
  createInitialMetrics,
} from './src/shared/scoring.ts';
import type {
  CoachingNudge,
  InterviewDifficulty,
  MockInterviewQuestion,
  PracticeContext,
  SessionMode,
  SpeakingSession,
} from './src/shared/types.ts';
import {
  evaluateMockInterviewAnswer,
  generateCoachingReport,
  generateMockInterviewQuestions,
  getLiveAiClient,
  LIVE_TRANSCRIBE_MODEL,
  transcribeAudioClip,
} from './src/server/gemini.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '15mb' }));

// Serve MediaPipe WASM runtime files locally from node_modules
app.use(
  '/mediapipe-wasm',
  express.static(path.resolve('node_modules/@mediapipe/tasks-vision/wasm'))
);

// In-memory session store (as documented in Echo architecture Section 1.8 & 3.2.3)
const sessions = new Map<string, SpeakingSession>();
// Coaching WebSocket subscribers keyed by sessionId
const coachingClients = new Map<string, Set<WebSocket>>();
// Rate-limit nudges per session
const lastNudgeAt = new Map<string, { timestamp: number; key: string }>();

function getOrCreateSession(
  id: string,
  defaults?: {
    mode?: SessionMode;
    context?: PracticeContext;
    title?: string;
  }
): SpeakingSession {
  const existing = sessions.get(id);
  if (existing) return existing;

  const session: SpeakingSession = {
    id,
    mode: defaults?.mode ?? 'live',
    context: defaults?.context ?? 'interview',
    title: defaults?.title ?? 'Live Coaching Session',
    createdAt: new Date().toISOString(),
    status: 'active',
    transcript: '',
    interimTranscript: '',
    metrics: createInitialMetrics(),
    nudges: [
      {
        id: `nudge-init-${Date.now()}`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        message: 'Session ready — speak naturally at a steady 140–170 WPM pace.',
      },
    ],
  };
  sessions.set(id, session);
  return session;
}

function maybeAddNudge(session: SpeakingSession) {
  const now = Date.now();
  const prev = lastNudgeAt.get(session.id);
  if (prev && now - prev.timestamp < 8000) return;

  const { wpm, fillerRatePerMin, wordCount, visionEnabled, eyeContactScore, loudnessDb } =
    session.metrics;

  if (wordCount < 10) return;

  let candidate: { key: string; severity: CoachingNudge['severity']; message: string } | null = null;

  if (fillerRatePerMin >= 4.0) {
    candidate = {
      key: 'fillers',
      severity: 'caution',
      message: `Filler rate is ${fillerRatePerMin}/min — pause silently for a beat instead of saying "um" or "like".`,
    };
  } else if (wpm > 185) {
    candidate = {
      key: 'fast',
      severity: 'caution',
      message: `Speaking quickly at ${wpm} WPM — slow slightly to let key points land.`,
    };
  } else if (wpm > 0 && wpm < 105 && session.metrics.durationSeconds > 12) {
    candidate = {
      key: 'slow',
      severity: 'info',
      message: `Pace is measured (${wpm} WPM) — bring a touch more forward momentum.`,
    };
  } else if (visionEnabled && eyeContactScore > 0 && eyeContactScore < 45) {
    candidate = {
      key: 'eye',
      severity: 'caution',
      message: 'Keep your gaze near the camera lens to strengthen eye contact.',
    };
  } else if (loudnessDb > -52 && loudnessDb < -40) {
    candidate = {
      key: 'volume',
      severity: 'info',
      message: 'Project slightly more vocal energy for clearer microphone capture.',
    };
  } else if (wpm >= 135 && wpm <= 175 && fillerRatePerMin < 2.5) {
    candidate = {
      key: 'good',
      severity: 'positive',
      message: 'Strong steady pace and clean phrasing — keep going!',
    };
  }

  if (candidate && prev?.key !== candidate.key) {
    lastNudgeAt.set(session.id, { timestamp: now, key: candidate.key });
    session.nudges = [
      {
        id: `nudge-${now}`,
        timestamp: new Date(now).toISOString(),
        severity: candidate.severity,
        message: candidate.message,
      },
      ...session.nudges,
    ].slice(0, 12);
  }
}

function broadcastCoachingUpdate(session: SpeakingSession) {
  const subscribers = coachingClients.get(session.id);
  if (!subscribers || subscribers.size === 0) return;

  const payload = JSON.stringify({
    type: 'coaching_update',
    sessionId: session.id,
    transcript: session.transcript,
    interimTranscript: session.interimTranscript,
    metrics: session.metrics,
    nudges: session.nudges,
  });

  for (const ws of subscribers) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ============================================================================
// REST API ROUTES
// ============================================================================

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    ),
    activeSessions: sessions.size,
  });
});

app.post('/api/sessions', (req, res) => {
  const {
    id: requestedId,
    mode = 'live',
    context = 'interview',
    title,
    role,
    difficulty,
  } = req.body ?? {};

  const id = typeof requestedId === 'string' && requestedId.trim() ? requestedId.trim() : crypto.randomUUID();
  const contextLabel =
    context === 'interview'
      ? 'Interview Practice'
      : context === 'presentation'
        ? 'Presentation Rehearsal'
        : context === 'standup'
          ? 'Stand-up Update'
          : 'Freeform Practice';

  const session = getOrCreateSession(id, {
    mode,
    context,
    title: title || (mode === 'mock-interview' ? `Mock Interview · ${role || 'General'}` : contextLabel),
  });

  if (mode === 'mock-interview') {
    session.mockInterview = {
      role: role || 'Software Engineer',
      difficulty: (difficulty as InterviewDifficulty) || 'entry',
      questions: [],
      evaluations: [],
    };
  }

  res.status(201).json({ session });
});

app.get('/api/sessions', (_req, res) => {
  const list = Array.from(sessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  res.json({ sessions: list });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json({ session });
});

app.delete('/api/sessions/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

app.post('/api/sessions/:id/complete', async (req, res) => {
  try {
    const {
      transcript,
      durationSeconds,
      loudnessDb,
      speakingRatio,
      eyeContactScore,
      smileScore,
      visionEnabled,
      context,
      mode,
    } = req.body ?? {};

    const session = getOrCreateSession(req.params.id, {
      mode: mode ?? 'live',
      context: context ?? 'interview',
    });

    const finalTranscript =
      typeof transcript === 'string' && transcript.trim().length > 0
        ? transcript.trim()
        : session.transcript.trim();

    const finalDuration =
      typeof durationSeconds === 'number' && durationSeconds > 0
        ? durationSeconds
        : Math.max(1, session.metrics.durationSeconds);

    const metrics = calculateMetricsFromTranscript(finalTranscript, finalDuration, {
      loudnessDb: typeof loudnessDb === 'number' ? loudnessDb : session.metrics.loudnessDb,
      speakingRatio:
        typeof speakingRatio === 'number' ? speakingRatio : session.metrics.speakingRatio,
      eyeContactScore:
        typeof eyeContactScore === 'number' ? eyeContactScore : session.metrics.eyeContactScore,
      smileScore: typeof smileScore === 'number' ? smileScore : session.metrics.smileScore,
      visionEnabled:
        typeof visionEnabled === 'boolean' ? visionEnabled : session.metrics.visionEnabled,
    });

    const scores = calculatePerformanceScores(finalTranscript, metrics);

    session.transcript = finalTranscript;
    session.interimTranscript = '';
    session.metrics = metrics;
    session.status = 'completed';
    session.completedAt = new Date().toISOString();

    const report = await generateCoachingReport({
      sessionId: session.id,
      mode: session.mode,
      context: context ?? session.context,
      transcript: finalTranscript,
      metrics,
      scores,
    });

    session.report = report;
    res.json({ session, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate coaching report';
    console.error('Report generation error:', err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/mock-interview/questions', async (req, res) => {
  try {
    const { role = 'Software Engineer', difficulty = 'entry', count = 4, sessionId } =
      req.body ?? {};

    const questions = await generateMockInterviewQuestions({
      role: String(role),
      difficulty: difficulty as InterviewDifficulty,
      count: Number(count),
    });

    if (sessionId) {
      const session = getOrCreateSession(String(sessionId), {
        mode: 'mock-interview',
        context: 'interview',
        title: `Mock Interview · ${role}`,
      });
      session.mockInterview = {
        role: String(role),
        difficulty: difficulty as InterviewDifficulty,
        questions,
        evaluations: session.mockInterview?.evaluations ?? [],
      };
    }

    res.json({ questions });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate questions';
    console.error('Mock question error:', err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/mock-interview/evaluate', async (req, res) => {
  try {
    const {
      sessionId,
      role = 'Software Engineer',
      difficulty = 'entry',
      question,
      answerTranscript,
      metrics,
    } = req.body ?? {};

    if (!question || !question.prompt) {
      res.status(400).json({ error: 'Question object is required' });
      return;
    }

    const parsedMetrics = calculateMetricsFromTranscript(
      String(answerTranscript ?? ''),
      Number(metrics?.durationSeconds ?? 45),
      {
        loudnessDb: metrics?.loudnessDb ?? -32,
        speakingRatio: metrics?.speakingRatio ?? 75,
        eyeContactScore: metrics?.eyeContactScore ?? 0,
        smileScore: metrics?.smileScore ?? 0,
        visionEnabled: Boolean(metrics?.visionEnabled),
      }
    );

    const evaluation = await evaluateMockInterviewAnswer({
      role: String(role),
      difficulty: difficulty as InterviewDifficulty,
      question: question as MockInterviewQuestion,
      answerTranscript: String(answerTranscript ?? ''),
      metrics: parsedMetrics,
    });

    if (sessionId) {
      const session = sessions.get(String(sessionId));
      if (session?.mockInterview) {
        const idx = session.mockInterview.evaluations.findIndex(
          (e) => e.questionId === evaluation.questionId
        );
        if (idx >= 0) {
          session.mockInterview.evaluations[idx] = evaluation;
        } else {
          session.mockInterview.evaluations.push(evaluation);
        }
        // Aggregate transcript for session-wide coaching report
        session.transcript = session.mockInterview.evaluations
          .map((e, i) => `Q${i + 1}: ${e.questionPrompt}\nA${i + 1}: ${e.answerTranscript}`)
          .join('\n\n');
      }
    }

    res.json({ evaluation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to evaluate answer';
    console.error('Mock evaluation error:', err);
    res.status(500).json({ error: message });
  }
});

app.post('/api/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body ?? {};
    if (!audioBase64) {
      res.status(400).json({ error: 'audioBase64 is required' });
      return;
    }
    const transcript = await transcribeAudioClip(String(audioBase64), String(mimeType));
    res.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Audio transcription failed';
    console.error('Audio transcription error:', err);
    res.status(500).json({ error: message });
  }
});

// ============================================================================
// HTTP + WEBSOCKET SERVER SETUP
// ============================================================================

async function startServer() {
  const server = http.createServer(app);

  const liveWss = new WebSocketServer({ noServer: true });
  const coachingWss = new WebSocketServer({ noServer: true });

  // /ws/live — Live audio streaming & real-time speech transcription
  liveWss.on('connection', async (clientWs, req) => {
    const url = new URL(req.url || '/ws/live', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();
    const session = getOrCreateSession(sessionId);

    let liveSession: Awaited<ReturnType<ReturnType<typeof getLiveAiClient>['live']['connect']>> | null =
      null;
    let liveReady = false;
    let closed = false;
    const pendingAudioChunks: string[] = [];

    const sendSafe = (obj: unknown) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(obj));
      }
    };

    try {
      const ai = getLiveAiClient();
      sendSafe({ type: 'status', state: 'connecting', sessionId });

      liveSession = await ai.live.connect({
        model: LIVE_TRANSCRIBE_MODEL,
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            liveReady = true;
            sendSafe({ type: 'status', state: 'connected', sessionId });
            while (pendingAudioChunks.length > 0 && liveSession) {
              const chunk = pendingAudioChunks.shift();
              if (chunk) {
                liveSession.sendRealtimeInput({
                  audio: { data: chunk, mimeType: 'audio/pcm;rate=16000' },
                });
              }
            }
          },
          onmessage: (message: LiveServerMessage) => {
            const content = message.serverContent;
            if (content?.interimInputTranscription?.text) {
              session.interimTranscript = content.interimInputTranscription.text;
              sendSafe({
                type: 'interim',
                text: session.interimTranscript,
              });
              broadcastCoachingUpdate(session);
            }
            if (content?.inputTranscription?.text) {
              const finalized = content.inputTranscription.text.trim();
              if (finalized) {
                session.transcript = session.transcript
                  ? `${session.transcript} ${finalized}`
                  : finalized;
                session.interimTranscript = '';
                session.metrics = calculateMetricsFromTranscript(
                  session.transcript,
                  session.metrics.durationSeconds,
                  session.metrics
                );
                maybeAddNudge(session);
                sendSafe({
                  type: 'final',
                  text: finalized,
                  fullTranscript: session.transcript,
                });
                broadcastCoachingUpdate(session);
              }
            }
          },
          onerror: (err) => {
            console.error('Gemini Live transcription error:', err);
            sendSafe({
              type: 'error',
              code: 'LIVE_TRANSCRIPTION_ERROR',
              message: 'Live transcription stream encountered an error.',
            });
          },
          onclose: () => {
            liveReady = false;
            if (!closed) {
              sendSafe({ type: 'status', state: 'closed', sessionId });
            }
          },
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Live transcription unavailable';
      console.error('Could not open Gemini Live transcription:', msg);
      sendSafe({
        type: 'error',
        code: 'TRANSCRIPTION_UNAVAILABLE',
        message: msg,
      });
    }

    clientWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'audio' && typeof msg.audio === 'string') {
          if (liveReady && liveSession) {
            liveSession.sendRealtimeInput({
              audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (pendingAudioChunks.length < 40) {
            pendingAudioChunks.push(msg.audio);
          }
        }
      } catch {
        // Ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      closed = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close error
      }
    });
  });

  // /ws/coaching — Real-time metrics, transcript sync, and coaching nudges
  coachingWss.on('connection', (clientWs, req) => {
    const url = new URL(req.url || '/ws/coaching', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId') || crypto.randomUUID();
    const session = getOrCreateSession(sessionId);

    if (!coachingClients.has(sessionId)) {
      coachingClients.set(sessionId, new Set());
    }
    coachingClients.get(sessionId)!.add(clientWs);

    // Initial sync
    clientWs.send(
      JSON.stringify({
        type: 'coaching_update',
        sessionId: session.id,
        transcript: session.transcript,
        interimTranscript: session.interimTranscript,
        metrics: session.metrics,
        nudges: session.nudges,
      })
    );

    clientWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'metrics_tick') {
          const duration =
            typeof msg.durationSeconds === 'number'
              ? msg.durationSeconds
              : session.metrics.durationSeconds;

          // Support manual or browser speech fallback text if live WS transcription isn't producing
          if (typeof msg.setTranscript === 'string') {
            session.transcript = msg.setTranscript;
          } else if (typeof msg.appendTranscript === 'string' && msg.appendTranscript.trim()) {
            const chunk = msg.appendTranscript.trim();
            session.transcript = session.transcript ? `${session.transcript} ${chunk}` : chunk;
          }
          if (typeof msg.interimTranscript === 'string') {
            session.interimTranscript = msg.interimTranscript;
          }

          const fullTextForLive = session.interimTranscript
            ? `${session.transcript} ${session.interimTranscript}`.trim()
            : session.transcript;

          session.metrics = calculateMetricsFromTranscript(fullTextForLive, duration, {
            loudnessDb:
              typeof msg.loudnessDb === 'number' ? msg.loudnessDb : session.metrics.loudnessDb,
            speakingRatio:
              typeof msg.speakingRatio === 'number'
                ? msg.speakingRatio
                : session.metrics.speakingRatio,
            eyeContactScore:
              typeof msg.eyeContactScore === 'number'
                ? msg.eyeContactScore
                : session.metrics.eyeContactScore,
            smileScore:
              typeof msg.smileScore === 'number' ? msg.smileScore : session.metrics.smileScore,
            visionEnabled:
              typeof msg.visionEnabled === 'boolean'
                ? msg.visionEnabled
                : session.metrics.visionEnabled,
          });

          maybeAddNudge(session);
          broadcastCoachingUpdate(session);
        } else if (msg.type === 'reset') {
          session.transcript = '';
          session.interimTranscript = '';
          session.metrics = createInitialMetrics();
          session.nudges = [
            {
              id: `nudge-reset-${Date.now()}`,
              timestamp: new Date().toISOString(),
              severity: 'info',
              message: 'Session reset — ready to begin speaking.',
            },
          ];
          broadcastCoachingUpdate(session);
        }
      } catch {
        // Ignore malformed message
      }
    });

    clientWs.on('close', () => {
      const set = coachingClients.get(sessionId);
      if (set) {
        set.delete(clientWs);
        if (set.size === 0) coachingClients.delete(sessionId);
      }
    });
  });

  // Route HTTP upgrade requests explicitly between /ws/live, /ws/coaching, and Vite
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    if (pathname === '/ws/live') {
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    } else if (pathname === '/ws/coaching') {
      coachingWss.handleUpgrade(req, socket, head, (ws) => {
        coachingWss.emit('connection', ws, req);
      });
    } else {
      // Leave unhandled for Vite or reject cleanly
      socket.destroy();
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Echo server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Echo server:', err);
  process.exit(1);
});
