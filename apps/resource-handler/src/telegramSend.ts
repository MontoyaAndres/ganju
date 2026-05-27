import http from 'node:http';
import { utils } from '@anju/utils';
import type { TelegramSendRequest } from '@anju/utils';

import { utils as serverUtils } from './utils/index.js';

type TelegramMethod =
  | 'sendPhoto'
  | 'sendVideo'
  | 'sendAudio'
  | 'sendDocument';

const pickMethod = (
  mimeType: string
): { method: TelegramMethod; field: 'photo' | 'video' | 'audio' | 'document'; cap: number } => {
  if (mimeType.startsWith('image/')) {
    return {
      method: 'sendPhoto',
      field: 'photo',
      cap: utils.constants.TELEGRAM_MAX_PHOTO_BYTES
    };
  }
  if (mimeType.startsWith('video/')) {
    return {
      method: 'sendVideo',
      field: 'video',
      cap: utils.constants.TELEGRAM_MAX_FILE_BYTES
    };
  }
  if (mimeType.startsWith('audio/')) {
    return {
      method: 'sendAudio',
      field: 'audio',
      cap: utils.constants.TELEGRAM_MAX_FILE_BYTES
    };
  }
  return {
    method: 'sendDocument',
    field: 'document',
    cap: utils.constants.TELEGRAM_MAX_FILE_BYTES
  };
};

export const handleTelegramSend = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  let form: FormData;
  try {
    form = await serverUtils.parseMultipartRequest(req);
  } catch (err) {
    serverUtils.sendJson(res, 400, {
      error: `failed to parse multipart body: ${(err as Error).message}`
    });
    return;
  }

  const metadataRaw = form.get('metadata');
  if (typeof metadataRaw !== 'string') {
    serverUtils.sendJson(res, 400, { error: 'missing metadata field' });
    return;
  }

  let metadata: TelegramSendRequest;
  try {
    metadata = JSON.parse(metadataRaw) as TelegramSendRequest;
  } catch (err) {
    serverUtils.sendJson(res, 400, {
      error: `metadata field is not valid JSON: ${(err as Error).message}`
    });
    return;
  }

  if (!metadata.botToken) {
    serverUtils.sendJson(res, 401, { error: 'missing botToken in metadata' });
    return;
  }
  if (typeof metadata.chatId !== 'number') {
    serverUtils.sendJson(res, 400, { error: 'missing or invalid chatId in metadata' });
    return;
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    serverUtils.sendJson(res, 400, { error: 'missing file field' });
    return;
  }
  const fileObj = file as File;
  const mimeType =
    fileObj.type || utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM;
  const filename = fileObj.name || 'file';

  const { method, field, cap } = pickMethod(mimeType);
  if (fileObj.size > cap) {
    serverUtils.sendJson(res, 413, {
      error: `file exceeds Telegram ${method} ${Math.round(
        cap / (1024 * 1024)
      )}MB limit`
    });
    return;
  }

  const tgForm = new FormData();
  tgForm.append('chat_id', String(metadata.chatId));
  if (typeof metadata.replyToMessageId === 'number') {
    tgForm.append('reply_to_message_id', String(metadata.replyToMessageId));
  }
  if (metadata.caption) {
    tgForm.append('caption', metadata.caption);
    if (metadata.parseMode) tgForm.append('parse_mode', metadata.parseMode);
  }
  tgForm.append(field, fileObj, filename);

  const url = `${utils.constants.TELEGRAM_API_BASE}/bot${metadata.botToken}/${method}`;
  const response = await fetch(url, { method: 'POST', body: tgForm });
  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    serverUtils.sendJson(res, response.status, responseBody);
    return;
  }
  serverUtils.sendJson(res, 200, responseBody);
};
