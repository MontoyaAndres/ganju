import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: ${theme.colors.bastille}08;

    .invitation-card {
      width: 100%;
      max-width: 440px;
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 16px;
      padding: 36px 32px;
      text-align: center;

      .invitation-eyebrow {
        font-size: ${theme.fonts.xs};
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${theme.colors.bastille}80;
        margin: 0 0 12px;
      }

      .invitation-title {
        font-size: ${theme.fonts['2xl']};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
        line-height: 1.25;
      }

      .invitation-target {
        font-weight: 700;
      }

      .invitation-text {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 12px 0 0;
        line-height: 1.55;
      }

      .invitation-scope {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${theme.colors.bastille}99;
        background: ${theme.colors.bastille}0d;
        border-radius: 4px;
        padding: 3px 8px;
        margin-top: 14px;
      }

      .invitation-actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 24px;

        .MuiButtonBase-root {
          text-transform: none;
          font-size: ${theme.fonts.sm};
          padding: 9px 16px;
          border-radius: 10px;
          width: 100%;
        }
      }

      .invitation-note {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
        margin: 16px 0 0;
        line-height: 1.5;
      }

      .invitation-language {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
        margin: 24px 0 0;

        a {
          color: inherit;
          font-weight: 700;
          text-decoration: underline;
        }
      }
    }
  `}
`;
