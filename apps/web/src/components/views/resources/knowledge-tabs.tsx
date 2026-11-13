import Link from 'next/link';
import { useRouter } from 'next/router';
import { css } from '@emotion/react';
import styled from '@emotion/styled';

import { i18n } from '../../../lib';

const Tabs = styled.nav`
  ${({ theme }) => css`
    display: inline-flex;
    gap: 4px;
    padding: 3px;
    margin: 10px 0 2px;
    border-radius: 8px;
    background: ${theme.colors.bastille}0a;

    a {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}b3;
      text-decoration: none;

      &.active {
        background: ${theme.colors.white};
        color: ${theme.colors.bastille};
        font-weight: 600;
        box-shadow: 0 1px 2px ${theme.colors.bastille}1a;
      }
    }
  `}
`;

// Resources and prompts are one "Knowledge" section with a page each.
export const KnowledgeTabs = ({
  current
}: {
  current: 'resources' | 'prompts';
}) => {
  const { query } = useRouter();
  const t = i18n.useT(i18n.copy.RESOURCES);
  const p = i18n.useT(i18n.copy.PROMPTS);
  const base = `/organization/${query.id}/project/${query.projectId}`;
  const tabs = [
    { page: 'resources', label: t('title') },
    { page: 'prompts', label: p('title') }
  ] as const;

  return (
    <Tabs aria-label={t('knowledgeTitle')}>
      {tabs.map(tab => (
        <Link
          key={tab.page}
          href={`${base}/${tab.page}`}
          className={tab.page === current ? 'active' : ''}
          aria-current={tab.page === current ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </Tabs>
  );
};
