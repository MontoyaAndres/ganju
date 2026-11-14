import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: calc(100dvh - 130px);
    padding: 24px 20px 32px;

    .link-card {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .link-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: center;
    }

    .link-title {
      font-size: ${theme.fonts['3xl']};
      font-weight: 700;
      color: ${theme.colors.bastille};
      line-height: 120%;
      margin: 0;
    }

    .link-subtitle {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}CC;
      line-height: 140%;
      margin: 0;
    }

    .link-form {
      display: flex;
      flex-direction: column;
      gap: 14px;

      .MuiButtonBase-root {
        font-size: ${theme.fonts.base};
        padding: 10px 20px;
      }
    }

    .link-success {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;

      .link-success-icon {
        color: ${theme.colors.fernGreen};
        font-size: 52px;
      }

      .link-success-title {
        font-size: ${theme.fonts['2xl']};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .link-success-text {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}CC;
        line-height: 140%;
        margin: 0;
      }
    }
  `}
`;
