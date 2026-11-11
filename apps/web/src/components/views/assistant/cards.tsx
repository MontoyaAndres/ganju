import { useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import {
  AutoFixHighOutlined,
  CheckCircleOutlined,
  CheckRounded,
  CodeOutlined,
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

export const providerName = utils.providerDisplayName;

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

const LOST_KEYS = {
  file: 'itemLostFile',
  credentials: 'itemLostCredentials',
  secret: 'itemLostSecret'
} as const;

export const ChangeSetCardView = ({
  card,
  changeSet,
  onApply,
  onUndo
}: {
  card: ChangeSetCard;
  changeSet: ChangeSet | null;
  onApply: (confirm: Record<string, string>) => Promise<void>;
  onUndo: () => Promise<void>;
}) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const [busy, setBusy] = useState<'apply' | 'undo' | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [confirmUndo, setConfirmUndo] = useState(false);
  const status = changeSet?.status ?? 'proposed';
  const lines = possibleLines(card, t);
  const undoable = card.items.filter(item => item.undoable);
  const cantUndo = undoable.length === 0;
  const someCantUndo = !cantUndo && undoable.length < card.items.length;
  const restores = card.items.some(item => item.undo === 'restore');
  const named = card.items.every(
    (item, index) =>
      !item.deletes || (typed[String(index)] ?? '').trim() === item.deletes
  );

  const run = async (kind: 'apply' | 'undo') => {
    setBusy(kind);
    try {
      await (kind === 'apply' ? onApply(typed) : onUndo());
    } finally {
      setBusy(null);
      setConfirmUndo(false);
    }
  };

  return (
    <div className={`assistant-card is-change is-${status}`}>
      <div className="assistant-card-title">
        <span className="assistant-card-icon">
          <AutoFixHighOutlined fontSize="small" />
        </span>
        <span>
          {status === 'proposed' ? t('changeTitle') : t('changeTitleDone')}
        </span>
        {status !== 'proposed' && (
          <span className={`assistant-chip is-${status}`}>
            {status === 'failed'
              ? t('failedShort')
              : status === 'applied'
                ? t('applied')
                : status === 'undone'
                  ? t('undone')
                  : t('discarded')}
          </span>
        )}
      </div>
      {card.summary && <p className="assistant-card-text">{card.summary}</p>}
      <ul className="assistant-card-list">
        {card.items.map((item, index) => {
          const notes = [
            item.undo === 'restore' ? t('itemRestore') : null,
            item.lost ? t(LOST_KEYS[item.lost]) : null,
            item.managedByCode ? t('itemFromCode') : null
          ].filter((note): note is string => !!note);
          return (
            <li key={index} className={item.deletes ? 'is-delete' : undefined}>
              {item.deletes && (
                <strong className="assistant-delete-tag">
                  {t('itemDeletes')}
                </strong>
              )}
              <span>{item.label}</span>
              {notes.map(note => (
                <span key={note} className="assistant-item-note">
                  {note}
                </span>
              ))}
              {item.deletes && status === 'proposed' && (
                <input
                  className="assistant-delete-input"
                  aria-label={t('itemTypeName', { name: item.deletes })}
                  placeholder={t('itemTypeName', { name: item.deletes })}
                  value={typed[String(index)] ?? ''}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={event =>
                    setTyped(prev => ({
                      ...prev,
                      [String(index)]: event.target.value
                    }))
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
      {lines.length > 0 && (
        <>
          <p className="assistant-card-label">{t('changePossible')}</p>
          <ul className="assistant-card-list assistant-card-possible">
            {lines.map(line => (
              <li key={line}>
                <CheckCircleOutlined fontSize="small" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {(cantUndo || someCantUndo) && (
        <p className="assistant-card-warning">
          <WarningAmberOutlined fontSize="small" />
          {t(cantUndo ? 'changeCantUndo' : 'changeSomeCantUndo')}
        </p>
      )}
      <div className="assistant-card-actions">
        {status === 'proposed' && (
          <>
            <UI.Button
              variant="contained"
              className="assistant-apply"
              disabled={!!busy || !named}
              onClick={() => run('apply')}
            >
              <CheckRounded fontSize="small" />
              <span className="button-text">
                {busy === 'apply' ? t('applying') : t('apply')}
              </span>
            </UI.Button>
            {!named && (
              <span className="assistant-card-status">{t('typeToApply')}</span>
            )}
          </>
        )}
        {(status === 'applied' || status === 'failed') && (
          <>
            {status === 'failed' && (
              <span className="assistant-card-status is-error">
                {t('failed', { error: changeSet?.error ?? '' })}
              </span>
            )}
            {status === 'applied' && changeSet?.error && (
              <span className="assistant-card-status is-error">
                {changeSet.error}
              </span>
            )}
            {!cantUndo && confirmUndo && (
              <div className="assistant-undo-confirm">
                <p>{t('undoRestoreConfirm')}</p>
                <div>
                  <UI.Button
                    size="small"
                    color="error"
                    disabled={!!busy}
                    onClick={() => run('undo')}
                  >
                    <UndoOutlined fontSize="small" />
                    <span className="button-text">
                      {busy === 'undo' ? t('undoing') : t('undoAnyway')}
                    </span>
                  </UI.Button>
                  <UI.Button
                    size="small"
                    disabled={!!busy}
                    onClick={() => setConfirmUndo(false)}
                  >
                    <span className="button-text">{t('cancel')}</span>
                  </UI.Button>
                </div>
              </div>
            )}
            {!cantUndo && !confirmUndo && (
              <UI.Button
                size="small"
                disabled={!!busy}
                onClick={() => (restores ? setConfirmUndo(true) : run('undo'))}
              >
                <UndoOutlined fontSize="small" />
                <span className="button-text">
                  {busy === 'undo' ? t('undoing') : t('undo')}
                </span>
              </UI.Button>
            )}
          </>
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="assistant-card is-patch">
      <div className="assistant-card-title">
        <span className="assistant-card-icon">
          <CodeOutlined fontSize="small" />
        </span>
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
    <div className="assistant-card is-request">
      <div className="assistant-card-title">
        <span className="assistant-card-icon">
          <Icon fontSize="small" />
        </span>
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
