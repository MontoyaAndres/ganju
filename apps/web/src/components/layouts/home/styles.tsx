import { css } from '@emotion/react';
import styled from '@emotion/styled';

interface IProps {
  userPhoto?: string;
}

interface IMobileMenuWrapperProps {
  userPhoto?: string;
}

export const Wrapper = styled.nav<IProps>`
  ${({ theme, userPhoto }) => css`
    .container-navbar {
      .navbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 12px;
        width: 100%;
        position: fixed;
        top: 0;
        right: 0;
        z-index: 10;
        background-color: ${theme.colors.white};

        @media (min-width: ${theme.screens.xl}) {
          display: none;
          padding: 24px 20px;
          width: calc(100% - 93px);
        }
      }

      .sub-navbar {
        display: none;

        @media (min-width: ${theme.screens.xl}) {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 10;
          width: 93px;
          height: 100vh;
          padding: 20px 12px;
          display: flex;
          flex-direction: column;
          align-items: center;
          background-color: ${theme.colors.white};
          border-right: 1px solid ${theme.colors.bastille}1A;
        }

        .sub-navbar-icon {
          width: 60px;
          height: 60px;
          display: flex;
          justify-content: center;
          align-items: center;
          border-radius: 12px;
          cursor: pointer;
          transition: background-color 0.15s ease;

          &:hover,
          &.is-open {
            background-color: ${theme.colors.bastille}0A;
          }

          & > svg {
            width: 28px;
            height: 28px;
            fill: ${theme.colors.bastille};
          }
        }

        .sub-navbar-options {
          display: flex;
          flex-direction: column;
          align-items: center;
          grid-gap: 14px;
          margin-top: 16px;

          .MuiButtonBase-root {
            padding: 8px 14px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-transform: none;
            margin: 0;
            border-radius: 16px;
            width: 69px;

            .button-text {
              color: ${theme.colors.bastille};
              font-size: ${theme.fonts.base};
              font-style: normal;
              font-weight: 400;
              line-height: 110%;
              margin-top: 8px;
            }

            & > svg {
              fill: ${theme.colors.saltBox};

              & > path {
                fill: ${theme.colors.saltBox};
              }
            }

            &.active {
              background-color: ${theme.colors.bastille}0A;

              .button-text {
                font-weight: 700;
              }

              & > svg {
                fill: ${theme.colors.bastille};

                & > path {
                  fill: ${theme.colors.bastille};
                }
              }
            }
          }
        }

        .sub-navbar-user {
          width: 44px;
          height: 44px;
          border-radius: 9999px;
          background-image: url('${userPhoto}');
          background-size: cover;
          background-position: center;
          background-color: ${theme.colors.bastille};
          margin-top: auto;
          cursor: pointer;
        }
      }

      .header-logo {
        display: flex;
        align-items: center;
        grid-gap: 4px;
        cursor: pointer;

        @media (min-width: ${theme.screens.xl}) {
          display: none;
        }

        .header-logo-text {
          color: ${theme.colors.bastille};
          text-align: center;
          font-size: ${theme.fonts.xl};
          font-weight: 700;
        }
      }

      .account-menu {
        position: fixed;
        bottom: 24px;
        left: 90px;
        z-index: 20;
        width: 328px;
        background-color: ${theme.colors.white};
        border-radius: 8px;
        box-shadow: ${theme['custom-shadows'].smallest};

        .account-menu-person {
          padding: 16px;
          display: flex;
          align-items: center;
          grid-gap: 16px;

          .account-menu-person-pic {
            width: 40px;
            height: 40px;
            border-radius: 9999px;
            border: 1px solid ${theme.colors.white};
            background-image: url('${userPhoto}');
            background-size: cover;
            background-position: center;
            background-color: ${theme.colors.bastille};
          }

          .account-menu-person-texts {
            .account-menu-person-title {
              color: ${theme.colors.bastille};
              font-size: ${theme.fonts.base};
              font-style: normal;
              font-weight: 700;
              line-height: 100%;
            }

            .account-menu-person-subtitle {
              color: ${theme.colors.bastille}A3;
              font-size: ${theme.fonts.sm};
              font-style: normal;
              font-weight: 400;
              line-height: 100%;
              margin-top: 4px;
            }
          }
        }

        .account-menu-item {
          padding: 14px 16px;
          display: flex;
          align-items: center;
          cursor: pointer;

          & > svg {
            width: 24px;
            height: 24px;
          }

          .account-menu-item-text {
            color: ${theme.colors.bastille}A3;
            font-size: ${theme.fonts.base};
            font-style: normal;
            font-weight: 700;
            line-height: 100%;
            margin-left: 12px;
          }

          &:hover,
          &.is-selected {
            background-color: ${theme.colors.bastille}0A;

            .account-menu-item-text {
              color: ${theme.colors.bastille};
            }
          }
        }
      }
    }

    .box-container {
      padding-top: 60px;

      @media (min-width: ${theme.screens.xl}) {
        padding-top: 0;
        margin-left: 93px;
      }
    }

    .projects-menu {
      position: fixed;
      top: 116px;
      left: 16px;
      z-index: 30;
      width: 328px;
      height: 100%;
      max-height: 292px;
      overflow-y: auto;
      background-color: ${theme.colors.white};
      border-radius: 8px;
      box-shadow: ${theme['custom-shadows'].smallest};

      @media (min-width: ${theme.screens.xl}) {
        top: 74px;
        left: 116px;
      }

      .projects-item-new {
        padding: 12px 8px;
        padding-left: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;

        .projects-item-new-text {
          color: ${theme.colors.bastille};
          font-size: ${theme.fonts.base};
          font-style: normal;
          font-weight: 700;
          line-height: 100%;
        }
      }

      .projects-item {
        padding: 14px 16px;
        display: grid;
        align-items: center;
        grid-template-columns: auto auto 1fr;
        cursor: pointer;

        &:hover,
        &.is-selected {
          background-color: ${theme.colors.bastille}0A;

          .projects-item-text {
            color: ${theme.colors.bastille};
          }

          .projects-item-icons {
            .projects-item-icon-settings {
              display: block;
            }
          }
        }

        &.is-selected {
          background-color: ${theme.colors.bastille}0A;

          .projects-item-icons {
            .projects-item-icon-check {
              display: block;
            }
          }
        }

        .projects-item-text {
          color: ${theme.colors.bastille}A3;
          font-size: ${theme.fonts.base};
          font-style: normal;
          font-weight: 500;
          line-height: 100%;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .projects-item-measure {
          padding: 4px 10px;
          border-radius: 100px;
          border: 1px solid ${theme.colors.alto};
          color: ${theme.colors.saltBox};
          font-size: ${theme.fonts.sm};
          font-style: normal;
          font-weight: 400;
          line-height: 100%;
          letter-spacing: -0.26px;
          width: fit-content;
          justify-self: end;
        }

        .projects-item-icons {
          height: 24px;
          display: flex;
          justify-self: end;

          .projects-item-icon-check {
            margin-right: 8px;
          }

          .projects-item-icon-check {
            width: 24px;
            height: 24px;
            fill: ${theme.colors.bastille};
            display: none;
          }
        }
      }
    }
  `}
`;

export const MobileMenuWrapper = styled.div<IMobileMenuWrapperProps>`
  ${({ theme, userPhoto }) => css`
    @media (min-width: ${theme.screens.xl}) {
      display: none;
    }

    .background {
      background-color: ${theme.colors.bastille}99;
      width: 100vw;
      height: 100vh;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 20;
    }

    .mobile-menu {
      background-color: ${theme.colors.white};
      width: calc(100% - 40px);
      height: 100vh;
      position: fixed;
      top: 0;
      left: 0;
      z-index: 30;
      box-shadow: ${theme['custom-shadows'].small};

      .mobile-menu-user {
        padding: 14px 16px;
        display: grid;
        align-items: center;
        grid-template-columns: 40px 1fr 40px;
        grid-gap: 8px;

        .mobile-menu-user-pic {
          width: 40px;
          height: 40px;
          border-radius: 9999px;
          background-image: url(${userPhoto});
          background-size: cover;
          background-position: center;
          background-color: ${theme.colors.bastille};
        }

        .mobile-menu-user-texts {
          .mobile-menu-user-title {
            color: ${theme.colors.bastille};
            font-size: ${theme.fonts.base};
            font-style: normal;
            font-weight: 700;
            line-height: 100%;
            width: 90%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .mobile-menu-user-subtitle {
            color: ${theme.colors.bastille}A3;
            font-size: ${theme.fonts.sm};
            font-style: normal;
            font-weight: 400;
            line-height: 100%;
            margin-top: 4px;
            width: 90%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }
      }

      .options {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: calc(100vh - 68px);
        overflow-y: auto;

        .MuiButtonBase-root {
          padding: 14px 16px;
          justify-content: flex-start;
          align-items: center;
          text-transform: none;
          margin: 0;
          border-radius: 0;

          .button-text {
            color: ${theme.colors.bastille};
            font-size: ${theme.fonts.base};
            font-style: normal;
            font-weight: 400;
            line-height: 110%;
            margin-top: 4px;
            margin-left: 12px;
          }

          & > svg {
            fill: ${theme.colors.saltBox};

            & > path {
              fill: ${theme.colors.saltBox};
            }
          }

          &.active {
            background-color: ${theme.colors.bastille}0A;

            .button-text {
              font-weight: 700;
            }

            & > svg {
              fill: ${theme.colors.bastille};

              & > path {
                fill: ${theme.colors.bastille};
              }
            }
          }
        }
      }
    }
  `}
`;

export const OrgSwitcherWrapper = styled.div`
  ${({ theme }) => css`
    .switcher-backdrop {
      position: fixed;
      inset: 0;
      background-color: ${theme.colors.bastille}66;
      z-index: 40;
    }

    .switcher-panel {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 50;
      background-color: ${theme.colors.white};
      display: flex;
      flex-direction: column;
      overflow: hidden;

      @media (min-width: ${theme.screens.xl}) {
        top: 20px;
        left: 104px;
        right: auto;
        bottom: auto;
        width: 560px;
        height: 440px;
        border-radius: 12px;
        box-shadow: ${theme['custom-shadows'].smallest};
      }
    }

    .switcher-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid ${theme.colors.alto};

      .switcher-header-title {
        color: ${theme.colors.bastille};
        font-size: ${theme.fonts.lg};
        font-weight: 700;
        margin: 0;
      }

      .MuiButtonBase-root svg {
        width: 20px;
        height: 20px;
      }
    }

    .switcher-columns {
      display: none;

      @media (min-width: ${theme.screens.xl}) {
        flex: 1;
        display: grid;
        grid-template-columns: 230px 1fr;
        overflow: hidden;
      }
    }

    .switcher-mobile {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;

      @media (min-width: ${theme.screens.xl}) {
        display: none;
      }
    }

    .switcher-mobile-list {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px 4px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .switcher-accordion {
      border-radius: 10px;
      overflow: hidden;

      &.is-expanded .switcher-accordion-chevron {
        transform: rotate(180deg);
      }
    }

    .switcher-accordion-header {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 12px;
      padding: 14px 14px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      border-radius: 10px;
      font-family: inherit;

      &:hover {
        background-color: ${theme.colors.bastille}0A;
      }

      &.is-active {
        background-color: ${theme.colors.bastille}14;

        .switcher-item-name {
          font-weight: 700;
        }
      }

      .switcher-accordion-chevron {
        width: 20px;
        height: 20px;
        fill: ${theme.colors.bastille}A3;
        transition: transform 0.15s ease;
      }
    }

    .switcher-accordion-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 0 12px 12px;
      margin-left: 10px;
      border-left: 2px solid ${theme.colors.alto};
    }

    .switcher-accordion-project {
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;

      &:hover {
        background-color: ${theme.colors.bastille}0A;
      }

      &.is-active {
        background-color: ${theme.colors.bastille}14;

        .switcher-item-name {
          font-weight: 700;
        }
      }
    }

    .switcher-accordion-new {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border: none;
      background: none;
      color: ${theme.colors.bastille}A3;
      font-size: ${theme.fonts.sm};
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      text-align: left;
      font-family: inherit;

      & > svg {
        width: 16px;
        height: 16px;
        fill: ${theme.colors.bastille}A3;
      }

      &:hover {
        color: ${theme.colors.bastille};
        background-color: ${theme.colors.bastille}0A;

        & > svg {
          fill: ${theme.colors.bastille};
        }
      }
    }

    .switcher-column {
      display: flex;
      flex-direction: column;
      min-height: 0;

      @media (min-width: ${theme.screens.xl}) {
        overflow: hidden;
      }

      & + .switcher-column {
        border-top: 1px solid ${theme.colors.alto};

        @media (min-width: ${theme.screens.xl}) {
          border-top: none;
          border-left: 1px solid ${theme.colors.alto};
        }
      }
    }

    .switcher-column-label {
      padding: 12px 16px 6px;
      font-size: ${theme.fonts.sm};
      font-weight: 700;
      color: ${theme.colors.bastille}A3;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .switcher-list {
      padding: 4px 8px 8px;

      @media (min-width: ${theme.screens.xl}) {
        flex: 1;
        overflow-y: auto;
      }
    }

    .switcher-item {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 10px;
      cursor: pointer;
      user-select: none;

      &:hover {
        background-color: ${theme.colors.bastille}0A;
      }

      &.is-selected {
        background-color: ${theme.colors.bastille}14;
      }

      &.is-active {
        background-color: ${theme.colors.bastille}14;

        .switcher-item-name {
          font-weight: 700;
        }
      }
    }

    .switcher-item-texts {
      min-width: 0;
    }

    .switcher-item-name {
      color: ${theme.colors.bastille};
      font-size: ${theme.fonts.base};
      font-weight: 500;
      line-height: 120%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .switcher-item-meta {
      color: ${theme.colors.bastille}A3;
      font-size: ${theme.fonts.sm};
      font-weight: 400;
      line-height: 120%;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .switcher-item-count {
      color: ${theme.colors.saltBox};
      font-size: ${theme.fonts.sm};
      font-weight: 500;
      padding: 2px 10px;
      border-radius: 100px;
      border: 1px solid ${theme.colors.alto};
    }

    .switcher-empty {
      padding: 16px;
      color: ${theme.colors.bastille}A3;
      font-size: ${theme.fonts.sm};
      text-align: center;
    }

    .switcher-accordion-skeleton {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 14px;
      border-radius: 10px;
    }

    .switcher-accordion-skeleton-texts {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .switcher-list-skeleton {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .switcher-item-skeleton {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 10px;
    }

    .switcher-item-skeleton-texts {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .switcher-footer {
      padding: 10px 12px;
      border-top: 1px solid ${theme.colors.alto};

      .MuiButtonBase-root {
        width: 100%;
        justify-content: flex-start;
        text-transform: none;
        padding: 8px 12px;
        border-radius: 8px;
        color: ${theme.colors.bastille};
        font-size: ${theme.fonts.base};
        font-weight: 500;

        & > svg {
          width: 18px;
          height: 18px;
          margin-right: 8px;
          fill: ${theme.colors.bastille};
        }
      }
    }
  `}
`;

export const ModalOverlay = styled.div`
  ${({ theme }) => css`
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    padding: 0;

    @media (min-width: ${theme.screens.md}) {
      padding: 16px;
    }
  `}
`;

export const ModalDialog = styled.div`
  ${({ theme }) => css`
    background-color: ${theme.colors.white};
    border-radius: 12px;
    width: 100%;
    height: 100vh;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
    position: relative;

    @media (min-width: ${theme.screens.md}) {
      height: calc(100% - 10vh);
    }

    .profile-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid ${theme.colors.alto};

      .profile-modal-title {
        font-size: ${theme.fonts.lg};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .MuiButtonBase-root {
        display: flex;
        justify-content: center;
        align-items: center;

        svg {
          width: 20px;
          height: 20px;
          margin: 0;
        }
      }
    }

    .profile-modal-body {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;

      .profile-avatar-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 12px 0;

        .profile-avatar-preview {
          width: 88px;
          height: 88px;
          border-radius: 9999px;
          background-color: ${theme.colors.bastille}1A;
          background-size: cover;
          background-position: center;
          border: 1px solid ${theme.colors.alto};
        }

        .profile-avatar-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
        }
      }

      .profile-linked-accounts {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid ${theme.colors.alto};

        .profile-section-title {
          font-size: ${theme.fonts.sm};
          font-weight: 700;
          color: ${theme.colors.bastille};
          margin: 4px 0 4px 0;
        }

        .profile-linked-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;

          .profile-linked-info {
            display: flex;
            align-items: center;
            gap: 10px;

            & > svg {
              width: 20px;
              height: 20px;
              color: ${theme.colors.bastille};
            }

            .profile-linked-label {
              font-size: ${theme.fonts.sm};
              font-weight: 600;
              color: ${theme.colors.bastille};
            }

            .profile-linked-badge {
              font-size: 10px;
              font-weight: 700;
              color: ${theme.colors.japaneseLaurel};
              background-color: ${theme.colors.peppermint};
              padding: 2px 6px;
              border-radius: 8px;
              text-transform: uppercase;
              letter-spacing: 0.4px;
            }
          }
        }
      }
    }

    .profile-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 20px;
      border-top: 1px solid ${theme.colors.alto};
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
    }

    .MuiButtonBase-root {
      font-size: ${theme.fonts.base};
      padding: 6px 16px;
      min-height: 0;
      border-radius: 6px;
      text-transform: none;
      color: ${theme.colors.bastille};

      & > svg {
        width: 14px;
        height: 14px;
        margin-right: 4px;
      }

      .button-text {
        font-size: ${theme.fonts.base};
      }

      &.MuiButton-contained {
        background-color: ${theme.colors.bastille};
        color: ${theme.colors.white};
      }
    }
  `}
`;

export const NoAccessWrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 60px);
    padding: 24px;

    @media (min-width: ${theme.screens.xl}) {
      min-height: 100vh;
    }

    .no-access-card {
      width: 100%;
      max-width: 420px;
      text-align: center;
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 16px;
      padding: 40px 32px;

      .no-access-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 18px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${theme.colors.red}14;
        color: ${theme.colors.red};

        svg {
          width: 28px;
          height: 28px;
        }
      }

      .no-access-title {
        font-size: ${theme.fonts.xl};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
        line-height: 1.3;
      }

      .no-access-text {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 12px 0 0;
        line-height: 1.55;
      }

      .no-access-actions {
        margin-top: 24px;

        .MuiButtonBase-root {
          text-transform: none;
          font-size: ${theme.fonts.sm};
          padding: 9px 18px;
          border-radius: 10px;
          width: auto;
        }
      }
    }
  `}
`;
