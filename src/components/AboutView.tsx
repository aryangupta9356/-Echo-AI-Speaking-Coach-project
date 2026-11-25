import React from 'react';

export const AboutView: React.FC = () => {
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-10 space-y-10">
      <div className="space-y-3 border-b border-white/[0.08] pb-8">
        <p className="text-xs font-medium text-emerald-400">System Architecture & Methodology</p>
        <h1 className="font-display text-3xl font-bold text-white tracking-tight">
          How Echo Works
        </h1>
        <p className="text-sm text-neutral-300 leading-relaxed max-w-[70ch]">
          Echo integrates real-time audio streaming, browser-based MediaPipe facial landmark
          analysis, deterministic speaking-metric heuristics, and Gemini coaching generation into a
          unified speaking-practice studio.
        </p>
      </div>

      {/* Pipeline Overview */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-2">
          <p className="font-mono text-xs text-emerald-400">01 · Audio & WebSockets</p>
          <h2 className="font-display text-base font-semibold text-white">
            /ws/live & /ws/coaching
          </h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Microphone audio is sampled at 16 kHz PCM and streamed over WebSocket to the backend,
            returning interim and finalized transcript events alongside live coaching nudges.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-2">
          <p className="font-mono text-xs text-emerald-400">02 · Browser Vision</p>
          <h2 className="font-display text-base font-semibold text-white">
            MediaPipe FaceLandmarker
          </h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Camera frames are processed strictly inside your browser using MediaPipe Tasks Vision to
            estimate eye contact and smiling cues. Video frames are never uploaded to the server.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-2">
          <p className="font-mono text-xs text-emerald-400">03 · Generative AI</p>
          <h2 className="font-display text-base font-semibold text-white">
            Gemini Coaching & Rubrics
          </h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            At session completion, transcript and delivery telemetry are analyzed server-side to
            generate strengths, English coaching, STAR rewrites, and a 7-day practice plan.
          </p>
        </div>
      </section>

      {/* Scoring Formulas */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-5">
        <h2 className="font-display text-lg font-semibold text-white">
          Documented Scoring Formulas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">Overall Session Score</p>
            <p className="font-mono text-base text-emerald-400 tabular-nums">
              T = 0.30D + 0.25C + 0.25P + 0.20S
            </p>
            <ul className="space-y-1 text-xs text-neutral-300">
              <li>D (30%): Delivery — speaking pace (~160 WPM target) & pause balance</li>
              <li>C (25%): Clarity — filler-word frequency per minute</li>
              <li>P (25%): Presence — visual engagement score</li>
              <li>S (20%): Structure — length, sentence coherence, transitions & examples</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-400">Presence & Rate Formulas</p>
            <p className="font-mono text-base text-emerald-400 tabular-nums">
              P = 0.60E + 0.40M
            </p>
            <ul className="space-y-1 text-xs text-neutral-300">
              <li>E: Estimated Eye-Contact Score (0–100) from MediaPipe gaze & head orientation</li>
              <li>M: Estimated Smile Score (0–100) from MediaPipe facial blendshapes</li>
              <li className="font-mono text-neutral-400 pt-1">
                WPM = Total Words / Speaking Time (min)
              </li>
              <li className="font-mono text-neutral-400">
                Filler Rate = Detected Fillers / Speaking Time (min)
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Responsible Interpretation */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0C1512] p-6 space-y-2">
        <h2 className="font-display text-base font-semibold text-white">
          Responsible Practice Disclaimer
        </h2>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Echo provides directional coaching indicators to help you build awareness of speaking pace,
          filler habits, answer organization, and visual engagement. Automated scores, visual cues,
          and mock interview readiness signals are intended for self-directed practice rather than
          definitive psychological measurements or guarantees of hiring outcomes. Session records are
          stored in memory on the running server.
        </p>
      </section>
    </div>
  );
};
