import IconButton from '@mui/material/IconButton';
import { ContentCopy } from '@mui/icons-material';

import { Wrapper } from './styles';

declare const navigator: {
  clipboard: { writeText: (s: string) => Promise<void> };
};

export interface IProps {
  label: string;
  text: string;
  meta?: string;
  variant?: 'default' | 'error';
  onCopy?: () => void;
  onCopyError?: () => void;
}

export const CopyableBlock = ({
  label,
  text,
  meta,
  variant,
  onCopy,
  onCopyError
}: IProps) => {
  const handleCopy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => onCopy?.())
      .catch(() => onCopyError?.());
  };

  return (
    <Wrapper>
      <p className="copyable-label">{label}</p>
      <div
        className={`copyable-block ${variant === 'error' ? 'is-error' : ''}`}
      >
        <IconButton
          size="small"
          className="copyable-copy"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={handleCopy}
        >
          <ContentCopy fontSize="inherit" />
        </IconButton>
        {meta && <p className="copyable-meta">{meta}</p>}
        <pre className="copyable-pre">{text || '—'}</pre>
      </div>
    </Wrapper>
  );
};
