import type { ComponentScores, LiveMetrics } from './types.ts';

export const FILLER_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'um', regex: /\bum+\b/gi },
  { label: 'uh', regex: /\buh+\b/gi },
  { label: 'er', regex: /\ber+\b/gi },
  { label: 'ah', regex: /\bah+\b/gi },
  { label: 'you know', regex: /\byou know\b/gi },
  { label: 'i mean', regex: /\bi mean\b/gi },
  { label: 'sort of', regex: /\bsort of\b/gi },
  { label: 'kind of', regex: /\bkind of\b/gi },
  { label: 'basically', regex: /\bbasically\b/gi },
  { label: 'actually', regex: /\bactually\b/gi },
  { label: 'literally', regex: /\bliterally\b/gi },
  { label: 'like', regex: /\blike\b/gi },
];

export const TRANSITION_MARKERS = [
  'first',
  'firstly',
  'second',
  'secondly',
  'third',
  'then',
  'next',
  'however',
  'therefore',
  'because',
  'as a result',
  'consequently',
  'specifically',
  'for example',
  'for instance',
  'finally',
  'in summary',
  'to summarize',
  'overall',
  'ultimately',
];

export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function detectFillers(text: string): {
  total: number;
  byWord: Record<string, number>;
} {
  const byWord: Record<string, number> = {};
  let total = 0;

  for (const pattern of FILLER_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      byWord[pattern.label] = matches.length;
      total += matches.length;
    }
  }

  return { total, byWord };
}

export function calculateMetricsFromTranscript(
  transcript: string,
  durationSeconds: number,
  partial: Partial<Pick<LiveMetrics, 'loudnessDb' | 'speakingRatio' | 'eyeContactScore' | 'smileScore' | 'visionEnabled'>> = {}
): LiveMetrics {
  const wordCount = countWords(transcript);
  const effectiveMinutes = Math.max(durationSeconds / 60, 1 / 12); // minimum 5s window to stabilize WPM
  const wpm = durationSeconds >= 2 && wordCount > 0 ? Math.round(wordCount / effectiveMinutes) : 0;

  const { total: fillerCount, byWord: detectedFillers } = detectFillers(transcript);
  const fillerRatePerMin =
    durationSeconds >= 2 && fillerCount > 0
      ? Number((fillerCount / effectiveMinutes).toFixed(1))
      : 0;

  return {
    durationSeconds: Math.max(0, Math.round(durationSeconds)),
    wordCount,
    wpm,
    fillerCount,
    fillerRatePerMin,
    detectedFillers,
    loudnessDb: partial.loudnessDb ?? -48,
    speakingRatio: partial.speakingRatio ?? 0,
    eyeContactScore: partial.eyeContactScore ?? 0,
    smileScore: partial.smileScore ?? 0,
    visionEnabled: partial.visionEnabled ?? false,
  };
}

/**
 * Computes Echo's documented component and overall scores:
 * - Delivery (D): speaking pace relative to ~160 WPM reference target + speaking/pause balance
 * - Clarity (C): filler-word rate per minute
 * - Presence (P): 0.60E + 0.40M (eye-contact E and smile M)
 * - Structure (S): transcript length, sentence coherence, transitions, examples, opening
 * - Overall (T): 0.30D + 0.25C + 0.25P + 0.20S
 */
