import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { Theme, useTheme } from '@emotion/react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

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

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(mb / 1024 < 10 ? 1 : 0)} GB`;
};

const formatNumber = (n: number): string => n.toLocaleString();

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
}) => {
  const { theme, label, used, limit, render, overageRate, hint } = props;
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
            ? ` / ${render(limit)}${overageRate ? ' included' : ''}`
            : ' · Unlimited'}
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
          {render(used - (limit as number))} over · billed at {overageRate}
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
      snackbar.success('Subscription active — welcome to Pro!');
    } else if (result === 'cancelled') {
      snackbar.error('Checkout cancelled.');
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
      snackbar.error(
        utils.getApiErrorMessage(data, 'Could not open billing. Try again.')
      );
    } catch {
      snackbar.error('Could not open billing. Try again.');
    } finally {
      setActing(false);
    }
  };

  if (loading && !status) {
    return <UI.Skeleton variant="rounded" width="100%" height={220} />;
  }

  if (!status) {
    return <p className="projects-empty">Billing is unavailable right now.</p>;
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
      connect your own model
    </a>
  );
  const messagesHint: ReactNode =
    !isFree && sharedCap != null ? (
      overSharedCap ? (
        <>
          You&apos;ve used your {formatNumber(sharedCap)} included messages this
          month. Channels without their own model are paused —{' '}
          {connectModelLink} to keep them running. Channels on their own key are
          unaffected.
        </>
      ) : (
        <>
          Up to {formatNumber(sharedCap)}/mo run on our shared AI model; past
          that, {connectModelLink} to keep default channels running. Only your
          assistant&apos;s replies count — incoming user messages are free.
        </>
      )
    ) : (
      "Only your assistant's replies count here. Incoming messages from users are free and don't use your allowance."
    );

  return (
    <>
      <div className="settings-section-header">
        <div className="settings-section-text">
          <h2 className="settings-section-title">
            {planLabel} plan
            {status.subscription && !isFree && (
              <span style={{ fontWeight: 400, opacity: 0.7, fontSize: 13 }}>
                {' '}
                · {status.subscription.status}
              </span>
            )}
          </h2>
          <p className="settings-section-description">
            {isFree
              ? `Upgrade to Pro for unlimited tools, prompts, channels and team members, plus ${formatNumber(
                  status.pricing.includedMessages
                )} included messages/month — $${status.pricing.proBaseUsd}/mo.`
              : status.subscription?.cancelAtPeriodEnd
                ? `Your plan ends on ${
                    status.subscription.currentPeriodEnd
                      ? new Date(
                          status.subscription.currentPeriodEnd
                        ).toLocaleDateString()
                      : 'the period end'
                  }.`
                : status.subscription?.currentPeriodEnd
                  ? `Renews on ${new Date(
                      status.subscription.currentPeriodEnd
                    ).toLocaleDateString()}.`
                  : 'Your subscription is active.'}
          </p>
        </div>
        <UI.Button
          variant="contained"
          size="small"
          disabled={acting}
          onClick={() => goToStripe(isFree ? 'checkout' : 'portal')}
        >
          {acting ? 'Opening…' : isFree ? `Upgrade to Pro` : 'Manage billing'}
        </UI.Button>
      </div>

      <div style={{ marginTop: 8 }}>
        <UsageRow
          theme={theme}
          label="Assistant replies this month"
          used={status.usage.messagesUsed}
          // Free shows the hard cap; paid shows the included allowance (overage
          // is metered, not blocked).
          limit={
            isFree ? status.usage.messageCap : status.limits.includedMessages
          }
          render={formatNumber}
          overageRate={
            isFree ? undefined : `$${status.pricing.messagePer1kUsd}/1k`
          }
          hint={messagesHint}
        />
        <UsageRow
          theme={theme}
          label="Embedded content (RAG)"
          used={status.usage.embeddedBytes}
          limit={
            isFree
              ? status.limits.maxEmbeddedBytes
              : status.limits.includedEmbeddedBytes
          }
          render={formatBytes}
          overageRate={
            isFree ? undefined : `$${status.pricing.embeddedPerGbUsd}/GB`
          }
        />
        <UsageRow
          theme={theme}
          label="File storage"
          used={status.usage.rawBytes}
          limit={status.limits.maxRawStorageBytes}
          render={formatBytes}
        />
        <UsageRow
          theme={theme}
          label="Projects"
          used={status.usage.projectCount}
          limit={status.limits.maxProjects}
          render={formatNumber}
        />
      </div>
    </>
  );
};
