import { css, keyframes } from '@emotion/react';
import styled from '@emotion/styled';

const slideIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

// Modals sit at 1300. Confirmations go above them, since one is often opened
// from a modal, and toasts above both, so one fired from either is seen.
export const SnackbarContainer = styled.div`
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
`;

export const Snackbar = styled.div<{ variant: 'success' | 'error' }>`
  ${({ theme, variant }) => css`
    pointer-events: auto;
    min-width: 280px;
    max-width: 420px;
    padding: 12px 16px;
    border-radius: 8px;
    background-color: ${variant === 'success'
      ? theme.colors.fernGreen
      : theme.colors.red};
    color: ${theme.colors.white};
    box-shadow: ${theme['custom-shadows'].small};
    font-size: ${theme.fonts.sm};
    font-weight: 500;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    animation: ${slideIn} 180ms ease-out;

    .snackbar-message {
      flex: 1;
      line-height: 1.4;
      word-break: break-word;
    }

    .snackbar-close {
      background: transparent;
      border: none;
      color: ${theme.colors.white};
      font-size: ${theme.fonts.lg};
      cursor: pointer;
      padding: 0;
      line-height: 1;
      opacity: 0.8;

      &:hover {
        opacity: 1;
      }
    }
  `}
`;

export const Overlay = styled.div`
  ${({ theme }) => css`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: ${theme.colors.bastille}66;
    z-index: 1400;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `}
`;

export const Dialog = styled.div`
  ${({ theme }) => css`
    background-color: ${theme.colors.white};
    border-radius: 12px;
    box-shadow: ${theme['custom-shadows'].smallest};
    width: 100%;
    max-width: 400px;
    padding: 24px;

    .alert-title {
      font-size: ${theme.fonts.lg};
      font-weight: 700;
      color: ${theme.colors.bastille};
      margin: 0 0 8px 0;
    }

    .alert-description {
      font-size: ${theme.fonts.base};
      color: ${theme.colors.bastille}99;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }

    .alert-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `}
`;
