import { useCallback, useEffect, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import IconButton from '@mui/material/IconButton';
import { Close } from '@mui/icons-material';

import { TokenMintedContent, TokensManagerWrapper } from './styles';
import { i18n } from '../../../lib';

/**
 * Access tokens — the credential a machine with no browser authenticates with.
 *
 * It sits beside a project's members rather than in an organization-level
 * section, because a token is scoped to one project and reaches nothing outside
 * it. Both panels hang off the same row for the same reason: they are the two
 * lists of who can act on this project.
 *
 * Two things about this surface are not decoration. The value is shown once and
 * cannot be shown again, so the moment it exists has to be unmissable rather
 * than a row that appears in a list. And every row carries what makes revoking a
 * decision rather than a gamble: who minted it, whether anything has used it
 * lately, and when it stops working.
 */

interface AccessToken {
  id: string;
  name: string;
  hint: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  projectId: string;
  createdByUserId: string | null;
  createdBy: { id: string; name: string; email: string } | null;
  /** The account that minted it is gone, so it no longer authenticates. */
  orphaned: boolean;
}

interface IProps {
  basePath: string;
}

const INITIAL_FORM = { name: '', expiresInDays: '90' };

export const TokensManager = (props: IProps) => {
  const { basePath } = props;
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.SETTINGS);
  const c = i18n.useT(i18n.copy.COMMON);

  const [tokens, setTokens] = useState<AccessToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM);
  const [nameError, setNameError] = useState('');
  const [creating, setCreating] = useState(false);
  const [minted, setMinted] = useState<{ name: string; token: string } | null>(
    null
  );
  const [confirm, setConfirm] = useState<AccessToken | null>(null);
  const [revoking, setRevoking] = useState(false);

  const tokenPath = `${basePath}/token`;

  // Never, plus the durations someone actually picks. A rotation people have to
  // remember is a rotation that does not happen, so "no expiry" is offered
  // rather than hidden — it is the honest answer for a scheduled deploy, and the
  // list is what makes the choice reviewable afterwards.
  const expiryOptions = [
    { label: t('tokenExpiry30'), value: '30' },
    { label: t('tokenExpiry90'), value: '90' },
    { label: t('tokenExpiry365'), value: '365' },
    { label: t('tokenExpiryNever'), value: 'never' }
  ];

  const fetchTokens = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const data = await utils.fetcher({
          url: tokenPath,
          config: { credentials: 'include', signal }
        });
        if (signal?.aborted) return;
        setTokens(Array.isArray(data) ? data : []);
      } catch {
        // aborted or network failure — leave current state
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [tokenPath]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTokens(controller.signal);
    return () => controller.abort();
  }, [fetchTokens]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating) return;

    let parsed: { name: string; expiresInDays?: number | null };
    try {
      parsed = await utils.Schema.ACCESS_TOKEN_CREATE_VIEW.parseAsync({
        name: form.name,
        expiresInDays:
          form.expiresInDays === 'never'
            ? null
            : Number.parseInt(form.expiresInDays, 10)
      });
    } catch (err) {
      // Parsed in the browser, so this issue never passes through `handleError`
      // where the API localizes the ones it raises.
      const issues = (err as { issues?: { message: string }[] })?.issues;
      const issue = issues?.[0];
      setNameError(
        issue ? utils.localizeZodIssue(issue, t.lang) : t('tokenNameRequired')
      );
      return;
    }

    setNameError('');
    setCreating(true);
    try {
      const data = await utils.fetcher({
        url: tokenPath,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(parsed)
        }
      });
      if (utils.isApiError(data)) {
        snackbar.error(utils.getApiErrorMessage(data, t('toastTokenFailed')));
        return;
      }
      const created = data as AccessToken & { token: string };
      // Held in state rather than shown in the row, because this is the only
      // moment the value exists and a row is a thing people scroll past.
      setMinted({ name: created.name, token: created.token });
      setForm(INITIAL_FORM);
      await fetchTokens();
    } catch {
      snackbar.error(t('toastTokenFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!confirm || revoking) return;
    setRevoking(true);
    try {
      const data = await utils.fetcher({
        url: `${tokenPath}/${confirm.id}`,
        config: { method: 'DELETE', credentials: 'include' }
      });
      if (utils.isApiError(data)) {
        snackbar.error(
          utils.getApiErrorMessage(data, t('toastTokenRevokeFailed'))
        );
        return;
      }
      setTokens(prev => prev.filter(token => token.id !== confirm.id));
      snackbar.success(t('toastTokenRevoked'));
      setConfirm(null);
    } catch {
      snackbar.error(c('somethingWentWrong'));
    } finally {
      setRevoking(false);
    }
  };

  const describeUse = (token: AccessToken) => {
    if (token.lastUsedAt)
      return t('tokenLastUsed', { date: t.date(token.lastUsedAt) });
    // Distinct from a date on purpose: "never used" is the sentence that makes
    // revoking safe, and it is the one people are looking for.
    return t('tokenNeverUsed');
  };

  const describeExpiry = (token: AccessToken) => {
    if (!token.expiresAt) return t('tokenNoExpiry');
    const expired = new Date(token.expiresAt).getTime() <= Date.now();
    return t(expired ? 'tokenExpired' : 'tokenExpires', {
      date: t.date(token.expiresAt)
    });
  };

  return (
    <TokensManagerWrapper>
      <div className="tm-block">
        <div className="tm-block-head">
          <h3 className="tm-block-title">{t('tokensHeading')}</h3>
          {!loading && <span className="tm-count">{tokens.length}</span>}
        </div>

        <p className="tm-intro">{t('tokensIntro')}</p>

        {loading ? (
          <div className="tm-list">
            {[0, 1].map(index => (
              <UI.Skeleton
                key={index}
                variant="rounded"
                width="100%"
                height={56}
              />
            ))}
          </div>
        ) : tokens.length === 0 ? (
          <p className="tm-empty">{t('tokensEmpty')}</p>
        ) : (
          <div className="tm-list">
            {tokens.map(token => (
              <div key={token.id} className="tm-row">
                <div className="tm-row-info">
                  <p className="tm-row-name">
                    {token.name}
                    <span className="tm-hint">{token.hint}</span>
                    {/* The row is kept when its owner is deleted, so without
                        this it would read as a working credential. */}
                    {token.orphaned && (
                      <span className="tm-orphaned">
                        {t('tokenOrphanedBadge')}
                      </span>
                    )}
                  </p>
                  <p className="tm-row-sub">
                    {token.createdBy?.name ?? t('tokenOwnerGone')}
                    <span className="tm-dot">·</span>
                    {describeUse(token)}
                    <span className="tm-dot">·</span>
                    {describeExpiry(token)}
                  </p>
                </div>
                <IconButton
                  aria-label={t('tokenRevoke')}
                  size="small"
                  onClick={() => setConfirm(token)}
                >
                  <Close fontSize="small" />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        {tokens.some(row => row.orphaned) && (
          <p className="tm-orphaned-help">{t('tokensOrphanedHelp')}</p>
        )}
      </div>

      <form className="tm-create" onSubmit={handleCreate}>
        <div className="tm-create-field">
          <UI.Input
            label={t('tokenNameLabel')}
            name="tokenName"
            placeholder={t('tokenNamePlaceholder')}
            value={form.name}
            disabled={creating}
            error={!!nameError}
            helperText={nameError || t('tokenNameHelp')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setForm(prev => ({ ...prev, name: e.target.value }));
              if (nameError) setNameError('');
            }}
          />
        </div>
        <div className="tm-create-expiry">
          <UI.Select
            label={t('tokenExpiryLabel')}
            name="tokenExpiry"
            value={form.expiresInDays}
            disabled={creating}
            options={expiryOptions}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setForm(prev => ({ ...prev, expiresInDays: e.target.value }))
            }
          />
        </div>
        <UI.Button
          type="submit"
          variant="contained"
          size="small"
          disabled={creating || !form.name.trim()}
        >
          {creating ? t('tokenCreating') : t('tokenCreate')}
        </UI.Button>
      </form>

      <UI.Modal
        open={!!minted}
        title={t('tokenMintedTitle')}
        closeLabel={c('close')}
        onClose={() => setMinted(null)}
        footer={
          <UI.Button
            variant="contained"
            size="small"
            onClick={() => setMinted(null)}
          >
            {t('tokenMintedDone')}
          </UI.Button>
        }
      >
        <TokenMintedContent>
          <p className="tm-minted-warning">{t('tokenMintedWarning')}</p>
          <UI.CopyableBlock
            label={minted?.name ?? ''}
            text={minted?.token ?? ''}
            onCopy={() => snackbar.success(t('toastTokenCopied'))}
            onCopyError={() => snackbar.error(c('somethingWentWrong'))}
          />
          <p className="tm-minted-help">{t('tokenMintedUsage')}</p>
          <UI.CopyableBlock
            label={t('tokenMintedEnvLabel')}
            text={`GANJU_API_TOKEN=${minted?.token ?? ''}`}
            onCopy={() => snackbar.success(t('toastTokenCopied'))}
            onCopyError={() => snackbar.error(c('somethingWentWrong'))}
          />
        </TokenMintedContent>
      </UI.Modal>

      <UI.Alert
        open={!!confirm}
        title={t('confirmRevokeTokenTitle')}
        description={t('confirmRevokeTokenText', {
          name: confirm?.name ?? ''
        })}
        confirmText={t('confirmRevokeTokenAction')}
        cancelText={c('cancel')}
        loadingText={c('deleting')}
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setConfirm(null)}
      />
    </TokensManagerWrapper>
  );
};
