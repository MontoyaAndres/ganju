import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: calc(100vh - 130px);
    padding: 24px 20px 32px;

    .error-card {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      text-align: center;
    }

    .error-code {
      font-size: ${theme.fonts['3xl']};
      font-weight: 700;
      color: ${theme.colors.bastille}66;
      line-height: 100%;
      margin: 0;
    }

    .error-title {
      font-size: ${theme.fonts.xl};
      font-weight: 700;
      color: ${theme.colors.bastille};
      line-height: 120%;
      margin: 0;
    }

    .error-text {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}CC;
      line-height: 140%;
      margin: 0;
    }

    .error-actions {
      margin-top: 8px;
    }
  `}
`;
