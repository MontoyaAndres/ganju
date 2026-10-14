import { useState } from 'react';
import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';
import type { ToolApprovalStatus } from '@ganju/utils';

import { Wrapper } from './styles';
import { i18n } from '../../../lib';

export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  toolTitle: string | null;
  arguments: unknown;
  status: ToolApprovalStatus;
  expiresAt: string;
  projectName: string | null;
}

export interface IProps {
  approval: ToolApprovalRequest | null;
  signedIn: boolean;
}

// Each argument as plain text: a string as it is, anything else as indented
// JSON. Rendered as text nodes only, so whatever the assistant put in them —
// markup, links, look-alike buttons — shows as the characters it is.
const argumentEntries = (value: unknown): Array<[string, string]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value === undefined ? [] : [['', JSON.stringify(value, null, 2)]];
  }
  return Object.entries(value as Record<string, unknown>).map(
    ([key, entry]) => [
      key,
      typeof entry === 'string' ? entry : JSON.stringify(entry, null, 2)
    ]
  );
};

export const ToolApproval = (props: IProps) => {
  const { signedIn } = props;
  const router = useRouter();
  const snackbar = UI.Alert.useSnackbar();
  const t = i18n.useT(i18n.copy.TOOL_APPROVAL);
  const c = i18n.useT(i18n.copy.COMMON);
  const other = i18n.LANGS.find(lang => lang !== t.lang);

  const [approval, setApproval] = useState(props.approval);
  const [answering, setAnswering] = useState<'approve' | 'deny' | null>(null);

  const answer = async (decision: 'approve' | 'deny') => {
    if (!approval || answering) return;
    setAnswering(decision);
    try {
      const data = await utils.fetcher({
        url: `${utils.constants.TOOL_APPROVAL_PATH}/${encodeURIComponent(approval.id)}`,
        config: {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify({ decision })
        }
      });
      // Already answered elsewhere, or expired: the reply still says where
      // it stands, so the page shows that rather than a bare error.
      if (data && typeof data.status === 'string') {
        setApproval(current =>
          current ? { ...current, status: data.status } : current
        );
      }
      if (utils.isApiError(data)) {
        snackbar.error(utils.getApiErrorMessage(data, t('toastFailed')));
      }
    } catch {
      snackbar.error(t('toastFailed'));
    } finally {
      setAnswering(null);
    }
  };

  const card = (children: React.ReactNode) => (
    <Wrapper>
      <div className="approval-card">
        <p className="approval-eyebrow">{t('eyebrow')}</p>
        {children}
        {other && (
          <p className="approval-language">
            {c('switchPrompt')}{' '}
            <a href={i18n.langHref(router.asPath, other)}>
              {c('switchAction')}
            </a>
          </p>
        )}
      </div>
    </Wrapper>
  );

  const action = (label: string, href: string) => (
    <div className="approval-actions">
      <UI.Button
        variant="contained"
        size="small"
        onClick={() => router.push(href)}
      >
        {label}
      </UI.Button>
    </div>
  );

  if (!signedIn) {
    return card(
      <>
        <h1 className="approval-title">{t('signInTitle')}</h1>
        <p className="approval-text">{t('signInText')}</p>
        {action(t('signInAction'), '/')}
      </>
    );
  }

  if (!approval) {
    return card(
      <>
        <h1 className="approval-title">{t('notFoundTitle')}</h1>
        <p className="approval-text">{t('notFoundText')}</p>
        {action(t('goToDashboard'), '/organization')}
      </>
    );
  }

  const toolLine = (
    <p className="approval-text approval-tool">
      {t('toolLineBefore')}
      <code>{approval.toolTitle || approval.toolName}</code>
      {t('toolLineAfter')}
    </p>
  );

  const entries = argumentEntries(approval.arguments);
  const details = (
    <div className="approval-arguments">
      <p className="approval-arguments-heading">{t('argumentsHeading')}</p>
      {entries.length > 0 ? (
        <dl>
          {entries.map(([key, value]) => (
            <div className="approval-argument" key={key}>
              {key && <dt>{key}</dt>}
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="approval-text">{t('noArguments')}</p>
      )}
    </div>
  );

  if (approval.status !== utils.constants.TOOL_APPROVAL_STATUS_PENDING) {
    const ended = {
      [utils.constants.TOOL_APPROVAL_STATUS_APPROVED]: [
        t('approvedTitle'),
        t('approvedText')
      ],
      [utils.constants.TOOL_APPROVAL_STATUS_DENIED]: [
        t('deniedTitle'),
        t('deniedText')
      ],
      [utils.constants.TOOL_APPROVAL_STATUS_USED]: [
        t('usedTitle'),
        t('usedText')
      ],
      [utils.constants.TOOL_APPROVAL_STATUS_EXPIRED]: [
        t('expiredTitle'),
        t('expiredText')
      ]
    }[approval.status] ?? [t('expiredTitle'), t('expiredText')];
    return card(
      <>
        <h1 className="approval-title">{ended[0]}</h1>
        <p className="approval-text">{ended[1]}</p>
        {toolLine}
        {details}
      </>
    );
  }

  return card(
    <>
      <h1 className="approval-title">{t('pendingTitle')}</h1>
      <p className="approval-text">
        {t('pendingText', {
          project: approval.projectName || t('fallbackProject')
        })}
      </p>
      {toolLine}
      {details}
      <p className="approval-note">{t('checkNote')}</p>
      <div className="approval-actions">
        <UI.Button
          variant="contained"
          size="small"
          disabled={!!answering}
          onClick={() => answer('approve')}
        >
          {answering === 'approve' ? t('approving') : t('approve')}
        </UI.Button>
        <UI.Button
          size="small"
          disabled={!!answering}
          onClick={() => answer('deny')}
        >
          {answering === 'deny' ? t('denying') : t('deny')}
        </UI.Button>
      </div>
      <p className="approval-note">{t('expiresNote')}</p>
    </>
  );
};
