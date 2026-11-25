import { GoogleGenAI, Type, type GenerateContentParameters } from '@google/genai';
import type {
  CoachingReport,
  ComponentScores,
  InterviewDifficulty,
  LiveMetrics,
  MockAnswerEvaluation,
  MockInterviewQuestion,
  PracticeContext,
} from '../shared/types.ts';

const TEXT_MODEL_PRIMARY = 'gemini-4-hydrogen';
const TEXT_MODEL_FALLBACK = 'gemini-3.1-flash-lite';
export const LIVE_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe-live';
export const AUDIO_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe';

function requireApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please set it in Settings > Secrets.'
    );
  }
  return apiKey;
}

export function getAiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: requireApiKey(),
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getLiveAiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: requireApiKey(),
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      return new Error(parsed.error.message);
    }
  } catch {
    // Not JSON
  }
  return err instanceof Error ? err : new Error(raw);
}

async function generateWithFallback(
  ai: GoogleGenAI,
  models: string[],
  buildParams: (model: string) => GenerateContentParameters
) {
  let lastErr: unknown;
  const attempts = [
    models[0],
    models[1] ?? models[0],
    models[0],
    models[1] ?? models[0],
  ];

  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    try {
      return await ai.models.generateContent(buildParams(model));
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('404') ||
        msg.includes('NOT_FOUND');
      if (!isRetryable || i === attempts.length - 1) {
        throw formatGeminiError(err);
      }
      const delayMs = 450 * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw formatGeminiError(lastErr);
}

function parseJsonResponse<T>(rawText: string | undefined, fallbackMsg: string): T {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    throw new Error(fallbackMsg);
  }
  return JSON.parse(trimmed) as T;
}

export async function generateCoachingReport(params: {
  sessionId: string;
  mode: 'live' | 'mock-interview';
  context: PracticeContext | string;
  transcript: string;
  metrics: LiveMetrics;
  scores: ComponentScores;
}): Promise<CoachingReport> {
  const ai = getAiClient();

  const prompt = [
    `Analyze this speaking practice session for Echo: AI-Powered Real-Time Speaking Coach.`,
    `Practice Context: ${params.context} (${params.mode})`,
    `Duration: ${params.metrics.durationSeconds}s`,
    `Word Count: ${params.metrics.wordCount}`,
    `Speaking Pace: ${params.metrics.wpm} WPM (reference target ~160 WPM)`,
    `Filler Words: ${params.metrics.fillerCount} total (${params.metrics.fillerRatePerMin}/min), breakdown: ${JSON.stringify(params.metrics.detectedFillers)}`,
    `Audio Loudness: ${params.metrics.loudnessDb} dBFS, Active Speaking Ratio: ${params.metrics.speakingRatio}%`,
    `Visual Cues (MediaPipe Browser): ${
      params.metrics.visionEnabled
        ? `Eye Contact ${params.metrics.eyeContactScore}%, Smile ${params.metrics.smileScore}%`
        : 'Camera/Vision was turned off during this session'
    }`,
    `Computed Component Scores (0-100): Delivery=${params.scores.delivery}, Clarity=${params.scores.clarity}, Presence=${params.scores.presence}, Structure=${params.scores.structure}, Overall=${params.scores.overall}`,
    ``,
    `Transcript:`,
    `"""`,
    params.transcript.trim() || '(No spoken words captured)',
    `"""`,
    ``,
    `Provide constructive, grounded, specific coaching feedback strictly referencing the actual transcript and metrics above. Remember these scores are practice indicators, not definitive measures of human ability.`,
  ].join('\n');

  const response = await generateWithFallback(
    ai,
    [TEXT_MODEL_PRIMARY, TEXT_MODEL_FALLBACK],
    (model) => ({
      model,
      contents: prompt,
      config: {
        systemInstruction:
          'You are Echo, a supportive, precise communication and interview coach. Return structured JSON coaching feedback tailored to the user transcript and delivery metrics. Include actionable English coaching, a concrete STAR-format answer rewrite, and a realistic 7-day improvement plan.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: '2-3 sentence summary of the session performance and key takeaway.',
            },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 4 concrete strengths observed in the transcript and delivery metrics.',
            },
            areasForImprovement: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3 to 4 specific areas for improvement based on the session.',
            },
            englishCoaching: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  improved: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['original', 'improved', 'reason'],
              },
              description: '2 to 3 phrasing, grammar, or clarity upgrades from the transcript.',
            },
            starAnswerSuggestion: {
              type: Type.OBJECT,
              properties: {
                situation: { type: Type.STRING },
                task: { type: Type.STRING },
                action: { type: Type.STRING },
                result: { type: Type.STRING },
                fullRewrite: { type: Type.STRING },
              },
              required: ['situation', 'task', 'action', 'result', 'fullRewrite'],
              description: 'A structured STAR-format suggestion demonstrating how to organize the speaker response clearly.',
            },
            sevenDayPlan: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.INTEGER },
                  focus: { type: Type.STRING },
                  exercise: { type: Type.STRING },
                  durationMinutes: { type: Type.INTEGER },
                },
                required: ['day', 'focus', 'exercise', 'durationMinutes'],
              },
              description: 'Exactly 7 daily practice exercises targeting the speaker weaknesses.',
            },
          },
          required: [
            'executiveSummary',
            'strengths',
            'areasForImprovement',
            'englishCoaching',
            'starAnswerSuggestion',
            'sevenDayPlan',
          ],
        },
      },
    })
  );

  const parsed = parseJsonResponse<{
    executiveSummary: string;
    strengths: string[];
    areasForImprovement: string[];
    englishCoaching: Array<{ original: string; improved: string; reason: string }>;
    starAnswerSuggestion: {
      situation: string;
      task: string;
      action: string;
      result: string;
      fullRewrite: string;
    };
    sevenDayPlan: Array<{
      day: number;
      focus: string;
      exercise: string;
      durationMinutes: number;
    }>;
  }>(response.text, 'Gemini returned an empty coaching report.');

  return {
    sessionId: params.sessionId,
    generatedAt: new Date().toISOString(),
    mode: params.mode,
    context: params.context,
    scores: params.scores,
    metrics: params.metrics,
    transcript: params.transcript,
    ...parsed,
  };
}

