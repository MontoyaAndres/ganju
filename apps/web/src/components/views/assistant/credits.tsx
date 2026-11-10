import { useState } from 'react';
import { UI } from '@ganju/ui';
import { AutoAwesomeOutlined } from '@mui/icons-material';

import { request } from './api';
import { i18n } from '../../../lib';

import type { BuilderCredits, BuilderKey } from './types';

const CREDITS = 'credits';

/**
 * The period's credits, and for organization admins which key the assistant
 * runs on: Ganju credits or one of the organization's Anthropic models.
 */
export const AssistantCredits = ({
  organizationId,
  credits,
  builderKey,
  onChange
}: {
  organizationId: string;
  credits: BuilderCredits | null;
  builderKey: BuilderKey | null;
  onChange: () => void;
}) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  const snackbar = UI.Alert.useSnackbar();
  const [saving, setSaving] = useState(false);
  if (!credits || !builderKey) return null;

  const ownKey = builderKey.options.find(
    option => option.id === builderKey.llmId
  );
  const extra = Math.max(0, credits.used - credits.included);

  const choose = async (value: string) => {
    if (value === (builderKey.llmId ?? CREDITS)) return;
    setSaving(true);
    try {
      const result = await request(
        `/organization/${organizationId}/builder/settings`,
        { method: 'PUT', body: { llmId: value === CREDITS ? null : value } }
      );
      if (!result.ok) {
        snackbar.error(result.error || t('errorSend'));
        return;
      }
      onChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="assistant-month">
      <div className="assistant-month-line">
        <AutoAwesomeOutlined fontSize="small" />
        <span>
          {ownKey
            ? t('creditsOwnKey')
            : t('creditsUsed', {
                used: t.n(Math.min(credits.used, credits.included)),
                included: t.n(credits.included)
              })}
        </span>
      </div>
      {!ownKey && extra > 0 && (
        <p className="assistant-month-extra">
          {t('creditsExtra', { extra: t.n(extra), cap: t.n(credits.cap) })}
        </p>
      )}
      {!ownKey && !credits.allowed && (
        <p className="assistant-month-out">{t('creditsUsedUp')}</p>
      )}
      {builderKey.canManage && builderKey.options.length > 0 && (
        <UI.Select
          label={t('creditsPayWith')}
          name="assistantKey"
          size="small"
          value={builderKey.llmId ?? CREDITS}
          disabled={saving}
          options={[
            { value: CREDITS, label: t('creditsGanju') },
            ...builderKey.options.map(option => ({
              value: option.id,
              label: option.name
            }))
          ]}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            choose(event.target.value)
          }
        />
      )}
    </div>
  );
};
