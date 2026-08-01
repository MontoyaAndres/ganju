import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 130px);
    padding: 24px 20px 32px;

    @media (min-width: ${theme.screens.md}) {
      padding: 0;
    }

    .login-content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      flex: 1;
      width: 100%;

      .login-content-texts {
        width: 100%;
        max-width: 520px;
        display: flex;
        flex-direction: column;
        align-items: center;

        .login-content-subtitle {
          font-size: ${theme.fonts['4xl']};
          color: ${theme.colors.bastille};
          font-weight: 400;
          line-height: 120%;
          text-align: center;
          display: block;

          @media (min-width: ${theme.screens.md}) {
            font-size: calc(${theme.fonts['5xl']} + 4px);
            display: initial;
          }
        }

        .login-content-title {
          font-size: ${theme.fonts['4xl']};
          color: ${theme.colors.bastille};
          font-weight: 700;
          line-height: 120%;
          text-align: center;
          display: block;

          @media (min-width: ${theme.screens.md}) {
            font-size: calc(${theme.fonts['5xl']} + 4px);
            display: initial;
          }
        }
      }

      .login-content-buttons {
        display: grid;
        grid-gap: 14px;
        margin-top: 28px;
        width: 100%;
        max-width: 320px;

        @media (min-width: ${theme.screens.md}) {
          grid-gap: 20px;
          max-width: 360px;
        }

        .MuiButtonBase-root {
          font-size: ${theme.fonts.base};
          padding: 10px 20px;
        }
      }
    }

    .terms-consent {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 20px;
      width: 100%;
      max-width: 320px;
      cursor: pointer;
      color: ${theme.colors.bastille}CC;
      font-size: ${theme.fonts.sm};
      line-height: 140%;
      text-align: left;

      @media (min-width: ${theme.screens.md}) {
        max-width: 360px;
      }

      & > input {
        margin: 2px 0 0;
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        cursor: pointer;
        accent-color: ${theme.colors.bastille};
      }

      & a {
        color: ${theme.colors.bastille};
        text-decoration-line: underline;
      }
    }

    .terms {
      text-align: center;
      color: ${theme.colors.bastille}CC;
      font-size: ${theme.fonts.sm};
      font-style: normal;
      font-weight: 400;
      line-height: 130%;
      margin-top: 32px;

      @media (min-width: ${theme.screens.md}) {
        position: fixed;
        bottom: 30px;
        left: 0;
        width: 100%;
        margin-top: 0;
        padding: 0 20px;
      }

      @media (min-width: ${theme.screens.xl}) {
        padding: 0;
      }

      & > a {
        color: ${theme.colors.bastille}CC;
        font-size: ${theme.fonts.sm};
        font-style: normal;
        font-weight: 400;
        line-height: 130%;
        text-decoration-line: underline;
      }
    }
  `}
`;
