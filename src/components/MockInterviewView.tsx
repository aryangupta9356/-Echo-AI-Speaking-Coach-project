import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Mic,
  Sparkles,
  Square,
} from 'lucide-react';
import { useFaceVision } from '../hooks/useFaceVision.ts';
import { useLiveAudioSession } from '../hooks/useLiveAudioSession.ts';
import { calculateMetricsFromTranscript } from '../shared/scoring.ts';
import type {
  CoachingReport,
  InterviewDifficulty,
  MockAnswerEvaluation,
  MockInterviewQuestion,
  SpeakingSession,
} from '../shared/types.ts';
import { TranscriptHighlighter } from './TranscriptHighlighter.tsx';

interface MockInterviewViewProps {
  onReportGenerated: (session: SpeakingSession, report: CoachingReport) => void;
}

const PRESET_ROLES = [
  'Software Engineer',
  'Full-Stack Developer',
  'Frontend Engineer',
  'Data Analyst',
  'Product Manager',
  'Campus Placement / HR',
];

export const MockInterviewView: React.FC<MockInterviewViewProps> = ({ onReportGenerated }) => {
  const [role, setRole] = useState('Software Engineer');
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>('entry');
  const [questionCount, setQuestionCount] = useState(3);

  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
  const [questions, setQuestions] = useState<MockInterviewQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [evaluations, setEvaluations] = useState<MockAnswerEvaluation[]>([]);
  const [answerDraft, setAnswerDraft] = useState('');

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [completingReport, setCompletingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    videoRef,
    canvasRef,
    visionEnabled,
    visionState,
    reading,
    toggleVision,
    stopVision,
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
    startRecording,
    stopRecording,
    resetSession,
  } = useLiveAudioSession({
    sessionId,
    eyeContactScore: reading.eyeContactScore,
    smileScore: reading.smileScore,
    visionEnabled,
  });

  const currentQuestion = questions[currentIndex] ?? null;
  const currentEvaluation = currentQuestion
    ? evaluations.find((e) => e.questionId === currentQuestion.id) ?? null
    : null;

  const activeAnswerText = (transcript || answerDraft).trim();

  const handleStartMock = async () => {
    setError(null);
    setLoadingQuestions(true);
    const newId = crypto.randomUUID();
    setSessionId(newId);

    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newId,
          mode: 'mock-interview',
          context: 'interview',
          role,
          difficulty,
        }),
      });

      const res = await fetch('/api/mock-interview/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: newId,
          role,
          difficulty,
          count: questionCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate mock interview questions.');
      }

      setQuestions(data.questions || []);
      setCurrentIndex(0);
      setEvaluations([]);
      setAnswerDraft('');
      resetSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start mock interview.');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleEvaluateAnswer = async () => {
    if (!currentQuestion) return;
    const text = (transcript || answerDraft).trim();
    if (!text) {
      setError('Please speak or type your answer before requesting evaluation.');
      return;
    }

    if (isRecording) stopRecording();
    setEvaluating(true);
    setError(null);

    const { avgEyeContact, avgSmile } = getSessionAverages();
    const computedMetrics = calculateMetricsFromTranscript(
      text,
      Math.max(25, metrics.durationSeconds),
      {
        loudnessDb: metrics.loudnessDb,
        speakingRatio: metrics.speakingRatio || 75,
        eyeContactScore: visionEnabled ? avgEyeContact || reading.eyeContactScore : 0,
        smileScore: visionEnabled ? avgSmile || reading.smileScore : 0,
        visionEnabled,
      }
    );

    try {
      const res = await fetch('/api/mock-interview/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          role,
          difficulty,
          question: currentQuestion,
          answerTranscript: text,
          metrics: computedMetrics,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Answer evaluation failed.');
      }

      setEvaluations((prev) => {
        const filtered = prev.filter((e) => e.questionId !== currentQuestion.id);
        return [...filtered, data.evaluation];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Answer evaluation failed.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleNextQuestion = () => {
    if (currentIndex + 1 < questions.length) {
      if (isRecording) stopRecording();
      resetSession();
      setAnswerDraft('');
      setError(null);
      setCurrentIndex((i) => i + 1);
    }
  };

  const handleCompleteInterview = async () => {
    setCompletingReport(true);
    setError(null);
    if (isRecording) stopRecording();

    const combinedTranscript =
      evaluations.length > 0
        ? evaluations
            .map((e, i) => `Question ${i + 1}: ${e.questionPrompt}\nAnswer: ${e.answerTranscript}`)
            .join('\n\n')
        : activeAnswerText;

    const totalDuration =
      evaluations.length > 0
        ? evaluations.reduce((acc, e) => acc + Math.max(15, e.metrics.durationSeconds), 0)
        : Math.max(20, metrics.durationSeconds);

    const { avgEyeContact, avgSmile } = getSessionAverages();

    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'mock-interview',
          context: `${role} (${difficulty})`,
          transcript: combinedTranscript,
          durationSeconds: totalDuration,
          loudnessDb: metrics.loudnessDb,
          speakingRatio: metrics.speakingRatio || 76,
          eyeContactScore: visionEnabled ? avgEyeContact || reading.eyeContactScore : 0,
          smileScore: visionEnabled ? avgSmile || reading.smileScore : 0,
          visionEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not generate full interview report.');
      }
      stopVision();
      onReportGenerated(data.session, data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed.');
    } finally {
      setCompletingReport(false);
    }
  };

  // Setup Screen
  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-[960px] px-6 py-10 space-y-8">
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-400">Role-Specific Interview Practice</p>
          <h1 className="font-display text-3xl font-bold text-white tracking-tight">
            Mock Interview Studio
          </h1>
          <p className="text-sm text-neutral-300 leading-relaxed max-w-[65ch]">
            Select your target role and difficulty. Gemini generates tailored interview questions
            and evaluates your spoken or written answers against a structured rubric.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-6">
          {/* Role Selection */}
          <div className="space-y-3">
            <label htmlFor="custom-role-input" className="block text-xs font-semibold text-neutral-300">
              Target Role
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ROLES.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRole(preset)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    role === preset
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/[0.1] bg-[#070D0B] text-neutral-300 hover:border-white/25'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              id="custom-role-input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Or enter a custom role (e.g., Cloud Security Engineer)"
              className="w-full rounded-lg border border-white/[0.1] bg-[#070D0B] px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/60"
            />
          </div>

          {/* Difficulty & Question Count */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2.5">
              <span className="block text-xs font-semibold text-neutral-300">Difficulty Level</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'entry', label: 'Entry' },
                    { id: 'mid', label: 'Mid-Level' },
                    { id: 'senior', label: 'Senior' },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      difficulty === d.id
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.1] bg-[#070D0B] text-neutral-300 hover:border-white/25'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5">
              <span className="block text-xs font-semibold text-neutral-300">Questions</span>
              <div className="grid grid-cols-3 gap-2">
                {[3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuestionCount(num)}
                    className={`py-2 px-3 text-xs font-mono font-medium rounded-lg border transition-colors cursor-pointer ${
                      questionCount === num
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.1] bg-[#070D0B] text-neutral-300 hover:border-white/25'
                    }`}
                  >
                    {num} Qs
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between border-t border-white/[0.07]">
            <p className="text-[11px] text-neutral-400">
              Note: Readiness assessments support preparation and are not predictive of hiring decisions.
            </p>
            <button
              type="button"
              disabled={loadingQuestions || !role.trim()}
              onClick={handleStartMock}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-neutral-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {loadingQuestions ? 'Generating Questions...' : 'Start Mock Interview'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-4">
      {/* Header Bar */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-lg font-semibold text-white">Mock Interview</h1>
          <span className="text-xs text-neutral-400">
            {role} · <span className="capitalize">{difficulty}</span>
          </span>
          <span className="font-mono text-xs text-emerald-400 tabular-nums">
            Question {currentIndex + 1} / {questions.length}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleVision}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              visionEnabled
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                : 'border-white/[0.12] bg-[#070D0B] text-neutral-300'
            }`}
          >
            {visionEnabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            Vision: {visionEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (isRecording) stopRecording();
              setQuestions([]);
              setEvaluations([]);
            }}
            className="px-3 py-1.5 text-xs font-medium text-neutral-300 border border-white/[0.1] rounded-lg hover:bg-white/[0.05] cursor-pointer"
          >
            Change Role
          </button>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Stage (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#09100D] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.07] bg-[#0C1512] text-[11px] font-mono text-neutral-300">
              <div className="flex items-center gap-3">
                <span>Live WS: {liveWsState}</span>
                <span>Coach WS: {coachWsState}</span>
                <span>Vision: {visionState}</span>
              </div>
              <span className="tabular-nums">{metrics.durationSeconds}s</span>
            </div>

            <div className="relative h-[300px] bg-[#050907] flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${
                  visionEnabled && visionState === 'active' ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              />
              <canvas
                ref={canvasRef}
                className={`absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none ${
                  visionEnabled && visionState === 'active' ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <div
                className="relative z-10 w-24 h-24 rounded-full border border-emerald-500/45 flex items-center justify-center bg-black/30"
                style={{ transform: `scale(${1 + (isRecording ? audioLevel * 0.002 : 0)})` }}
              >
                <Mic className={`w-6 h-6 ${isRecording ? 'text-emerald-400' : 'text-neutral-500'}`} />
              </div>

              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 to-transparent px-4 py-2.5 grid grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
                <div>
                  <span className="text-neutral-400">Pace: </span>
                  <span className="text-white">{metrics.wpm} WPM</span>
                </div>
                <div>
                  <span className="text-neutral-400">Fillers: </span>
                  <span className="text-white">{metrics.fillerRatePerMin}/min</span>
                </div>
                <div>
                  <span className="text-neutral-400">Eye: </span>
                  <span className="text-emerald-300">
                    {visionEnabled ? `${reading.eyeContactScore}%` : '--'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400">Smile: </span>
                  <span className="text-emerald-300">
                    {visionEnabled ? `${reading.smileScore}%` : '--'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/[0.08] bg-[#0C1512] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => (isRecording ? stopRecording() : startRecording())}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer ${
                  isRecording
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    Stop Answer
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" />
                    Record Voice Answer
                  </>
                )}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={evaluating || !activeAnswerText}
                  onClick={handleEvaluateAnswer}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-white/[0.1] border border-white/[0.15] rounded-lg hover:bg-white/[0.16] disabled:opacity-40 cursor-pointer"
                >
                  {evaluating ? 'Evaluating...' : 'Evaluate Answer'}
                </button>

                {evaluations.length > 0 && (
                  <button
                    type="button"
                    disabled={completingReport}
                    onClick={handleCompleteInterview}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-neutral-950 bg-emerald-400 rounded-lg hover:bg-emerald-300 disabled:opacity-50 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {completingReport ? 'Building Report...' : 'Finish & Full Report'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Written / Editable Answer Box */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor="mock-answer-box" className="text-xs font-semibold text-neutral-300">
                Your Answer (Voice transcript or written response)
              </label>
              <span className="text-[11px] text-neutral-400">
                {nudges[0]?.message}
              </span>
            </div>
            {transcript ? (
              <div className="p-3 rounded-lg border border-white/[0.07] bg-[#070D0B]">
                <TranscriptHighlighter
                  transcript={transcript}
                  interimTranscript={interimTranscript}
                />
              </div>
            ) : (
              <textarea
                id="mock-answer-box"
                rows={4}
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                placeholder="Speak using 'Record Voice Answer' above, or type your structured STAR response here..."
                className="w-full rounded-lg border border-white/[0.1] bg-[#070D0B] p-3 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/60"
              />
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right Question & Rubric Evaluation Rail (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Question Card */}
          {currentQuestion && (
            <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-emerald-400">
                  {currentQuestion.category} · Q{currentQuestion.index}
                </span>
                <div className="flex items-center gap-1">
                  {questions.map((q, idx) => {
                    const done = evaluations.some((e) => e.questionId === q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => {
                          if (isRecording) stopRecording();
                          resetSession();
                          setAnswerDraft('');
                          setCurrentIndex(idx);
                        }}
                        className={`w-6 h-6 rounded text-[11px] font-mono cursor-pointer ${
                          idx === currentIndex
                            ? 'bg-emerald-500 text-neutral-950 font-bold'
                            : done
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-white/[0.06] text-neutral-400'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
              </div>

              <h2 className="font-display text-base font-semibold text-white leading-snug">
                {currentQuestion.prompt}
              </h2>

              <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
                <span className="block text-[11px] font-medium text-neutral-400">
                  Assessment Rubric Focus
                </span>
                <ul className="space-y-1 text-xs text-neutral-300">
                  {currentQuestion.rubricCriteria.map((c, i) => (
                    <li key={i}>· {c}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Evaluation Output */}
          {currentEvaluation ? (
            <div className="rounded-xl border border-emerald-500/30 bg-[#0C1512] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-neutral-400 block">Readiness Signal</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    {currentEvaluation.readinessSignal}
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {currentEvaluation.overallAnswerScore}
                  </span>
                  <span className="text-xs text-neutral-400">/100</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center font-mono">
                {(
                  [
                    ['Relevance', currentEvaluation.rubricScores.relevance],
                    ['Clarity', currentEvaluation.rubricScores.clarity],
                    ['Structure', currentEvaluation.rubricScores.organization],
                    ['Depth', currentEvaluation.rubricScores.depth],
                  ] as const
                ).map(([label, score]) => (
                  <div key={label} className="rounded-lg bg-[#070D0B] border border-white/[0.06] p-2">
                    <span className="block text-[10px] text-neutral-400 font-sans">{label}</span>
                    <span className="text-sm font-semibold text-white tabular-nums">{score}</span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-neutral-200 leading-relaxed">
                {currentEvaluation.conciseFeedback}
              </p>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-emerald-400 block mb-1">Strengths</span>
                  <ul className="space-y-1 text-neutral-300">
                    {currentEvaluation.strengths.map((s, idx) => (
                      <li key={idx} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <span className="font-semibold text-amber-400 block mb-1">Improvements</span>
                  <ul className="space-y-1 text-neutral-300">
                    {currentEvaluation.improvements.map((imp, idx) => (
                      <li key={idx}>· {imp}</li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-white/[0.07]">
                  <span className="font-semibold text-white block mb-1">
                    Suggested STAR Rewrite
                  </span>
                  <p className="text-neutral-300 leading-relaxed">
                    {currentEvaluation.starRewrite}
                  </p>
                </div>
              </div>

              {currentIndex + 1 < questions.length && (
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-semibold text-neutral-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 cursor-pointer"
                >
                  Next Question
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 text-xs text-neutral-400 leading-relaxed">
              Record or type your response, then click <strong className="text-white">Evaluate Answer</strong> to view rubric scores, strengths, improvements, and a STAR rewrite.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
