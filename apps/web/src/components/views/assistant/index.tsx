import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import {
  AddOutlined,
  AutoAwesomeOutlined,
  ChatBubbleOutlineOutlined,
  CloseOutlined,
  LockOutlined,
  SendOutlined
} from '@mui/icons-material';

import { Wrapper } from './styles';
import { request, streamTurn } from './api';
import {
  ChangeSetCardView,
  OwnerCardView,
  PatchCardView,
  providerName
} from './cards';
import { TryIt } from './tryIt';
import { useAssistantAccess } from './access';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';
import type {
  Card,
  ContentBlock,
  Conversation,
  ConversationDetail,
  Entry,
  Message,
  StreamEvent
} from './types';

type AssistantCopy = typeof i18n.copy.ASSISTANT.en;

const CONNECT_KEY = 'ganju:assistant-connect';

interface LiveTurn {
  turnId: string;
  text: string;
  tool: string | null;
  cards: Card[];
  credits: number;
}

const toolLabel = (
  t: Translate<AssistantCopy>,
  name: string,
  action: string | null
) => {
  switch (name) {
    case 'project':
      return t('toolProject');
    case 'functions':
      if (action === 'save_draft') return t('toolWrite');
      if (action === 'logs') return t('toolLogs');
      if (action === 'turn_on') return t('toolTurnOn');
      return t('toolRead');
    case 'run_test':
      return t('toolTest');
    case 'data':
      return t('toolData');
    case 'knowledge':
      return t('toolKnowledge');
    case 'prompts':
      return t('toolPrompts');
    case 'tools':
      return t('toolTools');
    case 'propose_changes':
      return t('toolPropose');
    case 'propose_patch':
      return t('toolPatch');
    default:
      return t('toolAsk');
  }
};

const textBlocks = (content: ContentBlock[]) =>
  content
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => (block.text as string).trim())
    .filter(Boolean);

// The saved conversation as the owner reads it: their words, the assistant's
// words and the cards. Thinking and tool results stay out.
const entriesOf = (messages: Message[]): Entry[] => {
  const entries: Entry[] = [];
  const turnCredits = new Map<string, number>();
  const lastReply = new Map<string, number>();
  for (const message of messages) {
    turnCredits.set(
      message.turnId,
      (turnCredits.get(message.turnId) ?? 0) + (message.credits ?? 0)
    );
    const texts = textBlocks(message.content);
    if (message.role === 'user') {
      // The notes on applied change sets come first; the owner's words last.
      texts
        .slice(0, -1)
        .forEach((text, index) =>
          entries.push({ kind: 'note', key: `${message.id}-n${index}`, text })
        );
      const own = texts[texts.length - 1];
      if (own) entries.push({ kind: 'owner', key: message.id, text: own });
    } else if (texts.length) {
      entries.push({
        kind: 'reply',
        key: message.id,
        text: texts.join('\n\n'),
        credits: 0
      });
      lastReply.set(message.turnId, entries.length - 1);
    }
    (message.cards ?? []).forEach((card, index) =>
      entries.push({ kind: 'card', key: `${message.id}-c${index}`, card })
    );
  }
  for (const [turnId, index] of lastReply) {
    const entry = entries[index];
    if (entry.kind === 'reply') entry.credits = turnCredits.get(turnId) ?? 0;
  }
  return entries;
};

// The turn still answering: the last one the owner started.
const runningTurnOf = (detail: ConversationDetail) => {
  if (detail.conversation.status !== 'running') return null;
  const owner = [...detail.messages]
    .reverse()
    .find(message => message.role === 'user');
  return owner?.turnId ?? null;
};

