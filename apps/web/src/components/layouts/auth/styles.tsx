import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    .logo {
      padding-top: 32px;
      display: grid;
      justify-items: center;

      @media (min-width: ${theme.screens.xl}) {
        padding-top: 40px;
      }

      .logo-image {
        background-image: url('/favicon.svg');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        width: 50px;
        height: 50px;

        @media (min-width: ${theme.screens.xl}) {
          width: 56px;
          height: 56px;
        }
      }

      .logo-text {
        font-size: ${theme.fonts.xl};
        color: ${theme.colors.bastille};
        font-weight: 700;
        margin-top: 4px;
      }
    }
  `}
`;
