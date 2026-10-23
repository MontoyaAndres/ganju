import { ReactNode, useEffect, useState } from 'react';
import { UI } from '@ganju/ui';

import { DialogContent, FooterActions } from './styles';
import { i18n } from '../../../lib';

interface ConfirmNameProps {
  open: boolean;
  title: string;
  // What goes, said plainly.
  children: ReactNode;
  // What the owner must type, exactly.
  name: string;
  confirmText: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * A destructive action that waits for the owner to type the name of what it
 * removes: a table, a column, the database.
 */
export const ConfirmName = ({
  open,
  title,
  children,
  name,
  confirmText,
  loading,
  onConfirm,
  onClose
}: ConfirmNameProps) => {
  const t = i18n.useT(i18n.copy.DATA);
  const c = i18n.useT(i18n.copy.COMMON);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const matches = typed === name;

  return (
    <UI.Modal
      open={open}
      title={title}
      closeLabel={c('close')}
      onClose={() => !loading && onClose()}
      footer={
        <FooterActions>
          <UI.Button size="small" disabled={loading} onClick={onClose}>
            {c('cancel')}
          </UI.Button>
          <UI.Button
            variant="contained"
            size="small"
            color="error"
            disabled={!matches || loading}
            onClick={onConfirm}
          >
            {loading ? c('deleting') : confirmText}
          </UI.Button>
        </FooterActions>
      }
    >
      <DialogContent>
        {children}
        <p>
          {t('typeToConfirm')} <code>{name}</code>
        </p>
        <UI.Input
          size="small"
          autoFocus
          value={typed}
          disabled={loading}
          placeholder={name}
          autoComplete="off"
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches && !loading) onConfirm();
          }}
        />
      </DialogContent>
    </UI.Modal>
  );
};
