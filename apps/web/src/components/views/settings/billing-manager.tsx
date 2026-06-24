import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
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
  label: string;
  used: number;
  limit: number | null;
  render: (n: number) => string;
  overageRate?: string;
}) => {
  const { label, used, limit, render, overageRate } = props;
  const pct =
    limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit != null && used > limit;
  const overColor = overageRate ? '#e0a800' : '#d9534f';
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
              background: over ? overColor : '#5c6ac4',
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
    </div>
  );
};

export const BillingManager = (props: BillingManagerProps) => {
  const { organizationId } = props;
  const router = useRouter();
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
          label="Messages this month"
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
        />
        <UsageRow
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
          label="File storage"
          used={status.usage.rawBytes}
          limit={status.limits.maxRawStorageBytes}
          render={formatBytes}
        />
        <UsageRow
          label="Projects"
          used={status.usage.projectCount}
          limit={status.limits.maxProjects}
          render={formatNumber}
        />
      </div>
    </>
  );
};
