import { ReactNode, useEffect } from 'react';
import IconButton from '@mui/material/IconButton';
import { Close } from '@mui/icons-material';

import { Portal } from '../portal';
import { Overlay, Dialog } from './styles';

export interface IProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  maxHeight?: string;
  closeOnBackdrop?: boolean;
  closeLabel?: string;
}

export const Modal = (props: IProps) => {
  const {
    open,
    title,
    onClose,
    children,
    footer,
    width,
    maxHeight,
    closeOnBackdrop = true,
    closeLabel = 'Close'
  } = props;

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <Overlay
        onClick={() => {
          if (closeOnBackdrop) onClose();
        }}
      >
        <Dialog
          width={width}
          maxHeight={maxHeight}
          role="dialog"
          aria-modal="true"
          onClick={e => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <IconButton
              className="modal-close"
              size="small"
              onClick={onClose}
              aria-label={closeLabel}
            >
              <Close />
            </IconButton>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </Dialog>
      </Overlay>
    </Portal>
  );
};
