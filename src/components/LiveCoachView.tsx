import React, { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  EyeOff,
  FileText,
  Mic,
  RefreshCw,
  RotateCcw,
  Square,
  Keyboard,
  AlertCircle,
} from 'lucide-react';
import { useFaceVision } from '../hooks/useFaceVision.ts';
import { useLiveAudioSession } from '../hooks/useLiveAudioSession.ts';
import type { CoachingReport, PracticeContext, SpeakingSession } from '../shared/types.ts';
import { TranscriptHighlighter } from './TranscriptHighlighter.tsx';

interface LiveCoachViewProps {
  initialContext: PracticeContext;
  onReportGenerated: (session: SpeakingSession, report: CoachingReport) => void;
}

const CONTEXT_PROMPTS: Record<PracticeContext, string[]> = {
  interview: [
    'Tell me about a challenging project you built recently, your specific role, and what measurable result you achieved.',
    'Describe a time you had to debug a difficult issue under time pressure. How did you isolate and fix it?',
    'Walk me through a disagreement on a team project and how you reached a constructive resolution.',
  ],
  presentation: [
    'Introduce your project in 90 seconds: state the problem, explain your architecture, and highlight key outcomes.',
    'Explain a complex technical concept from your work so a non-technical stakeholder can follow clearly.',
    'Deliver the closing summary of a quarterly engineering demo, focusing on impact and next milestones.',
  ],
  standup: [
    'Give a crisp 60-second stand-up update: what you completed yesterday, your priority today, and any blockers.',
    'Summarize the current status of your sprint task and flag a dependency risk clearly to your team.',
  ],
  freeform: [
    'Speak for 60 seconds on a topic you know well, aiming for a calm 150 WPM pace and zero filler words.',
    'Explain why communication clarity matters in engineering teams, using one concrete example.',
  ],
};

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const LiveCoachView: React.FC<LiveCoachViewProps> = ({
  initialContext,
  onReportGenerated,
}) => {
  const [context, setContext] = useState<PracticeContext>(initialContext);
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [promptIndex, setPromptIndex] = useState(0);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const {
    videoRef,
    canvasRef,
    visionEnabled,
    visionState,
    visionError,
    reading,
    toggleVision,
    stopVision,
    resetAverages,
    getSessionAverages,
  } = useFaceVision();

  const {
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
  } = useLiveAudioSession({
    sessionId,
    eyeContactScore: reading.eyeContactScore,
    smileScore: reading.smileScore,
    visionEnabled,
  });

  useEffect(() => {
    setContext(initialContext);
    setPromptIndex(0);
  }, [initialContext]);

  // Create session record on backend when sessionId changes
  useEffect(() => {
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sessionId, mode: 'live', context }),
    }).catch(() => {});
  }, [sessionId, context]);

  const prompts = useMemo(() => CONTEXT_PROMPTS[context], [context]);
  const activePrompt = prompts[promptIndex % prompts.length];

  const handleToggleRecording = async () => {
    setReportError(null);
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleReset = () => {
    resetSession();
    resetAverages();
    setManualDraft('');
    setReportError(null);
    setSessionId(crypto.randomUUID());
  };

  const handleApplyManual = () => {
    if (!manualDraft.trim()) return;
    setManualTranscript(manualDraft.trim());
  };

  const handleGenerateReport = async () => {
    const finalTranscript = (transcript || manualDraft).trim();
    if (!finalTranscript) {
      setReportError('Speak into your microphone or enter a practice response before generating a report.');
      return;
    }

    if (isRecording) {
      stopRecording();
    }

    const { avgEyeContact, avgSmile } = getSessionAverages();
    setGeneratingReport(true);
    setReportError(null);

    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'live',
          context,
          transcript: finalTranscript,
          durationSeconds: Math.max(10, metrics.durationSeconds),
          loudnessDb: metrics.loudnessDb,
          speakingRatio: metrics.speakingRatio || 75,
          eyeContactScore: visionEnabled ? avgEyeContact || reading.eyeContactScore : 0,
          smileScore: visionEnabled ? avgSmile || reading.smileScore : 0,
          visionEnabled,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate coaching report.');
      }

      stopVision();
      onReportGenerated(data.session, data.report);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setGeneratingReport(false);
    }
  };

  const displayEye = visionEnabled ? reading.eyeContactScore : 0;
  const displaySmile = visionEnabled ? reading.smileScore : 0;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-4">
      {/* Studio Sub-Header */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-display text-lg font-semibold text-white">Live Coaching</h1>
          <span className="font-mono text-xs text-neutral-500 tabular-nums">{sessionId.slice(0, 8)}</span>

          {/* Context Switcher */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#070D0B] border border-white/[0.06]">
            {(['interview', 'presentation', 'standup', 'freeform'] as PracticeContext[]).map(
              (ctx) => (
                <button
                  key={ctx}
                  type="button"
                  disabled={isRecording}
                  onClick={() => {
                    setContext(ctx);
                    setPromptIndex(0);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                    context === ctx
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {ctx}
                </button>
              )
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleVision}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
              visionEnabled
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                : 'border-white/[0.12] bg-[#070D0B] text-neutral-300 hover:border-white/25'
            }`}
          >
            {visionEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Vision: {visionEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Privacy Notice Strip */}
      <div className="px-4 py-2 rounded-lg border border-white/[0.06] bg-[#0A110E] text-[11px] text-neutral-400 flex flex-wrap items-center justify-between gap-2">
        <span>
          Audio is streamed only for live analysis during this session · Eye-contact & smile
          detection run locally in your browser.
        </span>
        {usingSpeechFallback && (
          <span className="text-amber-300">Using browser speech recognition fallback</span>
        )}
      </div>

      {/* Main 12-Column Live Stage + Coaching Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left/Center Video & Telemetry Stage (8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-white/[0.08] bg-[#09100D] overflow-hidden flex flex-col">
          {/* Connection Telemetry & Timer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.07] bg-[#0C1512]">
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1.5 text-neutral-300">
                {liveWsState === 'connected' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                Live WS: {liveWsState}
              </span>
              <span className="inline-flex items-center gap-1.5 text-neutral-300">
                {coachWsState === 'connected' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
                Coach WS: {coachWsState}
              </span>
              <span className="text-neutral-300">Vision: {visionState}</span>
            </div>

            <div className="font-mono text-sm font-semibold text-white tabular-nums">
              {formatTimer(metrics.durationSeconds)}
            </div>
          </div>

          {/* Center Camera / Acoustic Stage */}
          <div className="relative h-[380px] sm:h-[430px] bg-[#050907] flex items-center justify-center overflow-hidden">
            {/* Browser-local Video + MediaPipe Landmark Canvas */}
            <video
              ref={videoRef}
              muted
              playsInline
              className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-200 ${
                visionEnabled && visionState === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none ${
                visionEnabled && visionState === 'active' ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Subtle Center Focus Reticle / Reactive Audio Ring */}
            <div className="relative z-10 flex flex-col items-center justify-center pointer-events-none">
              <div
                className="w-36 h-36 rounded-full border border-emerald-500/45 flex items-center justify-center transition-transform duration-100"
                style={{
                  transform: `scale(${1 + (isRecording ? audioLevel * 0.0025 : 0)})`,
                  boxShadow: isRecording
                    ? '0 0 0 10px rgba(16, 185, 129, 0.06)'
                    : 'none',
                }}
              >
                <div className="w-24 h-24 rounded-full border border-emerald-400/25 flex items-center justify-center bg-black/25 backdrop-blur-[2px]">
                  <Mic
                    className={`w-7 h-7 ${
                      isRecording ? 'text-emerald-400' : 'text-neutral-500'
                    }`}
                  />
                </div>
              </div>
              {!visionEnabled && (
                <p className="mt-4 text-xs text-neutral-400">
                  {isRecording
                    ? 'Listening and analyzing speaking pace...'
                    : 'Camera Vision is OFF · Enable Vision for eye-contact & smile cues'}
                </p>
              )}
              {visionEnabled && visionState === 'active' && !reading.faceDetected && (
                <p className="mt-3 px-2.5 py-1 rounded bg-black/70 text-xs text-amber-300">
                  Center your face in the frame for landmark tracking
                </p>
              )}
            </div>

            {/* Bottom Overlay Telemetry Strip */}
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-5 py-3">
              <div className="grid grid-cols-5 gap-2 text-center sm:text-left font-mono text-xs tabular-nums">
                <div>
                  <span className="text-neutral-400 block text-[10px]">Loudness</span>
                  <span className="text-white font-semibold">{metrics.loudnessDb} dB</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Speaking</span>
                  <span className="text-white font-semibold">{metrics.speakingRatio}%</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Words</span>
                  <span className="text-white font-semibold">{metrics.wordCount}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Eye Contact</span>
                  <span className="text-emerald-300 font-semibold">
                    {visionEnabled ? `${displayEye}%` : '--'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px]">Smile</span>
                  <span className="text-emerald-300 font-semibold">
                    {visionEnabled ? `${displaySmile}%` : '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Primary Controls Footer */}
          <div className="p-4 border-t border-white/[0.08] bg-[#0C1512] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleToggleRecording}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isRecording
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Stop Session
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    Start Live Session
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={generatingReport || (!transcript.trim() && !manualDraft.trim())}
                onClick={handleGenerateReport}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-white/[0.08] border border-white/[0.14] rounded-lg hover:bg-white/[0.14] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                {generatingReport ? 'Generating Report...' : 'Generate Report'}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-300 border border-white/[0.1] rounded-lg hover:bg-white/[0.05] transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowManualInput((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white border border-white/[0.08] rounded-lg cursor-pointer"
            >
              <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
              {showManualInput ? 'Hide Text Practice' : 'Type / Paste Speech'}
            </button>
          </div>

          {/* Errors */}
          {(errorMessage || visionError || reportError) && (
            <div className="px-4 py-3 bg-red-950/40 border-t border-red-500/30 text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                {errorMessage && <p>{errorMessage}</p>}
                {visionError && <p>Vision: {visionError}</p>}
                {reportError && <p>{reportError}</p>}
              </div>
            </div>
          )}

          {/* Optional Text Practice Input */}
          {showManualInput && (
            <div className="p-4 border-t border-white/[0.08] bg-[#080E0C] space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="manual-speech-input"
                  className="text-xs font-medium text-neutral-300"
                >
                  Type or paste a spoken response to analyze metrics & generate a Gemini report
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setManualDraft(
                      'Um, in my previous software engineering project, I basically built a real-time analytics dashboard using React and Node.js. First, I identified that slow database queries were causing latency, so I implemented Redis caching and indexed our primary tables. As a result, page load times dropped by 45% and the team shipped ahead of schedule.'
                    )
                  }
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Insert sample answer
                </button>
              </div>
              <textarea
                id="manual-speech-input"
                rows={3}
                value={manualDraft}
                onChange={(e) => setManualDraft(e.target.value)}
                placeholder="Paste or type your response here..."
                className="w-full rounded-lg border border-white/[0.1] bg-[#0C1512] p-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/60"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleApplyManual}
                  className="px-3.5 py-1.5 text-xs font-semibold text-neutral-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 cursor-pointer"
                >
                  Analyze Text Metrics
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Coaching Rail (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Practice Prompt */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-neutral-300 capitalize">
                {context} Prompt
              </h2>
              <button
                type="button"
                onClick={() => setPromptIndex((i) => i + 1)}
                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Next Prompt
              </button>
            </div>
            <p className="text-sm text-neutral-100 leading-relaxed">{activePrompt}</p>
          </div>

          {/* Live Coaching Metrics & Nudges */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-4">
            <h2 className="text-xs font-semibold text-neutral-300">Live Coaching</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/[0.07] bg-[#070D0B] p-3.5">
                <span className="block text-[11px] text-neutral-400">Pace</span>
                <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                  {metrics.wpm}
                </div>
                <span className="block text-[11px] text-neutral-500 mt-0.5">Target 140–170 WPM</span>
              </div>

              <div className="rounded-lg border border-white/[0.07] bg-[#070D0B] p-3.5">
                <span className="block text-[11px] text-neutral-400">Fillers / min</span>
                <div
                  className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                    metrics.fillerRatePerMin >= 4 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {metrics.fillerRatePerMin}
                </div>
                <span className="block text-[11px] text-neutral-500 mt-0.5">
                  Aim &lt; 3 · Total {metrics.fillerCount}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-[11px] font-medium text-neutral-400">Nudges</span>
              <div className="space-y-1.5 max-h-28 overflow-y-auto echo-scroll">
                {nudges.slice(0, 3).map((nudge) => (
                  <p
                    key={nudge.id}
                    className={`text-xs leading-snug ${
                      nudge.severity === 'caution'
                        ? 'text-amber-300'
                        : nudge.severity === 'positive'
                          ? 'text-emerald-300'
                          : 'text-neutral-300'
                    }`}
                  >
                    {nudge.message}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Live Transcript */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-neutral-300">Live Transcript</h2>
              <span className="font-mono text-[11px] text-neutral-500 tabular-nums">
                {metrics.wordCount} words
              </span>
            </div>
            <div className="h-44 overflow-y-auto echo-scroll pr-1">
              <TranscriptHighlighter
                transcript={transcript}
                interimTranscript={interimTranscript}
                emptyPlaceholder="Waiting for speech..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
