import { useRouter } from 'next/router';
import { UI } from '@ganju/ui';

import { Wrapper } from './styles';
import { i18n } from '../../../lib';

interface IProps {
  /** The HTTP status this page stands in for — `404` or `500`. */
  code: number;
  title: string;
  text: string;
}

/**
 * What `pages/404.tsx` and `pages/500.tsx` render.
 *
 * Next ships its own versions of both, and they are English whatever the URL
 * says — the one pair of pages a Spanish visitor can reach that the locale
 * never touched. The copy arrives as props so the two pages can keep their own
 * wording while sharing everything else.
 */
export const Error = (props: IProps) => {
  const { code, title, text } = props;
  const router = useRouter();
  const c = i18n.useT(i18n.copy.COMMON);

  return (
    <Wrapper>
      <div className="error-card">
        <p className="error-code">{code}</p>
        <h1 className="error-title">{title}</h1>
        <p className="error-text">{text}</p>
        <div className="error-actions">
          <UI.Button
            variant="contained"
            size="small"
            // `push` keeps the active locale, so a Spanish reader lands on
            // `/es` rather than being sent back to English.
            onClick={() => router.push('/')}
          >
            {c('backHome')}
          </UI.Button>
        </div>
      </div>
    </Wrapper>
  );
};
