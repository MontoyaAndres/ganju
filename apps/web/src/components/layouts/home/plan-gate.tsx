import { useState } from 'react';
import Link from 'next/link';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import { i18n } from '../../../lib';
import type { Plan } from '../../../utils/ssr';

/**
 * Shown instead of the page while the organization has no plan: it can't be
 * used until a checkout starts the trial, or Pro if the trial was used.
 * Settings stays open, for billing and for deleting the organization.
 */
export const PlanGate = (props: { organizationId: string; plan: Plan }) => {
  const { organizationId, plan } = props;
  const t = i18n.useT(i18n.copy.LAYOUT);
  const c = i18n.useT(i18n.copy.COMMON);
  const snackbar = UI.Alert.useSnackbar();
  const [starting, setStarting] = useState(false);
  const trial = plan.trialAvailable !== false;

  const startCheckout = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const data = await utils.fetcher({
        url: `/organization/${organizationId}/billing/checkout`,
        config: { method: 'POST', credentials: 'include' }
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      snackbar.error(utils.getApiErrorMessage(data, c('somethingWentWrong')));
    } catch {
      snackbar.error(c('somethingWentWrong'));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 520,
        margin: '64px auto',
        padding: '0 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}
    >
      <h1 style={{ margin: 0, fontSize: 24 }}>
        {trial
          ? t('planGateTrialTitle', { days: utils.constants.TRIAL_DAYS })
          : t('planGateProTitle')}
      </h1>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        {trial
          ? t('planGateTrialText', {
              days: utils.constants.TRIAL_DAYS,
              price: utils.constants.PRICING_PRO_BASE_USD
            })
          : t('planGateProText', {
              price: utils.constants.PRICING_PRO_BASE_USD
            })}
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <UI.Button
          variant="contained"
          size="small"
          disabled={starting}
          onClick={startCheckout}
        >
          {trial ? t('planGateTrialAction') : t('planGateProAction')}
        </UI.Button>
        <Link
          href={`/organization/${organizationId}/settings`}
          style={{
            color: 'inherit',
            textDecoration: 'underline',
            fontSize: 13
          }}
        >
          {t('planGateSettings')}
        </Link>
      </div>
    </div>
  );
};
