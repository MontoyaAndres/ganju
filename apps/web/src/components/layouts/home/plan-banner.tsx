import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@emotion/react';

import { i18n } from '../../../lib';
import type { Plan } from '../../../utils/ssr';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days left in the trial, or "no plan", above every page of an organization. */
export const PlanBanner = (props: {
  organizationId: string;
  plan: Plan | null | undefined;
}) => {
  const { organizationId, plan } = props;
  const theme = useTheme();
  const t = i18n.useT(i18n.copy.LAYOUT);
  // Dates and days left are the viewer's local ones, so this renders only in
  // the browser: the server would format them in its own time zone.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (
    !mounted ||
    !plan ||
    (!plan.trialing && !plan.noPlan && !plan.freeEndsAt)
  ) {
    return null;
  }

  const billing = `/organization/${organizationId}/settings`;
  let text: string;
  let action: string;
  if (plan.noPlan) {
    text = t('planBannerNoPlan');
    action = t('planBannerNoPlanAction');
  } else if (plan.freeEndsAt) {
    text = t('planBannerFreeEnds', { date: t.date(plan.freeEndsAt) });
    action = t('planBannerFreeEndsAction');
  } else {
    const left = plan.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(plan.trialEndsAt).getTime() - Date.now()) / DAY_MS
          )
        )
      : null;
    if (left == null) return null;
    text = t('planBannerTrial', {
      left:
        left === 1
          ? t('planBannerDayLeft')
          : t('planBannerDaysLeft', { n: left })
    });
    action = t('planBannerTrialAction');
  }

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        alignItems: 'center',
        padding: '8px 12px',
        marginBottom: 12,
        borderRadius: 8,
        fontSize: 13,
        ...(plan.noPlan || plan.freeEndsAt
          ? {
              background: theme.colors.earlyDawn,
              color: theme.colors.romanCoffee
            }
          : {
              background: '#5c6ac40f',
              border: '1px solid #5c6ac42e',
              color: theme.colors.bastille
            })
      }}
    >
      <span>{text}</span>
      <Link
        href={billing}
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        {action}
      </Link>
    </div>
  );
};
