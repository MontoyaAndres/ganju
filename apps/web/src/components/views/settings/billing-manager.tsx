import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { Theme, useTheme } from '@emotion/react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import { i18n } from '../../../lib';

interface BillingLimits {
  maxProjects: number | null;
  maxToolsPerArtifact: number | null;
  maxPromptsPerArtifact: number | null;
  maxChannelsPerArtifact: number | null;
  maxRawStorageBytes: number | null;
  maxEmbeddedBytes: number | null;
  monthlyMessageCap: number | null;
  // How many messages/mo may run on our shared AI model before a channel must
  // connect its own key to continue. Present in the billing payload (full
  // PlanLimits is serialized); used to warn the owner on the messages row.
  sharedKeyMessageCap: number | null;
  canInvite: boolean;
  includedMessages: number;
  includedEmbeddedBytes: number;
}

interface BillingStatus {
  plan: string;
  limits: BillingLimits;
  usage: {
    projectCount: number;
    rawBytes: number;
    embeddedBytes: number;
    messagesUsed: number;
    messageCap: number | null;
  };
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    customDomain: boolean;
    hasBillingAccount: boolean;
  } | null;
  pricing: {
    proBaseUsd: number;
    includedMessages: number;
    includedEmbeddedGb: number;
    messagePer1kUsd: number;
    embeddedPerGbUsd: number;
    customDomainUsd: number;
  };
}

interface BillingManagerProps {
  organizationId: string;
  // Scrolls the settings page to the Models section, so the shared-model note can
  // link the owner straight to where they connect a key.
  onGoToModels?: () => void;
}