export async function generateMockInterviewQuestions(params: {
  role: string;
  difficulty: InterviewDifficulty;
  count: number;
}): Promise<MockInterviewQuestion[]> {
  const ai = getAiClient();
  const clampedCount = Math.max(1, Math.min(6, params.count));

  const difficultyLabel =
    params.difficulty === 'entry'
      ? 'Entry-Level / Campus Placement'
      : params.difficulty === 'mid'
        ? 'Mid-Level (2-5 years experience)'
        : 'Senior / Staff Level';

  const response = await generateWithFallback(
    ai,
    [TEXT_MODEL_PRIMARY, TEXT_MODEL_FALLBACK],
    (model) => ({
      model,
      contents: `Generate ${clampedCount} realistic, role-specific mock interview questions for the role "${params.role}" at "${difficultyLabel}" difficulty. Include a mix of Behavioral (STAR-suitable), Technical/Role-Specific, and Problem-Solving questions.`,
      config: {
        systemInstruction:
          'You are an experienced technical and behavioral interviewer creating structured mock interview questions and clear evaluation rubrics.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description: 'e.g. Behavioral, Technical, System Design, Problem Solving',
              },
              prompt: {
                type: Type.STRING,
                description: 'The exact interview question to ask the candidate.',
              },
              rubricCriteria: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 concise rubric criteria used to evaluate the answer.',
              },
              targetKeyPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 key elements a strong answer should cover.',
              },
            },
            required: ['category', 'prompt', 'rubricCriteria', 'targetKeyPoints'],
          },
        },
      },
    })
  );

  const items = parseJsonResponse<
    Array<{
      category: string;
      prompt: string;
      rubricCriteria: string[];
      targetKeyPoints: string[];
    }>
  >(response.text, 'Failed to generate mock interview questions.');

  return items.slice(0, clampedCount).map((item, idx) => ({
    id: `q-${Date.now()}-${idx + 1}`,
    index: idx + 1,
    category: item.category,
    prompt: item.prompt,
    rubricCriteria: item.rubricCriteria,
    targetKeyPoints: item.targetKeyPoints,
  }));
}

