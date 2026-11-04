import { css } from '@emotion/react';
import styled from '@emotion/styled';

import type { Theme } from '@emotion/react';

// UI.Button is sized for forms on its own; inside the panel and the dialog it
// matches the dashboard's compact buttons.
const buttonReset = (theme: Theme) => css`
  .MuiButtonBase-root.MuiButton-root {
    font-size: 14px;
    padding: 6px 14px;
    min-height: 0;
    border-radius: 8px;
    text-transform: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: auto;
    white-space: nowrap;

    .button-text {
      font-weight: 600;
    }

    & > svg {
      width: 18px;
      height: 18px;
    }
  }

  .MuiButtonBase-root.MuiButton-text,
  .MuiButtonBase-root.MuiButton-outlined {
    color: inherit;
  }

  .MuiButtonBase-root.MuiButton-outlined {
    border: 1px solid ${theme.colors.alto};
  }
`;

export const TemplatesWrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 16px;
    font-size: ${theme.fonts.sm};
    color: ${theme.colors.bastille};

    ${buttonReset(theme)}

    p {
      margin: 0;
      line-height: 1.5;
    }

    code {
      font-size: ${theme.fonts.xs};
      padding: 1px 6px;
      border-radius: 4px;
      background: ${theme.colors.bastille}0d;
    }

    .templates-hint {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
    }

    .templates-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .templates-notice {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid ${theme.colors.alto};
      background: ${theme.colors.bastille}05;

      ol {
        margin: 0;
        padding-left: 18px;
        font-size: ${theme.fonts.xs};
        line-height: 1.6;
      }
    }

    .templates-notice-title {
      font-weight: 600;
    }

    .templates-error {
      color: ${theme.colors.red};
      font-size: ${theme.fonts.xs};
    }

    .templates-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .template-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid ${theme.colors.alto};
    }

    .template-row-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .template-row-name {
      font-weight: 600;
      word-break: break-all;
    }

    .template-row-body {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
      white-space: pre-wrap;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .template-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
  `}
`;

export const TemplateChip = styled.span<{ tone?: 'ok' | 'wait' | 'bad' }>`
  ${({ theme, tone }) => css`
    display: inline-flex;
    align-items: center;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: ${theme.fonts.xs};
    font-weight: 500;
    background: ${tone === 'ok'
      ? `${theme.colors.salem}1f`
      : tone === 'bad'
        ? `${theme.colors.red}1a`
        : tone === 'wait'
          ? '#f5a6231f'
          : `${theme.colors.bastille}0d`};
    color: ${tone === 'ok'
      ? theme.colors.salem
      : tone === 'bad'
        ? theme.colors.red
        : tone === 'wait'
          ? '#a86a00'
          : theme.colors.bastille};
  `}
`;

export const TemplateDialogContent = styled.div`
  ${({ theme }) => css`
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    font-size: ${theme.fonts.sm};
    color: ${theme.colors.bastille};

    @media (min-width: 900px) {
      grid-template-columns: minmax(0, 1fr) 280px;
    }

    ${buttonReset(theme)}

    p {
      margin: 0;
      line-height: 1.5;
    }

    .template-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .template-form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .template-hint {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
    }

    .template-section-label {
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .template-variable-add {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .template-variable {
      display: grid;
      grid-template-columns: auto 1fr 1fr;
      gap: 8px;
      align-items: center;
    }

    .template-variable-chip {
      font-family: monospace;
      font-size: ${theme.fonts.xs};
      padding: 2px 8px;
      border-radius: 6px;
      background: ${theme.colors.salem}1f;
      color: ${theme.colors.salem};
    }

    .template-buttons {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .template-button-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .template-issues {
      margin: 0;
      padding-left: 18px;
      color: ${theme.colors.red};
      font-size: ${theme.fonts.xs};
      line-height: 1.6;
    }

    .template-error {
      color: ${theme.colors.red};
      font-size: ${theme.fonts.xs};
      white-space: pre-wrap;
    }

    .template-preview {
      align-self: start;
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px 12px;
      border-radius: 12px;
      background: #efeae2;
    }

    .template-bubble {
      background: #ffffff;
      border-radius: 0 8px 8px 8px;
      padding: 8px 10px;
      box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: #111b21;
      font-size: 13px;
      word-break: break-word;
    }

    .template-bubble-header {
      font-weight: 700;
    }

    .template-bubble-body {
      white-space: pre-wrap;
    }

    .template-bubble-footer {
      font-size: 12px;
      color: #667781;
    }

    .template-bubble-reply {
      background: #ffffff;
      border-radius: 8px;
      padding: 8px;
      text-align: center;
      color: #027eb5;
      font-size: 13px;
      box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
    }
  `}
`;

// The modal's footer colors its buttons white; Cancel is a text button.
export const TemplateDialogFooter = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;

    && .MuiButtonBase-root.MuiButton-text {
      color: ${theme.colors.bastille};

      &.Mui-disabled {
        color: ${theme.colors.bastille}59;
      }
    }
  `}
`;
