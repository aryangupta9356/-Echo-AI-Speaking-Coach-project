import React from 'react';

interface TranscriptHighlighterProps {
  transcript: string;
  interimTranscript?: string;
  emptyPlaceholder?: string;
}

const FILLER_SPLIT_REGEX =
  /(\b(?:um+|uh+|er+|ah+|you know|i mean|sort of|kind of|basically|actually|literally|like)\b)/gi;

const FILLER_EXACT_REGEX =
  /^(?:um+|uh+|er+|ah+|you know|i mean|sort of|kind of|basically|actually|literally|like)$/i;

export const TranscriptHighlighter: React.FC<TranscriptHighlighterProps> = ({
  transcript,
  interimTranscript = '',
  emptyPlaceholder = 'Waiting for speech...',
}) => {
  const hasContent = Boolean(transcript.trim() || interimTranscript.trim());

  if (!hasContent) {
    return <p className="text-sm text-neutral-500 leading-relaxed">{emptyPlaceholder}</p>;
  }

  const parts = transcript ? transcript.split(FILLER_SPLIT_REGEX) : [];

  return (
    <p className="text-sm leading-relaxed text-neutral-200">
      {parts.map((part, idx) => {
        if (!part) return null;
        if (FILLER_EXACT_REGEX.test(part)) {
          return (
            <mark
              key={idx}
              className="mx-0.5 rounded bg-amber-500/20 px-1 py-0.5 text-amber-300 font-medium"
              title="Detected filler word"
            >
              {part}
            </mark>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
      {interimTranscript && (
        <span className="ml-1 text-neutral-400 italic">{interimTranscript}</span>
      )}
    </p>
  );
};
