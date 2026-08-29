import { css } from '@emotion/react';
import styled from '@emotion/styled';

interface DialogProps {
  width?: number;
  maxHeight?: string;
}

export const Overlay = styled.div`
  ${({ theme }) => css`
    position: fixed;
    inset: 0;
    background-color: ${theme.colors.bastille}80;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    z-index: 1300;
    padding: 0;

    @media (min-width: ${theme.screens.md}) {
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
  `}
`;

export const Dialog = styled.div<DialogProps>`
  ${({ theme, width = 720, maxHeight = '85vh' }) => css`
    background-color: ${theme.colors.white};
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    @media (min-width: ${theme.screens.md}) {
      width: 100%;
      max-width: ${width}px;
      height: auto;
      max-height: ${maxHeight};
      border-radius: 12px;
      box-shadow: ${theme['custom-shadows'].small};
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid ${theme.colors.alto};

      @media (min-width: ${theme.screens.md}) {
        padding: 18px 20px;
      }

      .modal-title {
        flex: 1;
        margin: 0;
        font-size: ${theme.fonts.base};
        font-weight: 700;
        color: ${theme.colors.bastille};

        @media (min-width: ${theme.screens.md}) {
          font-size: ${theme.fonts.lg};
        }
      }

      .modal-close {
        flex-shrink: 0;
      }
    }

    .modal-body {
      flex: 1;
      overflow: auto;
      padding: 14px 16px;

      @media (min-width: ${theme.screens.md}) {
        padding: 16px 20px;
      }
    }

    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid ${theme.colors.alto};

      .MuiButtonBase-root {
        font-size: ${theme.fonts.base};
        padding: 6px 16px;
        min-height: 0;
        border-radius: 6px;
        text-transform: none;
        color: ${theme.colors.white};
      }

      @media (min-width: ${theme.screens.md}) {
        padding: 14px 20px;
      }
    }
  `}
`;
