import React, { useState } from 'react';
import { CheckSquare, Download, Square, ArrowLeft } from 'lucide-react';
import type { SpeakingSession } from '../shared/types.ts';
import { TranscriptHighlighter } from './TranscriptHighlighter.tsx';

interface ReportViewProps {
  sessions: SpeakingSession[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  onStartNew: () => void;
}

export const ReportView: React.FC<ReportViewProps> = ({
  sessions,
  selectedSessionId,
  onSelectSession,
  onStartNew,
}) => {
  const [checkedDays, setCheckedDays] = useState<Record<string, boolean>>({});
  const completed = sessions.filter((s) => Boolean(s.report));

  const activeSession =
    completed.find((s) => s.id === selectedSessionId) ?? completed[0] ?? null;
  const report = activeSession?.report ?? null;

  const toggleDay = (sessionId: string, day: number) => {
    const key = `${sessionId}-${day}`;
    setCheckedDays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownloadMarkdown = () => {
    if (!activeSession || !report) return;
    const lines = [
      `# Echo Coaching Report — ${activeSession.title}`,
      `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
      `Overall Score: ${report.scores.overall}/100 (D=${report.scores.delivery}, C=${report.scores.clarity}, P=${report.scores.presence}, S=${report.scores.structure})`,
      ``,
      `## Executive Summary`,
      report.executiveSummary,
      ``,
      `## Strengths`,
      ...report.strengths.map((s) => `- ${s}`),
      ``,
      `## Areas for Improvement`,
      ...report.areasForImprovement.map((a) => `- ${a}`),
      ``,
      `## STAR Answer Suggestion`,
      report.starAnswerSuggestion.fullRewrite,
      ``,
      `## 7-Day Improvement Plan`,
      ...report.sevenDayPlan.map(
        (d) => `- Day ${d.day} (${d.durationMinutes} min) — ${d.focus}: ${d.exercise}`
      ),
      ``,
      `## Transcript`,
      report.transcript,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echo-report-${activeSession.id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!report || !activeSession) {
    return (
      <div className="mx-auto max-w-[960px] px-6 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-white">Coaching Reports</h1>
        <p className="text-sm text-neutral-400 max-w-md mx-auto">
          No completed session reports yet. Complete a Live Coaching session or Mock Interview to
          view your weighted performance breakdown and 7-day plan.
        </p>
        <button
          type="button"
          onClick={onStartNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-neutral-950 bg-emerald-500 rounded-lg hover:bg-emerald-400 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Go to Live Coach
        </button>
      </div>
    );
  }

  const { scores, metrics } = report;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8 space-y-6">
      {/* Top Bar + Session Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span className="capitalize">{report.mode}</span>
            <span>·</span>
            <span className="capitalize">{report.context}</span>
            <span>·</span>
            <span>{new Date(report.generatedAt).toLocaleString()}</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-white">{activeSession.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {completed.length > 1 && (
            <select
              aria-label="Select session report"
              value={activeSession.id}
              onChange={(e) => onSelectSession(e.target.value)}
              className="rounded-lg border border-white/[0.12] bg-[#0C1512] px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {completed.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.report?.scores.overall}/100)
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white border border-white/[0.14] bg-white/[0.04] rounded-lg hover:bg-white/[0.08] cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Export Markdown
          </button>
        </div>
      </div>

      {/* Overall Score & Component Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-4 rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-medium text-neutral-400">Overall Session Score</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-bold text-emerald-400 tabular-nums">
                {scores.overall}
              </span>
              <span className="font-mono text-sm text-neutral-400">/ 100</span>
            </div>
            <p className="mt-3 text-xs text-neutral-300 leading-relaxed">
              {report.executiveSummary}
            </p>
          </div>
          <div className="pt-3 border-t border-white/[0.07] space-y-1">
            <p className="font-mono text-[11px] text-neutral-400 tabular-nums">
              T = 0.30({scores.delivery}) + 0.25({scores.clarity}) + 0.25({scores.presence}) + 0.20({scores.structure})
            </p>
            <p className="text-[11px] text-neutral-500">
              Directional coaching indicator for practice — not a definitive measure of speaking ability.
            </p>
          </div>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 flex flex-col justify-between space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                label: 'Delivery (D)',
                weight: '30%',
                score: scores.delivery,
                detail: `${metrics.wpm} WPM · ${metrics.speakingRatio}% active speech`,
              },
              {
                label: 'Clarity (C)',
                weight: '25%',
                score: scores.clarity,
                detail: `${metrics.fillerCount} fillers (${metrics.fillerRatePerMin}/min)`,
              },
              {
                label: 'Presence (P)',
                weight: '25%',
                score: scores.presence,
                detail: metrics.visionEnabled
                  ? `P = 0.60(${metrics.eyeContactScore}) + 0.40(${metrics.smileScore})`
                  : 'Vision OFF · Baseline applied',
              },
              {
                label: 'Structure (S)',
                weight: '20%',
                score: scores.structure,
                detail: `${metrics.wordCount} words · Coherence & transitions`,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-white/[0.07] bg-[#070D0B] p-4 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-white">
                    {item.label} <span className="text-neutral-500">({item.weight})</span>
                  </span>
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {item.score}/100
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${item.score}%` }}
                  />
                </div>
                <p className="text-[11px] text-neutral-400 font-mono tabular-nums">{item.detail}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-white/[0.07] font-mono text-xs tabular-nums">
            <div>
              <span className="block text-[10px] font-sans text-neutral-400">Duration</span>
              <span className="text-white font-semibold">{metrics.durationSeconds}s</span>
            </div>
            <div>
              <span className="block text-[10px] font-sans text-neutral-400">Total Words</span>
              <span className="text-white font-semibold">{metrics.wordCount}</span>
            </div>
            <div>
              <span className="block text-[10px] font-sans text-neutral-400">Speaking Rate</span>
              <span className="text-white font-semibold">{metrics.wpm} WPM</span>
            </div>
            <div>
              <span className="block text-[10px] font-sans text-neutral-400">Eye Contact</span>
              <span className="text-white font-semibold">
                {metrics.visionEnabled ? `${metrics.eyeContactScore}%` : 'OFF'}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-sans text-neutral-400">Smile Cues</span>
              <span className="text-white font-semibold">
                {metrics.visionEnabled ? `${metrics.smileScore}%` : 'OFF'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Strengths & Areas for Improvement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-emerald-400">Strengths</h2>
          <ul className="space-y-2 text-sm text-neutral-200">
            {report.strengths.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                · {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-3">
          <h2 className="font-display text-base font-semibold text-amber-400">
            Areas for Improvement
          </h2>
          <ul className="space-y-2 text-sm text-neutral-200">
            {report.areasForImprovement.map((item, idx) => (
              <li key={idx} className="leading-relaxed">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* English Coaching & STAR Suggestion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">English Coaching</h2>
          <div className="space-y-4 divide-y divide-white/[0.06]">
            {report.englishCoaching.map((tip, idx) => (
              <div key={idx} className={idx > 0 ? 'pt-3 space-y-1.5' : 'space-y-1.5'}>
                <p className="text-xs text-neutral-400">
                  Original: <span className="line-through text-neutral-500">{tip.original}</span>
                </p>
                <p className="text-sm text-emerald-300 font-medium">{tip.improved}</p>
                <p className="text-xs text-neutral-400">{tip.reason}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">
            STAR-Format Answer Suggestion
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {(
              [
                ['Situation', report.starAnswerSuggestion.situation],
                ['Task', report.starAnswerSuggestion.task],
                ['Action', report.starAnswerSuggestion.action],
                ['Result', report.starAnswerSuggestion.result],
              ] as const
            ).map(([label, content]) => (
              <div key={label} className="rounded-lg border border-white/[0.07] bg-[#070D0B] p-3">
                <span className="font-semibold text-emerald-400 block mb-1">{label}</span>
                <p className="text-neutral-300 leading-relaxed">{content}</p>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-white/[0.07]">
            <span className="text-xs font-semibold text-neutral-300 block mb-1">
              Structured Rewrite
            </span>
            <p className="text-sm text-neutral-100 leading-relaxed">
              {report.starAnswerSuggestion.fullRewrite}
            </p>
          </div>
        </div>
      </div>

      {/* 7-Day Improvement Plan + Annotated Transcript */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">
            7-Day Personalized Improvement Plan
          </h2>
          <div className="divide-y divide-white/[0.06]">
            {report.sevenDayPlan.map((item) => {
              const checked = Boolean(checkedDays[`${activeSession.id}-${item.day}`]);
              return (
                <button
                  key={item.day}
                  type="button"
                  onClick={() => toggleDay(activeSession.id, item.day)}
                  className="w-full py-3 flex items-start gap-3 text-left hover:bg-white/[0.02] px-2 rounded transition-colors cursor-pointer"
                >
                  {checked ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold ${
                          checked ? 'line-through text-neutral-500' : 'text-white'
                        }`}
                      >
                        Day {item.day} · {item.focus}
                      </span>
                      <span className="font-mono text-[11px] text-neutral-400 tabular-nums">
                        {item.durationMinutes} min
                      </span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">{item.exercise}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-white">
              Annotated Transcript
            </h2>
            <span className="text-xs text-amber-300 font-mono tabular-nums">
              {metrics.fillerCount} fillers highlighted
            </span>
          </div>
          <div className="max-h-[380px] overflow-y-auto echo-scroll pr-1">
            <TranscriptHighlighter transcript={report.transcript} />
          </div>
        </div>
      </div>
    </div>
  );
};
