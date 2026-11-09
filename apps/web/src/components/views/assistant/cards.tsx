import { useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import {
  CheckCircleOutlined,
  ContentCopyOutlined,
  DownloadOutlined,
  KeyOutlined,
  LinkOutlined,
  UndoOutlined,
  UploadFileOutlined,
  WarningAmberOutlined
} from '@mui/icons-material';

import { request } from './api';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';
import type { ChangeSet, ChangeSetCard, OwnerCard, PatchCard } from './types';

const PROVIDER_NAMES: Record<string, string> = {
  [utils.constants.OAUTH_PROVIDER_GOOGLE_GMAIL]: 'Gmail',
  [utils.constants.OAUTH_PROVIDER_GOOGLE_CALENDAR]: 'Google Calendar',
  [utils.constants.OAUTH_PROVIDER_GOOGLE_DRIVE]: 'Google Drive',
  [utils.constants.OAUTH_PROVIDER_MICROSOFT_OUTLOOK]: 'Outlook',
  [utils.constants.OAUTH_PROVIDER_ONE_DRIVE]: 'OneDrive'
};

export const providerName = (provider: string | null) =>
  (provider && PROVIDER_NAMES[provider]) || provider || '';

// What the change set makes possible, from the actions' own settings rather
// than the assistant's words.
const possibleLines = (
  card: ChangeSetCard,
  t: Translate<typeof i18n.copy.ASSISTANT.en>
) => {
  const lines: string[] = [];
  for (const item of card.items) {
    const effects = item.effects;
    if (!effects) continue;
    for (const action of effects.actions) {
      const tables = action.data?.tables ?? [];
      lines.push(
        `${action.name}: ${t(action.changesThings || !action.onlyReads ? 'changeWrites' : 'changeReads')}`
      );
      if (tables.length) {
        lines.push(
          t(
            action.data?.access === 'read'
              ? 'changeTablesRead'
              : 'changeTablesWrite',
            { tables: tables.join(', ') }
          )
        );
      }
    }
    if (effects.hosts.length) {
      lines.push(t('changeHosts', { hosts: effects.hosts.join(', ') }));
    }
    if (effects.accounts.length) {
      lines.push(
        t('changeAccounts', {
          accounts: effects.accounts.map(providerName).join(', ')
        })
      );
    }
  }
  return [...new Set(lines)];
};

export const ChangeSetCardView = ({
  card,
  changeSet,
  onApply,
  onUndo
}: {
  card: ChangeSetCard;
  changeSet: ChangeSet | null;
  onApply: () => Promise<void>;
  onUndo: () => Promise<void>;
}) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const [busy, setBusy] = useState<'apply' | 'undo' | null>(null);
  const status = changeSet?.status ?? 'proposed';
  const lines = possibleLines(card, t);
  const cantUndo = card.items.some(item => !item.undoable);

  const run = async (kind: 'apply' | 'undo') => {
    setBusy(kind);
    try {
      await (kind === 'apply' ? onApply() : onUndo());
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="assistant-card">
      <div className="assistant-card-title">
        <CheckCircleOutlined fontSize="small" />
        <span>{t('changeTitle')}</span>
      </div>
      {card.summary && <p className="assistant-card-text">{card.summary}</p>}
      <ul className="assistant-card-list">
        {card.items.map((item, index) => (
          <li key={index}>{item.label}</li>
        ))}
      </ul>
      {lines.length > 0 && (
        <>
          <p className="assistant-card-label">{t('changePossible')}</p>
          <ul className="assistant-card-list assistant-card-possible">
            {lines.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      )}
      {cantUndo && (
        <p className="assistant-card-warning">
          <WarningAmberOutlined fontSize="small" />
          {t('changeCantUndo')}
        </p>
      )}
      <div className="assistant-card-actions">
        {status === 'proposed' && (
          <UI.Button
            variant="contained"
            size="small"
            disabled={!!busy}
            onClick={() => run('apply')}
          >
            <span className="button-text">
              {busy === 'apply' ? t('applying') : t('apply')}
            </span>
          </UI.Button>
        )}
        {(status === 'applied' || status === 'failed') && (
          <>
            <span
              className={`assistant-card-status ${status === 'failed' ? 'is-error' : ''}`}
            >
              {status === 'failed'
                ? t('failed', { error: changeSet?.error ?? '' })
                : t('applied')}
            </span>
            {!cantUndo && (
              <UI.Button
                size="small"
                disabled={!!busy}
                onClick={() => run('undo')}
              >
                <UndoOutlined fontSize="small" />
                <span className="button-text">
                  {busy === 'undo' ? t('undoing') : t('undo')}
                </span>
              </UI.Button>
            )}
          </>
        )}
        {status === 'undone' && (
          <span className="assistant-card-status">{t('undone')}</span>
        )}
        {status === 'discarded' && (
          <span className="assistant-card-status">{t('discarded')}</span>
        )}
      </div>
    </div>
  );
};

export const PatchCardView = ({ card }: { card: PatchCard }) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.patch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The patch stays on screen to select by hand.
    }
  };

  const download = () => {
    const blob = new Blob([card.patch], { type: 'text/x-diff' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ganju-change.patch';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="assistant-card">
      <div className="assistant-card-title">
        <span>{t('patchTitle')}</span>
      </div>
      <p className="assistant-card-text">{t('patchText')}</p>
      {card.note && <p className="assistant-card-text">{card.note}</p>}
      <p className="assistant-card-label">
        {t('patchFiles', { files: card.files.join(', ') })}
      </p>
      <pre className="assistant-patch">
        {card.patch.split('\n').map((line, index) => (
          <span
            key={index}
            className={
              line.startsWith('+') && !line.startsWith('+++')
                ? 'is-add'
                : line.startsWith('-') && !line.startsWith('---')
                  ? 'is-remove'
                  : ''
            }
          >
            {line}
            {'\n'}
          </span>
        ))}
      </pre>
      <div className="assistant-card-actions">
        <UI.Button size="small" onClick={copy}>
          <ContentCopyOutlined fontSize="small" />
          <span className="button-text">
            {copied ? t('patchCopied') : t('patchCopy')}
          </span>
        </UI.Button>
        <UI.Button size="small" onClick={download}>
          <DownloadOutlined fontSize="small" />
          <span className="button-text">{t('patchDownload')}</span>
        </UI.Button>
      </div>
    </div>
  );
};

export const OwnerCardView = ({
  card,
  base,
  answered,
  onConnect,
  onReply
}: {
  card: OwnerCard;
  base: string;
  answered: boolean;
  onConnect: (provider: string) => void;
  onReply: (text: string) => void;
}) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const saveSecret = async () => {
    if (!value.trim() || !card.label) return;
    setSaving(true);
    setError('');
    const result = await request<{ id?: string }>(
      `${base}/artifact/credential`,
      {
        method: 'POST',
        body: {
          provider: utils.constants.CREDENTIAL_PROVIDER_CUSTOM_CODE,
          apiKey: value,
          label: card.label
        }
      }
    );
    setSaving(false);
    if (!result.ok || !result.data?.id) {
      setError(result.error || t('secretError'));
      return;
    }
    setValue('');
    onReply(t('secretDone', { label: card.label }));
  };

  const Icon =
    card.kind === 'connect_account'
      ? LinkOutlined
      : card.kind === 'secret'
        ? KeyOutlined
        : UploadFileOutlined;
  const title =
    card.kind === 'connect_account'
      ? t('connectTitle')
      : card.kind === 'secret'
        ? t('secretTitle')
        : t('uploadTitle');

  return (
    <div className="assistant-card">
      <div className="assistant-card-title">
        <Icon fontSize="small" />
        <span>{title}</span>
      </div>
      {card.message && (
        <UI.Markdown className="assistant-card-text" content={card.message} />
      )}
      {card.kind === 'secret' && card.label && (
        <p className="assistant-card-label">
          {t('secretName', { label: card.label })}
        </p>
      )}
      {!answered && (
        <>
          {card.kind === 'secret' && (
            <div className="assistant-card-secret">
              <UI.Input
                size="small"
                type="password"
                autoComplete="off"
                placeholder={t('secretValue')}
                value={value}
                onChange={event => setValue(event.target.value)}
              />
              {error && <p className="assistant-card-error">{error}</p>}
            </div>
          )}
          <div className="assistant-card-actions">
            {card.kind === 'connect_account' && card.provider && (
              <UI.Button
                variant="contained"
                size="small"
                onClick={() => onConnect(card.provider as string)}
              >
                <span className="button-text">
                  {t('connectAction', {
                    provider: providerName(card.provider)
                  })}
                </span>
              </UI.Button>
            )}
            {card.kind === 'secret' && (
              <UI.Button
                variant="contained"
                size="small"
                disabled={saving || !value.trim()}
                onClick={saveSecret}
              >
                <span className="button-text">
                  {saving ? t('secretSaving') : t('secretSave')}
                </span>
              </UI.Button>
            )}
            {card.kind === 'upload' && (
              <>
                <UI.Button
                  size="small"
                  onClick={() => window.open(`${base}/resources`)}
                >
                  <span className="button-text">{t('uploadOpen')}</span>
                </UI.Button>
                <UI.Button
                  variant="contained"
                  size="small"
                  onClick={() => onReply(t('uploadDoneMessage'))}
                >
                  <span className="button-text">{t('uploadDone')}</span>
                </UI.Button>
              </>
            )}
            <UI.Button
              size="small"
              onClick={() => onReply(t('cardSkipMessage'))}
            >
              <span className="button-text">{t('cardSkip')}</span>
            </UI.Button>
          </div>
        </>
      )}
    </div>
  );
};
