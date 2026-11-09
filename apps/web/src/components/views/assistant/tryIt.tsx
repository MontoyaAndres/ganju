import { useEffect, useRef, useState } from 'react';
import { UI } from '@ganju/ui';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import {
  ArrowUpwardRounded,
  CloseOutlined,
  RefreshOutlined,
  SmartToyOutlined
} from '@mui/icons-material';

import { request } from './api';
import { i18n } from '../../../lib';

import type { TryMessage, TryReply } from './types';

interface Line {
  key: string;
  role: 'user' | 'assistant' | 'notice';
  text: string;
  footer?: string | null;
  files?: string[];
}

const newSession = () => crypto.randomUUID();

const storedSession = (projectId: string) => {
  try {
    const key = `ganju:try-session:${projectId}`;
    const found = localStorage.getItem(key);
    if (found) return found;
    const created = newSession();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return newSession();
  }
};

const storeSession = (projectId: string, session: string) => {
  try {
    localStorage.setItem(`ganju:try-session:${projectId}`, session);
  } catch {
    // Only a convenience: the chat starts over on the next visit.
  }
};

export const TryIt = ({
  base,
  projectId,
  onClose
}: {
  base: string;
  projectId: string;
  onClose: () => void;
}) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const [session, setSession] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [buttons, setButtons] = useState<TryReply['buttons']>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = storedSession(projectId);
    setSession(current);
    setLines([]);
    setButtons(null);
    (async () => {
      const result = await request<{ messages: TryMessage[] }>(
        `${base}/builder/try?session=${current}`
      );
      if (!result.ok) return;
      setLines(
        result.data.messages.map(message => ({
          key: message.id,
          role: message.role,
          text: message.content ?? ''
        }))
      );
    })();
  }, [base, projectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines, sending]);

  const send = async (value: string) => {
    const message = value.trim();
    if (!message || !session || sending) return;
    setText('');
    setButtons(null);
    setSending(true);
    setLines(prev => [
      ...prev,
      { key: `u-${Date.now()}`, role: 'user', text: message }
    ]);
    const result = await request<TryReply>(`${base}/builder/try`, {
      method: 'POST',
      body: { session, text: message }
    });
    setSending(false);
    if (!result.ok) {
      setLines(prev => [
        ...prev,
        {
          key: `n-${Date.now()}`,
          role: 'notice',
          text: result.error || t('tryError')
        }
      ]);
      return;
    }
    const reply = result.data;
    if (reply.capped) {
      setLines(prev => [
        ...prev,
        { key: `n-${Date.now()}`, role: 'notice', text: t('tryCapped') }
      ]);
      return;
    }
    if (reply.text) {
      setLines(prev => [
        ...prev,
        {
          key: `a-${Date.now()}`,
          role: 'assistant',
          text: reply.text,
          footer: reply.sourcesFooter,
          files: reply.files
        }
      ]);
    }
    setButtons(reply.buttons);
  };

  const restart = () => {
    const created = newSession();
    storeSession(projectId, created);
    setSession(created);
    setLines([]);
    setButtons(null);
  };

  return (
    <div className="try-panel">
      <div className="try-header">
        <div className="try-title">
          <span className="try-bot" aria-hidden>
            <SmartToyOutlined fontSize="small" />
          </span>
          <div className="try-title-text">
            <h3>{t('tryTitle')}</h3>
            <p>{t('tryText')}</p>
          </div>
          <Tooltip title={t('tryRestart')}>
            <span>
              <IconButton
                size="small"
                aria-label={t('tryRestart')}
                onClick={restart}
                disabled={sending}
              >
                <RefreshOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton
            size="small"
            className="try-close"
            aria-label={t('tryClose')}
            onClick={onClose}
          >
            <CloseOutlined fontSize="small" />
          </IconButton>
        </div>
      </div>
      <div className="try-messages">
        {lines.length === 0 && !sending && (
          <div className="try-empty">
            <span className="try-bot" aria-hidden>
              <SmartToyOutlined fontSize="small" />
            </span>
            <p>{t('tryEmpty')}</p>
          </div>
        )}
        {lines.map(line => (
          <div key={line.key} className={`try-line try-${line.role}`}>
            {line.role === 'assistant' ? (
              <UI.Markdown content={line.text} />
            ) : (
              <span>{line.text}</span>
            )}
            {line.footer && <p className="try-footer">{line.footer}</p>}
            {!!line.files?.length && (
              <p className="try-footer">
                {t('tryFiles', { files: line.files.join(', ') })}
              </p>
            )}
          </div>
        ))}
        {sending && (
          <div className="try-line try-assistant try-typing">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={endRef} />
      </div>
      {buttons && (
        <div className="try-buttons">
          <button type="button" onClick={() => send(buttons.yes)}>
            {buttons.yes}
          </button>
          <button type="button" onClick={() => send(buttons.no)}>
            {buttons.no}
          </button>
        </div>
      )}
      <form
        className="try-compose"
        onSubmit={event => {
          event.preventDefault();
          send(text);
        }}
      >
        <input
          placeholder={t('tryPlaceholder')}
          value={text}
          disabled={sending}
          onChange={event => setText(event.target.value)}
        />
        <button
          type="submit"
          className="assistant-send"
          disabled={sending || !text.trim()}
          aria-label={t('send')}
        >
          <ArrowUpwardRounded />
        </button>
      </form>
    </div>
  );
};