export const Assistant = () => {
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const { id: organizationId, projectId } = router.query as {
    id: string;
    projectId: string;
  };
  const base = `/organization/${organizationId}/project/${projectId}`;
  const builderBase = `${base}/builder`;
  const access = useAssistantAccess(organizationId, projectId);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [monthCredits, setMonthCredits] = useState(0);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [tryOpen, setTryOpen] = useState(false);
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const streamRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const chatId =
    typeof router.query.chat === 'string' ? router.query.chat : null;

  const loadConversations = useCallback(async () => {
    const result = await request<{
      conversations: Conversation[];
      monthCredits: number;
    }>(`${builderBase}/conversation`);
    if (!result.ok) return;
    setConversations(result.data.conversations);
    setMonthCredits(result.data.monthCredits);
  }, [builderBase]);

  const loadDetail = useCallback(
    async (conversationId: string) => {
      const result = await request<ConversationDetail>(
        `${builderBase}/conversation/${conversationId}`
      );
      if (!result.ok) return null;
      setDetail(result.data);
      return result.data;
    },
    [builderBase]
  );

  const follow = useCallback(
    async (conversationId: string, turnId: string) => {
      streamRef.current?.abort();
      const controller = new AbortController();
      streamRef.current = controller;
      setLive({ turnId, text: '', tool: null, cards: [], credits: 0 });
      const onEvent = (event: StreamEvent) => {
        setLive(prev => {
          if (!prev) return prev;
          switch (event.type) {
            case 'text':
              return { ...prev, text: prev.text + event.text, tool: null };
            case 'tool':
              return {
                ...prev,
                text: '',
                tool: toolLabel(t, event.name, event.action)
              };
            case 'card':
              return { ...prev, cards: [...prev.cards, event.card] };
            case 'usage':
              return { ...prev, credits: event.credits };
            default:
              return prev;
          }
        });
        if (event.type === 'error') snackbar.error(t('errorTurn'));
        if (event.type === 'done') {
          setStoppedEarly(event.stoppedBy === 'step-cap');
        }
      };
      await streamTurn(
        `${builderBase}/conversation/${conversationId}`,
        turnId,
        onEvent,
        controller.signal
      );
      if (controller.signal.aborted) return;
      await loadDetail(conversationId);
      setLive(null);
      loadConversations();
    },
    [builderBase, loadDetail, loadConversations, snackbar, t]
  );

  useEffect(() => {
    if (access !== 'open') return;
    loadConversations();
  }, [access, loadConversations]);

  const followRef = useRef(follow);
  followRef.current = follow;

  useEffect(() => {
    if (access !== 'open') return;
    streamRef.current?.abort();
    setLive(null);
    setDetail(null);
    setStoppedEarly(false);
    if (!chatId) return;
    (async () => {
      const loaded = await loadDetail(chatId);
      const running = loaded && runningTurnOf(loaded);
      if (running) followRef.current(chatId, running);
    })();
  }, [access, chatId, loadDetail]);

  useEffect(() => () => streamRef.current?.abort(), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [detail, live?.text, live?.tool, live?.cards.length]);

  const openChat = (conversationId: string | null) => {
    const query: Record<string, string> = { id: organizationId, projectId };
    if (conversationId) query.chat = conversationId;
    router.push({ pathname: router.pathname, query }, undefined, {
      shallow: true
    });
  };

  const send = async (value: string, conversationId = chatId) => {
    const message = value.trim();
    if (!message || sending || live) return;
    setSending(true);
    setStoppedEarly(false);
    try {
      let target = conversationId;
      if (!target) {
        const created = await request<{ id: string }>(
          `${builderBase}/conversation`,
          { method: 'POST', body: {} }
        );
        if (!created.ok) {
          snackbar.error(created.error || t('errorSend'));
          return;
        }
        target = created.data.id;
      }
      const sent = await request<{ turnId: string }>(
        `${builderBase}/conversation/${target}/message`,
        { method: 'POST', body: { text: message } }
      );
      if (!sent.ok) {
        snackbar.error(
          sent.status === 429
            ? t('rateLimited')
            : sent.status === 409
              ? t('busy')
              : sent.error || t('errorSend')
        );
        return;
      }
      setText('');
      if (target !== chatId) {
        // The new chat's page picks the running turn up as it loads.
        openChat(target);
        return;
      }
      await loadDetail(target);
      follow(target, sent.data.turnId);
    } finally {
      setSending(false);
    }
  };

  // Back from connecting an account: say so to the chat that asked for it.
  useEffect(() => {
    if (access !== 'open') return;
    const connected = router.query.connected;
    if (typeof connected !== 'string') return;
    let pending: { conversationId: string; provider: string } | null = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(CONNECT_KEY) ?? 'null');
      sessionStorage.removeItem(CONNECT_KEY);
    } catch {
      pending = null;
    }
    const query: Record<string, string> = { id: organizationId, projectId };
    if (pending?.conversationId) query.chat = pending.conversationId;
    router
      .replace({ pathname: router.pathname, query }, undefined, {
        shallow: true
      })
      .then(() => {
        if (pending?.conversationId && pending.provider === connected) {
          send(
            t('connectDone', { provider: providerName(connected) }),
            pending.conversationId
          );
        }
      });
    // Once per return from the sign-in.
  }, [access, router.query.connected]);

  const connect = async (provider: string) => {
    if (!chatId) return;
    const result = await request<{ url?: string }>(
      `/oauth/${provider}/authorize?organizationId=${organizationId}&projectId=${projectId}&returnTo=assistant`
    );
    if (!result.ok || !result.data?.url) {
      snackbar.error(result.error || t('errorSend'));
      return;
    }
    try {
      sessionStorage.setItem(
        CONNECT_KEY,
        JSON.stringify({ conversationId: chatId, provider })
      );
    } catch {
      // Without it the owner tells the assistant themselves.
    }
    window.location.href = result.data.url;
  };

  const changeSetAction = async (
    changeSetId: string,
    kind: 'apply' | 'undo'
  ) => {
    const result = await request<{ changeSet: { status: string } }>(
      `${builderBase}/change-set/${changeSetId}/${kind}`,
      { method: 'POST', body: {} }
    );
    if (!result.ok) {
      snackbar.error(result.error || t('errorSend'));
    } else if (result.data.changeSet.status === 'applied') {
      snackbar.success(t('toastApplied'));
    } else if (result.data.changeSet.status === 'undone') {
      snackbar.success(t('toastUndone'));
    }
    if (chatId) await loadDetail(chatId);
  };

  // A turn picked up after a reload replays from its start, so what it has
  // already saved is shown once, from the saved messages.
  const liveTurnMessages =
    live && detail
      ? detail.messages.filter(message => message.turnId === live.turnId)
      : [];
  const savedLiveCards = new Set(
    liveTurnMessages.flatMap(message =>
      (message.cards ?? []).map(card => JSON.stringify(card))
    )
  );
  const liveCards =
    live?.cards.filter(card => !savedLiveCards.has(JSON.stringify(card))) ?? [];
  const chatCredits = detail
    ? detail.credits -
      liveTurnMessages.reduce((sum, message) => sum + message.credits, 0) +
      (live?.credits ?? 0)
    : 0;

  const entries = useMemo(
    () => (detail ? entriesOf(detail.messages) : []),
    [detail]
  );
  const lastOwnerIndex = entries.reduce(
    (last, entry, index) => (entry.kind === 'owner' ? index : last),
    -1
  );

  const renderCard = (card: Card, index: number, key: string) => {
    if (card.kind === 'change_set') {
      return (
        <ChangeSetCardView
          key={key}
          card={card}
          changeSet={
            detail?.changeSets.find(set => set.id === card.changeSetId) ?? null
          }
          onApply={() => changeSetAction(card.changeSetId, 'apply')}
          onUndo={() => changeSetAction(card.changeSetId, 'undo')}
        />
      );
    }
    if (card.kind === 'patch') return <PatchCardView key={key} card={card} />;
    return (
      <OwnerCardView
        key={key}
        card={card}
        base={base}
        answered={index < lastOwnerIndex || !!live}
        onConnect={connect}
        onReply={reply => send(reply)}
      />
    );
  };

  if (access === 'loading') {
    return (
      <Wrapper>
        <UI.Skeleton variant="rounded" height={420} />
      </Wrapper>
    );
  }

  if (access === 'locked' || access === 'closed') {
    return (
      <Wrapper>
        <div className="assistant-locked">
          <div className="assistant-locked-badge">
            <LockOutlined fontSize="small" />
            <span>{t('lockedBadge')}</span>
          </div>
          <h3>{t('lockedTitle')}</h3>
          <p>{t('lockedText')}</p>
          {access === 'locked' && (
            <UI.Button
              variant="contained"
              onClick={() =>
                router.push(`/organization/${organizationId}/settings`)
              }
            >
              <span className="button-text">{t('upgrade')}</span>
            </UI.Button>
          )}
        </div>
      </Wrapper>
    );
  }

  const busy = sending || !!live;

  return (
    <Wrapper>
      <div className={`assistant-layout ${tryOpen ? 'is-try-open' : ''}`}>
        <aside className="assistant-chats">
          <UI.Button
            fullWidth
            variant="contained"
            size="small"
            onClick={() => openChat(null)}
          >
            <AddOutlined fontSize="small" />
            <span className="button-text">{t('newChat')}</span>
          </UI.Button>
          <p className="assistant-chats-heading">{t('pastChats')}</p>
          {conversations.length === 0 && (
            <p className="assistant-chats-empty">{t('noChats')}</p>
          )}
          <ul>
            {conversations.map(conversation => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={conversation.id === chatId ? 'is-active' : ''}
                  onClick={() => openChat(conversation.id)}
                >
                  <ChatBubbleOutlineOutlined fontSize="small" />
                  <span className="assistant-chat-title">
                    {conversation.title || t('untitled')}
                  </span>
                  <span className="assistant-chat-time">
                    {t.relativeShort(conversation.lastMessageAt ?? undefined)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="assistant-month">
            {t('monthCredits', { credits: t.n(monthCredits) })}
          </p>
        </aside>

        <section className="assistant-chat">
          <header className="assistant-header">
            <div>
              <h2>{t('title')}</h2>
              <p>{t('subtitle')}</p>
            </div>
            <div className="assistant-header-actions">
              {detail && (
                <span className="assistant-credits">
                  {t('chatCredits', {
                    credits: t.n(Math.round(chatCredits * 10) / 10)
                  })}
                </span>
              )}
              <UI.Button
                size="small"
                className="assistant-try-toggle"
                onClick={() => setTryOpen(open => !open)}
              >
                {tryOpen ? (
                  <CloseOutlined fontSize="small" />
                ) : (
                  <AutoAwesomeOutlined fontSize="small" />
                )}
                <span className="button-text">
                  {tryOpen ? t('tryClose') : t('tryOpen')}
                </span>
              </UI.Button>
            </div>
          </header>

          <div className="assistant-messages">
            {!chatId && !busy && (
              <div className="assistant-empty">
                <AutoAwesomeOutlined />
                <h3>{t('emptyTitle')}</h3>
                <p>{t('emptyText')}</p>
              </div>
            )}
            {entries.map((entry, index) => {
              if (entry.kind === 'owner') {
                return (
                  <div key={entry.key} className="assistant-owner">
                    {entry.text}
                  </div>
                );
              }
              if (entry.kind === 'note') {
                return (
                  <p key={entry.key} className="assistant-note">
                    {t('noteLine', { text: entry.text })}
                  </p>
                );
              }
              if (entry.kind === 'reply') {
                return (
                  <div key={entry.key} className="assistant-reply">
                    <UI.Markdown content={entry.text} />
                    {entry.credits > 0 && (
                      <span className="assistant-reply-credits">
                        {t('replyCredits', { credits: t.n(entry.credits) })}
                      </span>
                    )}
                  </div>
                );
              }
              return renderCard(entry.card, index, entry.key);
            })}
            {live && (
              <>
                {live.text && (
                  <div className="assistant-reply">
                    <UI.Markdown content={live.text} />
                  </div>
                )}
                {liveCards.map((card, index) =>
                  renderCard(card, entries.length + index, `live-${index}`)
                )}
                <div className="assistant-progress">
                  <span className="assistant-dot" />
                  <span>{live.tool ?? t('working')}</span>
                </div>
              </>
            )}
            {stoppedEarly && !live && (
              <p className="assistant-note">{t('stoppedSteps')}</p>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="assistant-compose"
            onSubmit={event => {
              event.preventDefault();
              send(text);
            }}
          >
            <UI.Input
              multiline
              maxRows={6}
              size="small"
              placeholder={t('placeholder')}
              value={text}
              disabled={busy}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  send(text);
                }
              }}
            />
            <UI.Button
              type="submit"
              variant="contained"
              disabled={busy || !text.trim()}
            >
              <SendOutlined fontSize="small" />
              <span className="button-text">
                {busy ? t('working') : t('send')}
              </span>
            </UI.Button>
          </form>
        </section>

        <aside className="assistant-try">
          <TryIt
            base={base}
            projectId={projectId}
            onClose={() => setTryOpen(false)}
          />
        </aside>
      </div>
    </Wrapper>
  );
};
