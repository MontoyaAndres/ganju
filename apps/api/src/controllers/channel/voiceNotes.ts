import { Context } from 'hono';
import { utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';

import { transcribeWith } from '../../utils';

import type { Transcriber } from '../../utils';
import type { RunUserMessage } from './runner';
import type { BufferedVoiceNote } from '@ganju/utils';
import type { AppEnv } from '../../types';

// Voice notes on every channel. Each platform finds the audio in its own
// payload, holds it in the buffer by reference (BufferedVoiceNote) and tells
// the runner how to fetch it; the runner transcribes once it knows the turn
// will run, and the transcript runs as the customer's typed message.

export interface VoiceNoteAudio {
  bytes: Uint8Array;
  mimeType: string | null;
}

// Fetch the audio a note's `ref` points to, the platform's way.
export type VoiceNoteDownload = (
  voice: BufferedVoiceNote
) => Promise<VoiceNoteAudio>;

// Who transcribes a turn's notes: the organization's key where its provider
// takes audio, with ours behind it if that call fails, so a misconfigured key
// doesn't cost the customer their answer.
export interface VoiceNoteTranscribers {
  primary: Transcriber | null;
  fallback: Transcriber | null;
}

// A note refused for its length: expected, so not logged as an error.
export class VoiceNoteTooLong extends Error {
  constructor(readonly durationSeconds: number | null) {
    super('Voice note too long');
  }
}

/**
 * Transcribe a turn's voice notes. A transcript follows whatever text was
 * sent with the note (a caption, a message typed alongside), so nothing the
 * customer wrote is lost; a note that can't be read, or is longer than
 * VOICE_NOTE_MAX_SECONDS, keeps that text alone. Each row records what
 * happened, on whose key and what it cost under `voiceNote`.
 */
export const transcribeVoiceNotes = async (
  c: Context<AppEnv>,
  channelRow: { id: string; platform: string },
  messages: RunUserMessage[],
  download: VoiceNoteDownload,
  transcribers: VoiceNoteTranscribers
): Promise<RunUserMessage[]> =>
  Promise.all(
    messages.map(async (message): Promise<RunUserMessage> => {
      const voice = message.voice;
      if (!voice) return message;
      const withVoiceNote = (
        voiceNote: Record<string, unknown>,
        text = message.text
      ): RunUserMessage => ({
        ...message,
        text,
        metadata: {
          ...message.metadata,
          [utils.VOICE_NOTE_METADATA_KEY]: voiceNote
        }
      });
      try {
        // Refused before downloading where the platform says how long or how
        // big it is; otherwise measured from the file.
        if (
          voice.durationSeconds != null &&
          voice.durationSeconds > utils.VOICE_NOTE_MAX_SECONDS
        ) {
          throw new VoiceNoteTooLong(voice.durationSeconds);
        }
        if (voice.size != null && voice.size > utils.VOICE_NOTE_MAX_BYTES) {
          throw new VoiceNoteTooLong(voice.durationSeconds ?? null);
        }
        const primary = transcribers.primary || transcribers.fallback;
        if (!primary) throw new Error('No key to transcribe with');
        const audio = await download(voice);
        if (audio.bytes.byteLength > utils.VOICE_NOTE_MAX_BYTES) {
          throw new VoiceNoteTooLong(voice.durationSeconds ?? null);
        }
        const measured =
          voice.durationSeconds ?? utils.audioDurationSeconds(audio.bytes);
        if (measured != null && measured > utils.VOICE_NOTE_MAX_SECONDS) {
          throw new VoiceNoteTooLong(measured);
        }
        const mimeType = voice.mimeType || audio.mimeType || 'audio/ogg';

        let used = primary;
        let fellBack = false;
        let transcription;
        try {
          transcription = await transcribeWith(primary, audio.bytes, mimeType);
        } catch (error) {
          const fallback =
            primary === transcribers.primary ? transcribers.fallback : null;
          if (!fallback) throw error;
          await dbUtils.handleError(c, error, {
            service: utils.constants.SERVICE_NAME_API,
            metadata: {
              source: 'channel-voice-note-own-key',
              platform: channelRow.platform,
              channelId: channelRow.id,
              provider: primary.provider
            }
          });
          used = fallback;
          fellBack = true;
          transcription = await transcribeWith(fallback, audio.bytes, mimeType);
        }

        const seconds = measured ?? transcription.seconds ?? null;
        return withVoiceNote(
          {
            mimeType,
            transcribed: !!transcription.text,
            provider: used.provider,
            model: transcription.model,
            paidBy: used.paidBy,
            ...(fellBack ? { fallback: true } : {}),
            ...(seconds != null
              ? { durationSeconds: Math.round(seconds) }
              : {}),
            tokensIn: transcription.tokensIn,
            tokensOut: transcription.tokensOut
          },
          [message.text.trim(), transcription.text].filter(Boolean).join('\n')
        );
      } catch (error) {
        if (error instanceof VoiceNoteTooLong) {
          return withVoiceNote({
            mimeType: voice.mimeType,
            transcribed: false,
            tooLong: true,
            ...(error.durationSeconds != null
              ? { durationSeconds: Math.round(error.durationSeconds) }
              : {})
          });
        }
        await dbUtils.handleError(c, error, {
          service: utils.constants.SERVICE_NAME_API,
          metadata: {
            source: 'channel-voice-note',
            platform: channelRow.platform,
            channelId: channelRow.id,
            externalMessageId: message.externalMessageId
          }
        });
        return withVoiceNote({ mimeType: voice.mimeType, transcribed: false });
      }
    })
  );

// Redirects followed per download. Platform file hosts send at most one (to a
// signed CDN URL); more than this is not a file host behaving normally.
const VOICE_NOTE_MAX_REDIRECTS = 3;

const isAllowedVoiceNoteUrl = (url: URL, allowedHosts: string[]): boolean =>
  url.protocol === 'https:' &&
  allowedHosts.some(
    host => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );

// The body, refused past VOICE_NOTE_MAX_BYTES while it is read rather than
// after: a server that doesn't say how long it is can't make us hold more.
const readCappedBody = async (response: Response): Promise<Uint8Array> => {
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > utils.VOICE_NOTE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new VoiceNoteTooLong(null);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
};

/**
 * Download a voice note over HTTPS from one of the platform's own hosts. Every
 * redirect is checked against the same hosts, and `headers` (a bot token) only
 * go to the host the download started on, so a token can't be sent anywhere a
 * payload or a redirect names. The size is checked before the body is read
 * when the server says it, and while it is read when it doesn't.
 */
export const fetchVoiceNoteAudio = async (
  url: string,
  allowedHosts: string[],
  headers?: Record<string, string>
): Promise<VoiceNoteAudio> => {
  const origin = new URL(url);
  let current = origin;
  let response: Response | null = null;
  for (let hop = 0; hop <= VOICE_NOTE_MAX_REDIRECTS; hop++) {
    if (!isAllowedVoiceNoteUrl(current, allowedHosts)) {
      throw new Error(`Voice note URL not on an allowed host: ${current.host}`);
    }
    response = await fetch(current.toString(), {
      headers: current.hostname === origin.hostname ? headers : undefined,
      redirect: 'manual'
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) break;
    await response.body?.cancel().catch(() => undefined);
    response = null;
    current = new URL(location, current);
  }
  if (!response) throw new Error('Voice note download redirected too often');
  if (!response.ok) {
    throw new Error(`Voice note download failed: ${response.status}`);
  }
  // A file host that wants a sign-in answers 200 with a web page — Slack does
  // when the bot lacks `files:read`.
  if (response.headers.get('content-type')?.startsWith('text/html')) {
    throw new Error('Voice note download returned a web page, not audio');
  }
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > utils.VOICE_NOTE_MAX_BYTES) {
    throw new VoiceNoteTooLong(null);
  }
  return {
    bytes: await readCappedBody(response),
    mimeType: response.headers.get('content-type')
  };
};
