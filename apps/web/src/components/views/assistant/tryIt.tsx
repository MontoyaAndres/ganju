import { useEffect, useRef, useState } from 'react';
import { UI } from '@ganju/ui';
import { RefreshOutlined, SendOutlined } from '@mui/icons-material';

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
  projectId
}: {
  base: string;
  projectId: string;
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
        <div>
          <h3>{t('tryTitle')}</h3>
          <p>{t('tryText')}</p>
        </div>
        <UI.Button size="small" onClick={restart} disabled={sending}>
          <RefreshOutlined fontSize="small" />
          <span className="button-text">{t('tryRestart')}</span>
        </UI.Button>
      </div>
      <div className="try-messages">
        {lines.length === 0 && !sending && (
          <p className="try-empty">{t('tryEmpty')}</p>
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
          <UI.Button size="small" onClick={() => send(buttons.yes)}>
            <span className="button-text">{buttons.yes}</span>
          </UI.Button>
          <UI.Button size="small" onClick={() => send(buttons.no)}>
            <span className="button-text">{buttons.no}</span>
          </UI.Button>
        </div>
      )}
      <form
        className="try-compose"
        onSubmit={event => {
          event.preventDefault();
          send(text);
        }}
      >
        <UI.Input
          size="small"
          placeholder={t('tryPlaceholder')}
          value={text}
          disabled={sending}
          onChange={event => setText(event.target.value)}
        />
        <UI.Button
          type="submit"
          variant="contained"
          size="small"
          disabled={sending || !text.trim()}
          aria-label={t('send')}
        >
          <SendOutlined fontSize="small" />
        </UI.Button>
      </form>
    </div>
  );
};
