import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    min-width: 0;

    .MuiBreadcrumbs-root {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};

      .MuiBreadcrumbs-li {
        min-width: 0;
      }

      .MuiBreadcrumbs-separator {
        color: ${theme.colors.bastille}66;
        margin: 0 6px;
      }
    }

    .breadcrumb-item {
      max-width: 220px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: transparent;
      padding: 4px 6px;
      border-radius: 6px;
      cursor: pointer;
      font-size: inherit;
      font-family: inherit;
      color: ${theme.colors.bastille}99;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      & > svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      &:hover:not(:disabled) {
        background-color: ${theme.colors.bastille}08;
        color: ${theme.colors.bastille};
      }

      &.current {
        color: ${theme.colors.bastille};
        font-weight: 600;
        cursor: default;
      }

      &:disabled {
        cursor: default;
      }
    }
  `}
`;
