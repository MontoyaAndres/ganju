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

    .approval-card {
      width: 100%;
      max-width: 440px;
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 16px;
      padding: 36px 32px;
      text-align: center;

      .approval-eyebrow {
        font-size: ${theme.fonts.xs};
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${theme.colors.bastille}80;
        margin: 0 0 12px;
      }

      .approval-title {
        font-size: ${theme.fonts['2xl']};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
        line-height: 1.25;
      }

      .approval-target {
        font-weight: 700;
      }

      .approval-text {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 12px 0 0;
        line-height: 1.55;
      }

      .approval-scope {
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

      .approval-tool code {
        font-family: monospace;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
        background: ${theme.colors.bastille}0d;
        border-radius: 4px;
        padding: 2px 6px;
        overflow-wrap: anywhere;
      }

      .approval-arguments {
        text-align: left;
        margin-top: 20px;

        .approval-arguments-heading {
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: ${theme.colors.bastille}80;
          margin: 0 0 8px;
        }

        dl {
          margin: 0;
          border: 1px solid ${theme.colors.bastille}1a;
          border-radius: 10px;
          padding: 4px 12px;
        }

        .approval-argument {
          padding: 8px 0;
          border-bottom: 1px solid ${theme.colors.bastille}0d;

          &:last-of-type {
            border-bottom: none;
          }
        }

        dt {
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          color: ${theme.colors.bastille}99;
          margin: 0 0 4px;
        }

        dd {
          margin: 0;
          font-family: monospace;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille};
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          max-height: 240px;
          overflow-y: auto;
        }
      }

      .approval-actions {
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

      .approval-note {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
        margin: 16px 0 0;
        line-height: 1.5;
      }

      .approval-language {
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