export async function evaluateMockInterviewAnswer(params: {
  role: string;
  difficulty: InterviewDifficulty;
  question: MockInterviewQuestion;
  answerTranscript: string;
  metrics: LiveMetrics;
}): Promise<MockAnswerEvaluation> {
  const ai = getAiClient();

  const prompt = [
    `Evaluate this mock interview answer against the rubric.`,
    `Role: ${params.role} (${params.difficulty})`,
    `Question Category: ${params.question.category}`,
    `Question: ${params.question.prompt}`,
    `Rubric Criteria: ${params.question.rubricCriteria.join('; ')}`,
    `Target Key Points: ${params.question.targetKeyPoints.join('; ')}`,
    `Delivery Metrics: ${params.metrics.wpm} WPM, ${params.metrics.fillerCount} fillers (${params.metrics.fillerRatePerMin}/min), Duration ${params.metrics.durationSeconds}s`,
    ``,
    `Candidate Answer Transcript:`,
    `"""`,
    params.answerTranscript.trim() || '(No answer provided)',
    `"""`,
  ].join('\n');

  const response = await generateWithFallback(
    ai,
    [TEXT_MODEL_PRIMARY, TEXT_MODEL_FALLBACK],
    (model) => ({
      model,
      contents: prompt,
      config: {
        systemInstruction:
          'You are an objective interview coach evaluating a mock interview answer against a predefined rubric. Score each criterion from 0-100, provide a readiness signal strictly for practice guidance (not a hiring guarantee), highlight strengths and specific improvements, and provide a concise STAR-structured rewrite.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rubricScores: {
              type: Type.OBJECT,
              properties: {
                relevance: { type: Type.INTEGER },
                clarity: { type: Type.INTEGER },
                organization: { type: Type.INTEGER },
                depth: { type: Type.INTEGER },
              },
              required: ['relevance', 'clarity', 'organization', 'depth'],
            },
            overallAnswerScore: { type: Type.INTEGER },
            readinessSignal: {
              type: Type.STRING,
              description: 'One of: Early Practice, Developing, Interview Ready, Strong Signal',
            },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            improvements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            starRewrite: {
              type: Type.STRING,
              description: 'Model answer rewrite organized clearly with STAR or structured steps.',
            },
            conciseFeedback: {
              type: Type.STRING,
              description: '2 sentence actionable summary feedback.',
            },
          },
          required: [
            'rubricScores',
            'overallAnswerScore',
            'readinessSignal',
            'strengths',
            'improvements',
            'starRewrite',
            'conciseFeedback',
          ],
        },
      },
    })
  );

  const parsed = parseJsonResponse<{
    rubricScores: {
      relevance: number;
      clarity: number;
      organization: number;
      depth: number;
    };
    overallAnswerScore: number;
    readinessSignal: string;
    strengths: string[];
    improvements: string[];
    starRewrite: string;
    conciseFeedback: string;
  }>(response.text, 'Failed to evaluate mock interview answer.');

  return {
    questionId: params.question.id,
    questionPrompt: params.question.prompt,
    answerTranscript: params.answerTranscript,
    metrics: params.metrics,
    ...parsed,
  };
}

export async function transcribeAudioClip(
  base64Data: string,
  mimeType: string
): Promise<string> {
  const ai = getAiClient();
  const response = await generateWithFallback(
    ai,
    [AUDIO_TRANSCRIBE_MODEL, TEXT_MODEL_FALLBACK],
    (model) => ({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: 'Transcribe the spoken speech accurately in plain text, preserving natural filler words like um and uh if spoken.',
          },
        ],
      },
    })
  );

  return (response.text ?? '').trim();
}
