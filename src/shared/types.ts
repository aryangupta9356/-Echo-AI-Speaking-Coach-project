export type PracticeContext = 'interview' | 'presentation' | 'standup' | 'freeform';

export type SessionMode = 'live' | 'mock-interview';

export type InterviewDifficulty = 'entry' | 'mid' | 'senior';

export interface LiveMetrics {
  durationSeconds: number;
  wordCount: number;
  wpm: number;
  fillerCount: number;
  fillerRatePerMin: number;
  detectedFillers: Record<string, number>;
  loudnessDb: number;
  speakingRatio: number; // 0 to 100
  eyeContactScore: number; // 0 to 100 (E)
  smileScore: number; // 0 to 100 (M)
  visionEnabled: boolean;
}

export interface ComponentScores {
  delivery: number; // D (0-100)
  clarity: number; // C (0-100)
  presence: number; // P = 0.60E + 0.40M (0-100)
  structure: number; // S (0-100)
  overall: number; // T = 0.30D + 0.25C + 0.25P + 0.20S (0-100)
}

export interface CoachingNudge {
  id: string;
  timestamp: string;
  severity: 'positive' | 'caution' | 'info';
  message: string;
}

export interface EnglishCoachingTip {
  original: string;
  improved: string;
  reason: string;
}

export interface StarSuggestion {
  situation: string;
  task: string;
  action: string;
  result: string;
  fullRewrite: string;
}

export interface SevenDayPlanItem {
  day: number;
  focus: string;
  exercise: string;
  durationMinutes: number;
}

export interface CoachingReport {
  sessionId: string;
  generatedAt: string;
  mode: SessionMode;
  context: PracticeContext | string;
  scores: ComponentScores;
  metrics: LiveMetrics;
  transcript: string;
  executiveSummary: string;
  strengths: string[];
  areasForImprovement: string[];
  englishCoaching: EnglishCoachingTip[];
  starAnswerSuggestion: StarSuggestion;
  sevenDayPlan: SevenDayPlanItem[];
}

export interface MockInterviewQuestion {
  id: string;
  index: number;
  category: string;
  prompt: string;
  rubricCriteria: string[];
  targetKeyPoints: string[];
}

export interface MockAnswerEvaluation {
  questionId: string;
  questionPrompt: string;
  answerTranscript: string;
  metrics: LiveMetrics;
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
}

export interface SpeakingSession {
  id: string;
  mode: SessionMode;
  context: PracticeContext;
  title: string;
  createdAt: string;
  completedAt?: string;
  status: 'created' | 'active' | 'completed';
  transcript: string;
  interimTranscript: string;
  metrics: LiveMetrics;
  nudges: CoachingNudge[];
  report?: CoachingReport;
  mockInterview?: {
    role: string;
    difficulty: InterviewDifficulty;
    questions: MockInterviewQuestion[];
    evaluations: MockAnswerEvaluation[];
  };
}
