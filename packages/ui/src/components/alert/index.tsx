import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react';
import MaterialButton from '@mui/material/Button';

import { Portal } from '../portal';
import { Overlay, Dialog, SnackbarContainer, Snackbar } from './styles';

declare const setTimeout: (cb: () => void, ms: number) => number;

export interface IProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  loadingText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmAlert = (props: IProps) => {
  const {
    open,
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    loadingText = 'Deleting...',
    loading = false,
    onConfirm,
    onCancel
  } = props;

  if (!open) return null;

  return (
    <Portal>
      <Overlay
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!loading) onCancel();
        }}
        onKeyDown={e => {
          if (e.key === 'Escape' && !loading) onCancel();
        }}
      >
        <Dialog
          role="alertdialog"
          aria-labelledby="alert-title"
          onClick={e => e.stopPropagation()}
        >
          <p className="alert-title" id="alert-title">
            {title}
          </p>
          {description && <p className="alert-description">{description}</p>}
          <div className="alert-actions">
            <MaterialButton size="small" onClick={onCancel} disabled={loading}>
              {cancelText}
            </MaterialButton>
            <MaterialButton
              size="small"
              variant="contained"
              color="error"
              onClick={onConfirm}
              disabled={loading}
            >
              {loading ? loadingText : confirmText}
            </MaterialButton>
          </div>
        </Dialog>
      </Overlay>
    </Portal>
  );
};

type SnackbarVariant = 'success' | 'error';

interface SnackbarItem {
  id: number;
  variant: SnackbarVariant;
  message: string;
}

export interface SnackbarContextValue {
  show: (variant: SnackbarVariant, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export interface ISnackbarProviderProps {
  children: ReactNode;
  duration?: number;
  dismissText?: string;
}

const SnackbarProvider = (props: ISnackbarProviderProps) => {
  const { children, duration = 6000, dismissText = 'Dismiss' } = props;
  const [items, setItems] = useState<SnackbarItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const show = useCallback(
    (variant: SnackbarVariant, message: string) => {
      idRef.current += 1;
      const id = idRef.current;
      setItems(prev => [...prev, { id, variant, message }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss, duration]
  );

  const value = useMemo<SnackbarContextValue>(
    () => ({
      show,
      success: message => show('success', message),
      error: message => show('error', message)
    }),
    [show]
  );

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Portal>
        <SnackbarContainer>
          {items.map(item => (
            <Snackbar
              key={item.id}
              variant={item.variant}
              role={item.variant === 'error' ? 'alert' : 'status'}
            >
              <span className="snackbar-message">{item.message}</span>
              <button
                type="button"
                className="snackbar-close"
                aria-label={dismissText}
                onClick={() => dismiss(item.id)}
              >
                x
              </button>
            </Snackbar>
          ))}
        </SnackbarContainer>
      </Portal>
    </SnackbarContext.Provider>
  );
};

const useSnackbar = (): SnackbarContextValue => {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error('useSnackbar must be used within SnackbarProvider');
  }
  return ctx;
};

export const Alert = Object.assign(ConfirmAlert, {
  SnackbarProvider,
  useSnackbar
});
