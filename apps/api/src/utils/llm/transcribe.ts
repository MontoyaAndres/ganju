import { GoogleGenAI } from '@google/genai';
import OpenAI, { toFile } from 'openai';
import { utils } from '@ganju/utils';

export interface Transcription {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  // Audio length, when the provider reports it.
  seconds?: number;
}

// Which key a voice note is transcribed with, and who pays for it.
export interface Transcriber {
  provider: 'google' | 'openai';
  apiKey: string;
  baseUrl?: string | null;
  paidBy: 'organization' | 'platform';
}

// The OpenAI transcription model: cheaper than whisper-1 and better on short,
// noisy speech.
const OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

// The file name OpenAI reads the format from.
const extensionFor = (mimeType: string): string => {
  const type = mimeType.split(';')[0].trim().toLowerCase();
  if (type.includes('ogg') || type.includes('opus')) return 'ogg';
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) {
    return 'm4a';
  }
  if (type.includes('webm')) return 'webm';
  if (type.includes('wav')) return 'wav';
  if (type.includes('flac')) return 'flac';
  return 'ogg';
};

/**
 * Transcribe on the organization's OpenAI key (or an OpenAI-compatible
 * endpoint that serves `/audio/transcriptions`).
 */
export const transcribeVoiceNoteOpenAi = async (input: {
  apiKey: string;
  baseUrl?: string | null;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<Transcription> => {
  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseUrl || undefined
  });
  const type = input.mimeType.split(';')[0].trim() || 'audio/ogg';
  const response = await client.audio.transcriptions.create({
    model: OPENAI_TRANSCRIPTION_MODEL,
    file: await toFile(input.bytes, `voice-note.${extensionFor(type)}`, {
      type
    }),
    prompt:
      'A customer writing to a business; transcribe exactly what they say.'
  });
  const usage = response.usage;
  return {
    text: (response.text || '').trim(),
    model: OPENAI_TRANSCRIPTION_MODEL,
    tokensIn: usage?.type === 'tokens' ? usage.input_tokens : 0,
    tokensOut: usage?.type === 'tokens' ? usage.output_tokens : 0,
    ...(usage?.type === 'duration' ? { seconds: usage.seconds } : {})
  };
};

export const transcribeWith = (
  transcriber: Transcriber,
  bytes: Uint8Array,
  mimeType: string
): Promise<Transcription> =>
  transcriber.provider === 'openai'
    ? transcribeVoiceNoteOpenAi({
        apiKey: transcriber.apiKey,
        baseUrl: transcriber.baseUrl,
        bytes,
        mimeType
      })
    : transcribeVoiceNote({ apiKey: transcriber.apiKey, bytes, mimeType });

/**
 * Transcribe a voice note with Gemini — on the organization's Google key, or
 * on ours where the organization's provider takes no audio. An empty `text`
 * means no speech could be made out.
 */
export const transcribeVoiceNote = async (input: {
  apiKey: string;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<Transcription> => {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const model = utils.constants.DEFAULT_LLM_MODEL;
  // WhatsApp sends `audio/ogg; codecs=opus`; the API wants the bare type.
  const mimeType = input.mimeType.split(';')[0].trim() || 'audio/ogg';

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { text: utils.VOICE_NOTE_TRANSCRIPTION_PROMPT },
          {
            inlineData: { mimeType, data: utils.bytesToBase64(input.bytes) }
          }
        ]
      }
    ],
    config: { temperature: 0 }
  });

  const text = (response.candidates?.[0]?.content?.parts || [])
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return {
    text,
    model,
    tokensIn: response.usageMetadata?.promptTokenCount || 0,
    tokensOut: response.usageMetadata?.candidatesTokenCount || 0
  };
};
