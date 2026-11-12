import { useEffect, useState } from 'react';
import { UI } from '@ganju/ui';
import { utils } from '@ganju/utils';

import { i18n } from '../../../lib';

const MAX = utils.constants.BOT_INSTRUCTIONS_MAX_LENGTH;

export const BotInstructions = ({
  organizationId,
  projectId,
  open,
  onClose
}: {
  organizationId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
}) => {
  const t = i18n.useT(i18n.copy.CHANNELS);
  const c = i18n.useT(i18n.copy.COMMON);
  const snackbar = UI.Alert.useSnackbar();
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const url = `/organization/${organizationId}/project/${projectId}`;

  // Read again on every open: the assistant may have changed them.
  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    const controller = new AbortController();
    (async () => {
      try {
        const data = await utils.fetcher({
          url,
          config: { credentials: 'include', signal: controller.signal }
        });
        if (controller.signal.aborted) return;
        // Saving over a failed read would wipe them.
        if (!Array.isArray(data) || !data[0]) throw new Error();
        setValue(data[0].botInstructions ?? '');
        setLoaded(true);
      } catch {
        if (!controller.signal.aborted)
          snackbar.error(t('botInstructionsLoadFailed'));
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, url]);

  const save = async () => {
    if (saving || !loaded || value.length > MAX) return;
    setSaving(true);
    try {
      const result = await utils.fetcher({
        url: `${url}/bot-instructions`,
        config: {
          method: 'PUT',
          credentials: 'include',
          body: JSON.stringify({ botInstructions: value })
        }
      });
      if (!result || result.error) throw new Error();
      snackbar.success(t('botInstructionsSaved'));
      onClose();
    } catch {
      snackbar.error(t('botInstructionsSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <UI.Modal
      open={open}
      title={t('botInstructions')}
      closeLabel={c('close')}
      onClose={onClose}
      footer={
        <>
          <UI.Button variant="outlined" size="small" onClick={onClose}>
            <span className="button-text">{c('cancel')}</span>
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            onClick={save}
            disabled={saving || !loaded || value.length > MAX}
          >
            <span className="button-text">{t('botInstructionsSave')}</span>
          </UI.Button>
        </>
      }
    >
      <p>{t('botInstructionsHelp')}</p>
      <UI.Input
        label={t('botInstructions')}
        placeholder={t('botInstructionsPlaceholder')}
        value={value}
        onChange={event => setValue(event.target.value)}
        multiline
        minRows={5}
        maxRows={14}
        fullWidth
        disabled={!loaded || saving}
        error={value.length > MAX}
        helperText={t('botInstructionsCount', {
          count: t.n(value.length),
          max: t.n(MAX)
        })}
      />
    </UI.Modal>
  );
};
