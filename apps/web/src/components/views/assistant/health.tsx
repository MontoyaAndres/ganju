import { UI } from '@ganju/ui';
import { BuildOutlined, WarningAmberRounded } from '@mui/icons-material';

import { providerName } from './cards';
import { i18n } from '../../../lib';

import type { Translate } from '../../../lib';
import type { BuilderProblems } from './types';

export const hasProblems = (problems: BuilderProblems | null) =>
  !!problems && (problems.actions.length > 0 || problems.accounts.length > 0);

// The owner's first message for the fix, in their words; nothing is sent
// until they send it.
export const fixMessage = (
  problems: BuilderProblems,
  t: Translate<typeof i18n.copy.ASSISTANT.en>
) =>
  [
    ...problems.actions.map(action =>
      [
        t('fixMessageAction', {
          name: action.name,
          failures: t.n(action.failures),
          calls: t.n(action.calls)
        }),
        action.error ? t('fixMessageError', { error: action.error }) : ''
      ]
        .filter(Boolean)
        .join(' ')
    ),
    ...problems.accounts.map(provider =>
      t('fixMessageAccount', { provider: providerName(provider) })
    ),
    t('fixMessageAsk')
  ].join('\n');

/** What broke among the actions the assistant can fix, and the way in. */
export const AssistantHealth = ({
  problems,
  onFix
}: {
  problems: BuilderProblems | null;
  onFix: () => void;
}) => {
  const t = i18n.useT(i18n.copy.ASSISTANT);
  if (!problems || !hasProblems(problems)) return null;
  return (
    <div className="assistant-health" role="status">
      <p className="assistant-health-title">
        <WarningAmberRounded fontSize="small" />
        {t('healthTitle')}
      </p>
      <ul>
        {problems.actions.map(action => (
          <li key={action.name}>
            {t('healthAction', {
              name: action.name,
              failures: t.n(action.failures),
              calls: t.n(action.calls)
            })}
          </li>
        ))}
        {problems.accounts.map(provider => (
          <li key={provider}>
            {t('healthAccount', { provider: providerName(provider) })}
          </li>
        ))}
      </ul>
      <UI.Button size="small" variant="contained" onClick={onFix}>
        <BuildOutlined fontSize="small" />
        <span className="button-text">{t('healthFix')}</span>
      </UI.Button>
    </div>
  );
};
