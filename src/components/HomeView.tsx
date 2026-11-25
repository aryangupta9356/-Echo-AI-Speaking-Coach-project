import React, { useState } from 'react';
import { ArrowRight, Mic, MessageSquare, FileText } from 'lucide-react';
import type { PracticeContext, SpeakingSession } from '../shared/types.ts';
import type { AppView } from './Navbar.tsx';

interface HomeViewProps {
  sessions: SpeakingSession[];
  onStartLiveCoach: (context: PracticeContext) => void;
  onNavigate: (view: AppView) => void;
  onSelectReport: (sessionId: string) => void;
}

const CONTEXT_OPTIONS: Array<{ id: PracticeContext; label: string; desc: string }> = [
  { id: 'interview', label: 'Interview', desc: 'Behavioral & placement answers' },
  { id: 'presentation', label: 'Presentation', desc: 'Project demos & seminars' },
  { id: 'standup', label: 'Stand-up', desc: 'Concise daily status updates' },
  { id: 'freeform', label: 'Freeform', desc: 'Open speaking fluency' },
];

export const HomeView: React.FC<HomeViewProps> = ({
  sessions,
  onStartLiveCoach,
  onNavigate,
  onSelectReport,
}) => {
  const [selectedContext, setSelectedContext] = useState<PracticeContext>('interview');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const completedSessions = sessions.filter((s) => Boolean(s.report));

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-10 space-y-12">
      {/* Hero 2-Column Balanced Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-white/[0.08] bg-[#0C1512] p-8 space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-medium text-emerald-400 tracking-wide">
              Echo · Coaching for Confident Speaking
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-white leading-[1.15] [text-wrap:balance] max-w-2xl">
              Real-time speech analysis, visual presence cues, and structured coaching.
            </h1>
            <p className="text-[15px] text-neutral-300 leading-relaxed max-w-[65ch]">
              Practise placement interviews, presentations, and stand-up updates in one integrated
              studio. Echo pairs live speech transcription and pacing metrics with browser-local
              MediaPipe eye-contact tracking and Gemini coaching reports.
            </p>
          </div>

          {/* Interactive Practice Context Selector + Primary Actions */}
          <div className="space-y-5 pt-2 border-t border-white/[0.07]">
            <div className="space-y-2.5">
              <span className="block text-xs font-medium text-neutral-400">
                Select live coaching context
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CONTEXT_OPTIONS.map((ctx) => {
                  const active = selectedContext === ctx.id;
                  return (
                    <button
                      key={ctx.id}
                      type="button"
                      onClick={() => setSelectedContext(ctx.id)}
                      className={`text-left rounded-lg border px-3.5 py-2.5 transition-colors cursor-pointer ${
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                          : 'border-white/[0.08] bg-white/[0.02] text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-semibold whitespace-nowrap">{ctx.label}</div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 line-clamp-1">
                        {ctx.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onStartLiveCoach(selectedContext)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-neutral-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                Start Live Coaching
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => onNavigate('mock-interview')}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white border border-white/[0.14] bg-white/[0.03] rounded-lg hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                Mock Interview Studio
              </button>
            </div>
          </div>
        </div>

        {/* Hero Visual Panel */}
        <div className="lg:col-span-5 relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0C1512] min-h-[280px]">
          {!heroImgFailed ? (
            <img
              src="/src/assets/images/echo_studio_hero_1795501133601.jpg"
              alt="Speaker practising a presentation at a modern studio desk with microphone"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-[#0E1E17] to-[#070D0B] text-center">
              <Mic className="w-10 h-10 text-emerald-400 mb-3" />
              <p className="text-sm font-medium text-neutral-200">Echo Speaking Studio</p>
              <p className="text-xs text-neutral-400 mt-1">
                Live speech transcription · Local visual analysis
              </p>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6">
            <p className="text-xs font-medium text-emerald-300">
              Browser-Private Computer Vision
            </p>
            <p className="text-sm text-neutral-100 mt-1 leading-snug">
              Facial landmarks for eye contact and smile are processed locally via MediaPipe — video
              frames never leave your device.
            </p>
          </div>
        </div>
      </section>

      {/* Full-Width 4-Column Scoring Architecture Strip */}
      <section aria-label="Performance Scoring Model" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-white">
            Four-Pillar Session Scoring
          </h2>
          <p className="font-mono text-xs text-neutral-400 tabular-nums">
            T = 0.30D + 0.25C + 0.25P + 0.20S
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>01. Delivery (D)</span>
              <span className="font-mono text-emerald-400 tabular-nums">30% weight</span>
            </div>
            <h3 className="font-display text-base font-semibold text-white">
              Speaking Pace & Pauses
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Tracks Words Per Minute against a ~160 WPM reference target and measures active
              speaking vs. pause ratio.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>02. Clarity (C)</span>
              <span className="font-mono text-emerald-400 tabular-nums">25% weight</span>
            </div>
            <h3 className="font-display text-base font-semibold text-white">
              Filler-Word Rate
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Detects hesitation markers such as "um", "uh", "like", and "you know" per minute in
              real time.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>03. Presence (P)</span>
              <span className="font-mono text-emerald-400 tabular-nums">25% weight</span>
            </div>
            <h3 className="font-display text-base font-semibold text-white">
              Eye Contact & Smile
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Combines MediaPipe visual estimates using P = 0.60E + 0.40M directly inside your
              browser.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>04. Structure (S)</span>
              <span className="font-mono text-emerald-400 tabular-nums">20% weight</span>
            </div>
            <h3 className="font-display text-base font-semibold text-white">
              Coherence & STAR Flow
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Evaluates sentence length, transitions, concrete examples, opening clarity, and STAR
              alignment.
            </p>
          </div>
        </div>
      </section>

      {/* Recent Sessions & Reports */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-white">
            Recent Coaching Reports
          </h2>
          {completedSessions.length > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
            >
              View all reports
            </button>
          )}
        </div>

        {completedSessions.length === 0 ? (
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">No practice reports generated yet</p>
              <p className="text-xs text-neutral-400">
                Complete a Live Coaching session or Mock Interview to receive AI-generated
                strengths, English upgrades, STAR rewrites, and a 7-day plan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onStartLiveCoach('interview')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white border border-white/[0.15] rounded-lg hover:bg-white/[0.06] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              Start First Session
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/[0.07] text-[11px] font-medium text-neutral-400">
                    <th className="py-3 px-4">Session</th>
                    <th className="py-3 px-4">Mode / Context</th>
                    <th className="py-3 px-4 text-right">Pace</th>
                    <th className="py-3 px-4 text-right">Fillers/min</th>
                    <th className="py-3 px-4 text-right">Overall</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-sm">
                  {completedSessions.slice(0, 5).map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4 font-medium text-white">
                        {s.title}
                        <span className="block text-[11px] font-normal text-neutral-500">
                          {new Date(s.createdAt).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-neutral-300 capitalize">
                        {s.mode} · {s.context}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-neutral-200 tabular-nums">
                        {s.metrics.wpm} WPM
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-neutral-200 tabular-nums">
                        {s.metrics.fillerRatePerMin}/min
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                        {s.report?.scores.overall ?? 0}/100
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectReport(s.id)}
                          className="text-xs font-medium text-emerald-400 hover:text-emerald-300 cursor-pointer"
                        >
                          Open Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