export function calculatePerformanceScores(
  transcript: string,
  metrics: LiveMetrics
): ComponentScores {
  const words = countWords(transcript);

  // 1. Delivery Score (D) - 160 WPM reference target (Section 4.6.3)
  let delivery = 55;
  if (words === 0) {
    delivery = 0;
  } else {
    const wpmDiff = Math.abs(metrics.wpm - 160);
    // Within +-20 WPM (140-180) scores 88-100; drops smoothly further away
    const paceComponent =
      wpmDiff <= 15
        ? 100 - wpmDiff * 0.5
        : Math.max(35, 92 - (wpmDiff - 15) * 0.85);

    // Speaking engagement / pause balance (optimal 50% - 88% active speaking)
    let pauseBalance = 82;
    if (metrics.speakingRatio > 0) {
      if (metrics.speakingRatio >= 50 && metrics.speakingRatio <= 88) {
        pauseBalance = 94;
      } else if (metrics.speakingRatio < 50) {
        pauseBalance = Math.max(45, 94 - (50 - metrics.speakingRatio) * 1.1);
      } else {
        pauseBalance = Math.max(60, 94 - (metrics.speakingRatio - 88) * 1.5);
      }
    }
    delivery = Math.round(0.75 * paceComponent + 0.25 * pauseBalance);
  }

  // 2. Clarity Score (C) - Filler-word rate (Section 4.6.4)
  let clarity = 0;
  if (words > 0) {
    const rate = metrics.fillerRatePerMin;
    if (rate <= 1.0) {
      clarity = 96;
    } else if (rate <= 3.0) {
      clarity = Math.round(96 - (rate - 1.0) * 6);
    } else {
      clarity = Math.max(25, Math.round(84 - (rate - 3.0) * 8));
    }
  }

  // 3. Presence Score (P) - Documented formula P = 0.60E + 0.40M (Section 3.5 & 4.6.5)
  const effectiveEye = metrics.visionEnabled ? metrics.eyeContactScore : 72;
  const effectiveSmile = metrics.visionEnabled ? metrics.smileScore : 65;
  const presence = Math.round(0.6 * effectiveEye + 0.4 * effectiveSmile);

  // 4. Structure Score (S) - length, coherence, transitions, examples, clear opening (Section 4.6.6)
  let structure = 0;
  if (words > 0) {
    const lower = transcript.toLowerCase();
    const sentences = transcript
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const sentenceCount = Math.max(1, sentences.length);
    const avgSentenceLen = words / sentenceCount;

    // Depth score from word count (optimal practice answer ~60-220 words)
    const lengthScore =
      words >= 75
        ? 92
        : words >= 40
        ? 78
        : words >= 20
        ? 64
        : 45;

    // Sentence coherence (avoiding run-on walls or choppy fragments)
    const coherenceScore =
      avgSentenceLen >= 8 && avgSentenceLen <= 24
        ? 90
        : avgSentenceLen < 8
        ? 70
        : 72;

    // Transition markers
    const transitionHits = TRANSITION_MARKERS.filter((m) => lower.includes(m)).length;
    const transitionScore = Math.min(100, 55 + transitionHits * 15);

    // Concrete examples or numbers/outcomes
    const hasNumbers = /\d+%?/.test(transcript);
    const hasActionVerb = /\b(built|created|led|designed|developed|improved|solved|implemented|managed|achieved|reduced|increased)\b/i.test(
      transcript
    );
    const exampleScore = 55 + (hasNumbers ? 20 : 0) + (hasActionVerb ? 22 : 0);

    // Clear opening (starts cleanly without filler word)
    const firstWord = lower.trim().split(/\s+/)[0] ?? '';
    const startsWithFiller = ['um', 'uh', 'so', 'like', 'well', 'er'].includes(
      firstWord.replace(/[^a-z]/g, '')
    );
    const openingScore = startsWithFiller ? 65 : 90;

    structure = Math.round(
      0.25 * lengthScore +
        0.2 * coherenceScore +
        0.2 * transitionScore +
        0.2 * exampleScore +
        0.15 * openingScore
    );
  }

  // Overall Score Formula: T = 0.30D + 0.25C + 0.25P + 0.20S (Section 3.5 & 4.6.7)
  const overall = Math.round(
    0.3 * delivery + 0.25 * clarity + 0.25 * presence + 0.2 * structure
  );

  return {
    delivery: clampScore(delivery),
    clarity: clampScore(clarity),
    presence: clampScore(presence),
    structure: clampScore(structure),
    overall: clampScore(overall),
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createInitialMetrics(): LiveMetrics {
  return {
    durationSeconds: 0,
    wordCount: 0,
    wpm: 0,
    fillerCount: 0,
    fillerRatePerMin: 0,
    detectedFillers: {},
    loudnessDb: -48,
    speakingRatio: 0,
    eyeContactScore: 0,
    smileScore: 0,
    visionEnabled: false,
  };
}