// One usage row: a label, "used / limit" caption and a progress bar. A null
// limit with no allowance renders as "Unlimited" (no bar). `overageRate` marks
// a paid allowance that bills beyond the limit rather than blocking — going
// over is shown amber + a billed note, vs red for a hard (Free) cap.
const UsageRow = (props: {
  theme: Theme;
  label: string;
  used: number;
  limit: number | null;
  render: (n: number) => string;
  overageRate?: string;
  hint?: ReactNode;
  unlimitedText: string;
  includedText: string;
  overText: (amount: string, rate: string) => string;
}) => {
  const {
    theme,
    label,
    used,
    limit,
    render,
    overageRate,
    hint,
    unlimitedText,
    includedText,
    overText
  } = props;
  const pct =
    limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit != null && used > limit;
  const overColor = overageRate ? theme.colors.corn : theme.colors.roman;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 13,
          marginBottom: 6
        }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ opacity: 0.75 }}>
          {render(used)}
          {limit != null
            ? ` / ${render(limit)}${overageRate ? ` ${includedText}` : ''}`
            : ` · ${unlimitedText}`}
        </span>
      </div>
      {limit != null && (
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: 'rgba(0,0,0,0.08)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: over ? overColor : theme.colors.indigo,
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      )}
      {over && overageRate && (
        <div style={{ fontSize: 12, color: overColor, marginTop: 4 }}>
          {overText(render(used - (limit as number)), overageRate)}
        </div>
      )}
      {hint && (
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
};

export const BillingManager = (props: BillingManagerProps) => {
  const { organizationId, onGoToModels } = props;
  const router = useRouter();
  const theme = useTheme();
  const t = i18n.useT(i18n.copy.SETTINGS);
  const snackbar = UI.Alert.useSnackbar();

  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const base = `/organization/${organizationId}/billing`;

  const fetchStatus = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const data = await utils.fetcher({
          url: base,
          config: { credentials: 'include', signal }
        });
        if (signal?.aborted) return;
        if (data && !utils.isApiError(data)) setStatus(data);
      } catch {
        // ignore — aborted or network failure
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [base]
  );

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    fetchStatus(controller.signal);
    return () => controller.abort();
  }, [organizationId, fetchStatus]);

  // Surface the Checkout redirect result once, then strip the query param.
  useEffect(() => {
    const result = router.query.billing;
    if (result === 'success') {
      snackbar.success(t('toastCheckoutSuccess'));
    } else if (result === 'cancelled') {
      snackbar.error(t('toastCheckoutCancelled'));
    }
    if (result) {
      const { billing: _omit, ...rest } = router.query;
      router.replace({ query: rest }, undefined, { shallow: true });
    }
  }, [router.query.billing]);

  // Kick off Checkout (Free → Pro) or open the Customer Portal (paid). Both
  // return a Stripe-hosted URL we redirect the browser to.
  const goToStripe = async (action: 'checkout' | 'portal') => {
    if (acting) return;
    setActing(true);
    try {
      const data = await utils.fetcher({
        url: `${base}/${action}`,
        config: { method: 'POST', credentials: 'include' }
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      snackbar.error(utils.getApiErrorMessage(data, t('toastBillingFailed')));
    } catch {
      snackbar.error(t('toastBillingFailed'));
    } finally {
      setActing(false);
    }
  };

  if (loading && !status) {
    return <UI.Skeleton variant="rounded" width="100%" height={220} />;
  }

  if (!status) {
    return <p className="projects-empty">{t('billingUnavailable')}</p>;
  }

  const isFree = status.plan === utils.constants.PLAN_FREE;
  const planLabel = isFree
    ? 'Free'
    : status.plan === utils.constants.PLAN_PRO
      ? 'Pro'
      : 'Enterprise';

  // Paid plans read as "unlimited messages, just pay overage" on the row below,
  // but the runner actually stops a channel that has no own key once shared-model
  // use hits this cap — and that block only surfaces in-channel, where the owner
  // never looks. Surface the rule (and, once they're over it, the action) here.
  // Free is pure-shared and already hard-capped, so this note is paid-only.
  const sharedCap = status.limits.sharedKeyMessageCap;
  const overSharedCap =
    sharedCap != null && status.usage.messagesUsed >= sharedCap;
  const connectModelLink = (
    <a
      href="#models"
      onClick={e => {
        if (onGoToModels) {
          e.preventDefault();
          onGoToModels();
        }
      }}
      style={{ color: theme.colors.bastille, textDecoration: 'underline' }}
    >
      {t('sharedCapLink')}
    </a>
  );
  const messagesHint: ReactNode =
    !isFree && sharedCap != null ? (
      overSharedCap ? (
        <>
          {t('sharedCapOverBefore', { count: t.n(sharedCap) })}
          {t('sharedCapOverMiddle')}
          {connectModelLink}
          {t('sharedCapOverAfter')}
        </>
      ) : (
        <>
          {t('sharedCapUnderBefore', { count: t.n(sharedCap) })}
          {connectModelLink}
          {t('sharedCapUnderAfter')}
        </>
      )
    ) : (
      t('messagesHintFree')
    );

  return (
    <>
      <div className="settings-section-header">
        <div className="settings-section-text">
          <h2 className="settings-section-title">
            {t('planHeading', { plan: planLabel })}
            {status.subscription && !isFree && (
              <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>
                {' '}
                · {status.subscription.status}
              </span>
            )}
          </h2>
          <p className="settings-section-description">
            {isFree
              ? t('upgradePitch', {
                  messages: t.n(status.pricing.includedMessages),
                  price: status.pricing.proBaseUsd
                })
              : status.subscription?.cancelAtPeriodEnd
                ? t('planEnds', {
                    date: status.subscription.currentPeriodEnd
                      ? t.date(status.subscription.currentPeriodEnd)
                      : t('planEndsFallback')
                  })
                : status.subscription?.currentPeriodEnd
                  ? t('planRenews', {
                      date: t.date(status.subscription.currentPeriodEnd)
                    })
                  : t('planActive')}
          </p>
        </div>
        <UI.Button
          variant="contained"
          size="small"
          disabled={acting}
          onClick={() => goToStripe(isFree ? 'checkout' : 'portal')}
        >
          {acting
            ? t('opening')
            : isFree
              ? t('upgradeAction')
              : t('manageBilling')}
        </UI.Button>
      </div>

      <div style={{ marginTop: 8 }}>
        <UsageRow
          theme={theme}
          unlimitedText={t('usageUnlimited')}
          includedText={t('usageIncluded')}
          overText={(amount, rate) => t('usageOverage', { amount, rate })}
          label={t('usageMessages')}
          used={status.usage.messagesUsed}
          // Free shows the hard cap; paid shows the included allowance (overage
          // is metered, not blocked).
          limit={
            isFree ? status.usage.messageCap : status.limits.includedMessages
          }
          render={t.n}
          overageRate={
            isFree ? undefined : `$${status.pricing.messagePer1kUsd}/1k`
          }
          hint={messagesHint}
        />
        <UsageRow
          theme={theme}
          unlimitedText={t('usageUnlimited')}
          includedText={t('usageIncluded')}
          overText={(amount, rate) => t('usageOverage', { amount, rate })}
          label={t('usageEmbedded')}
          used={status.usage.embeddedBytes}
          limit={
            isFree
              ? status.limits.maxEmbeddedBytes
              : status.limits.includedEmbeddedBytes
          }
          render={t.bytes}
          overageRate={
            isFree ? undefined : `$${status.pricing.embeddedPerGbUsd}/GB`
          }
        />
        <UsageRow
          theme={theme}
          unlimitedText={t('usageUnlimited')}
          includedText={t('usageIncluded')}
          overText={(amount, rate) => t('usageOverage', { amount, rate })}
          label={t('usageStorage')}
          used={status.usage.rawBytes}
          limit={status.limits.maxRawStorageBytes}
          render={t.bytes}
        />
        <UsageRow
          theme={theme}
          unlimitedText={t('usageUnlimited')}
          includedText={t('usageIncluded')}
          overText={(amount, rate) => t('usageOverage', { amount, rate })}
          label={t('usageProjects')}
          used={status.usage.projectCount}
          limit={status.limits.maxProjects}
          render={t.n}
        />
      </div>
    </>
  );
};
