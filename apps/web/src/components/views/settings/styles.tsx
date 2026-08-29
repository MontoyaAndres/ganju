import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px 20px 64px;

    @media (min-width: ${theme.screens.md}) {
      flex-direction: row;
      gap: 32px;
      padding: 32px;
    }

    .settings-nav {
      display: flex;
      flex-direction: row;
      gap: 4px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      -ms-overflow-style: none;
      position: sticky;
      top: 60px;
      z-index: 5;
      margin: -24px -20px 0;
      padding: 12px 20px;
      background: ${theme.colors.white};
      border-bottom: 1px solid ${theme.colors.bastille}14;

      &::-webkit-scrollbar {
        display: none;
      }

      @media (min-width: ${theme.screens.md}) {
        flex-direction: column;
        flex-shrink: 0;
        width: 200px;
        position: sticky;
        top: 24px;
        z-index: auto;
        align-self: flex-start;
        overflow-x: visible;
        margin: 0;
        padding: 0;
        background: transparent;
        border-bottom: none;
      }

      .settings-nav-item {
        appearance: none;
        background: transparent;
        border: none;
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        font-size: ${theme.fonts.sm};
        font-weight: 500;
        color: ${theme.colors.bastille}99;
        padding: 8px 12px;
        border-radius: 8px;
        white-space: nowrap;
        transition:
          background 120ms ease,
          color 120ms ease;

        &:hover {
          background: ${theme.colors.bastille}0d;
          color: ${theme.colors.bastille};
        }

        &.active {
          background: ${theme.colors.bastille}14;
          color: ${theme.colors.bastille};
          font-weight: 600;
        }

        &.danger {
          color: ${theme.colors.red};

          &:hover {
            background: ${theme.colors.red}0d;
          }

          &.active {
            background: ${theme.colors.red}14;
            color: ${theme.colors.red};
          }
        }
      }
    }

    .settings-content {
      flex: 1;
      min-width: 0;
    }

    .settings-header {
      margin-bottom: 20px;

      .settings-title {
        font-size: ${theme.fonts['2xl']};
        color: ${theme.colors.bastille};
        font-weight: 700;
        margin: 0;
      }

      .settings-subtitle {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 6px 0 0;
        line-height: 1.4;
      }
    }

    .settings-section {
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 12px;
      padding: 18px 16px;
      margin-bottom: 20px;

      @media (min-width: ${theme.screens.md}) {
        padding: 20px 24px;
      }

      &.danger-card {
        border-color: ${theme.colors.red}33;
        background: ${theme.colors.red}05;
      }

      .settings-section-header {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        margin-bottom: 16px;

        @media (min-width: ${theme.screens.md}) {
          flex-direction: row;
          justify-content: space-between;
          align-items: flex-start;
        }

        .settings-section-text {
          flex: 1;
        }

        .settings-section-title {
          font-size: ${theme.fonts.lg};
          color: ${theme.colors.bastille};
          font-weight: 600;
          margin: 0;
        }

        .settings-section-description {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 4px 0 0;
        }

        .MuiButtonBase-root {
          flex-shrink: 0;
          align-self: flex-start;
          white-space: nowrap;
          font-size: ${theme.fonts.sm};
          padding: 6px 14px;
          border-radius: 8px;
          text-transform: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          width: auto;

          .button-text {
            font-weight: 600;
          }

          & > svg {
            width: 18px;
            height: 18px;
          }
        }
      }

      .settings-meta-row {
        display: flex;
        gap: 24px;
        flex-wrap: wrap;
        margin-bottom: 16px;
        padding: 12px 14px;
        background: ${theme.colors.bastille}05;
        border-radius: 8px;

        .settings-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;

          .settings-meta-label {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille}99;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .settings-meta-value {
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille};
            font-weight: 600;
            margin: 0;
          }
        }
      }

      .settings-field-row {
        display: flex;
        flex-direction: column;
        gap: 12px;

        @media (min-width: ${theme.screens.md}) {
          flex-direction: row;
          align-items: flex-end;
        }

        > .field {
          flex: 1;
        }
      }

      .settings-actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        flex-wrap: wrap;

        .MuiButtonBase-root {
          font-size: ${theme.fonts.sm};
          padding: 6px 14px;
          border-radius: 8px;
          text-transform: none;
        }
      }

      .danger-button {
        background: ${theme.colors.red};
        color: ${theme.colors.white};

        &:hover {
          background: ${theme.colors.red};
          opacity: 0.9;
        }
      }
    }

    .projects-list {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .project-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid ${theme.colors.bastille}14;
        border-radius: 10px;

        .project-item-name {
          flex: 1;
          min-width: 0;
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .project-item-link {
          appearance: none;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}99;
          padding: 4px 8px;

          &:hover {
            color: ${theme.colors.bastille};
          }
        }
      }
    }

    .projects-empty {
      text-align: center;
      padding: 16px 12px;
      color: ${theme.colors.bastille}99;
      font-size: ${theme.fonts.sm};
    }

    .llms-empty {
      text-align: center;
      padding: 24px 12px;
      color: ${theme.colors.bastille}99;
      font-size: ${theme.fonts.sm};
    }

    .llm-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .llm-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 14px 16px;
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 10px;

      .llm-card-info {
        flex: 1;
        min-width: 0;
      }

      .llm-card-name {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .llm-card-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .llm-card-actions {
        display: flex;
        gap: 4px;

        .MuiIconButton-root {
          padding: 6px;
        }
      }
    }

    .llm-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 18px;
      background: ${theme.colors.bastille}05;
      border-radius: 10px;
      border: 1px solid ${theme.colors.bastille}1a;
      margin-bottom: 16px;

      .llm-form-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0 0 4px;
      }

      .llm-form-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;

        .MuiButtonBase-root {
          font-size: ${theme.fonts.sm};
          padding: 6px 14px;
          border-radius: 8px;
          text-transform: none;
        }
      }
    }

    .danger-warning {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};
      margin: 0 0 16px;
      line-height: 1.5;

      strong {
        color: ${theme.colors.red};
      }
    }

    .projects-list .project-item {
      flex-wrap: wrap;
    }

    .project-item-toggle {
      appearance: none;
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      color: ${theme.colors.bastille}99;
      padding: 4px 8px;

      &:hover {
        color: ${theme.colors.bastille};
      }
    }

    .project-members {
      flex-basis: 100%;
      margin-top: 4px;
      padding-top: 14px;
      border-top: 1px solid ${theme.colors.bastille}14;
    }
  `}
`;

export const MembersManagerWrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    .mm-denied {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}99;
      margin: 0;
      padding: 14px;
      background: ${theme.colors.bastille}08;
      border-radius: 8px;
      line-height: 1.5;
    }

    .mm-block-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;

      .mm-block-title {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .mm-count {
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        color: ${theme.colors.bastille}99;
        background: ${theme.colors.bastille}0d;
        border-radius: 999px;
        padding: 1px 8px;
      }
    }

    .mm-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .mm-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid ${theme.colors.bastille}14;
      border-radius: 10px;

      .mm-avatar {
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${theme.colors.bastille};
        color: ${theme.colors.white};
        font-size: ${theme.fonts.sm};
        font-weight: 600;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        &.mm-avatar-pending {
          background: ${theme.colors.bastille}26;
          color: ${theme.colors.bastille};
        }
      }

      .mm-row-info {
        flex: 1;
        min-width: 0;

        .mm-row-name {
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .mm-row-sub {
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}99;
          margin: 2px 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .mm-tag {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${theme.colors.bastille}99;
        background: ${theme.colors.bastille}0d;
        border-radius: 4px;
        padding: 1px 6px;

        &.mm-tag-owner {
          color: ${theme.colors.fernGreen};
          background: ${theme.colors.fernGreen}1a;
        }
      }

      .mm-role {
        flex-shrink: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: ${theme.colors.bastille}99;
        border: 1px solid ${theme.colors.bastille}1a;
        border-radius: 4px;
        padding: 2px 6px;

        &.mm-role-pending {
          color: ${theme.colors.saltBox};
        }
      }

      .MuiIconButton-root {
        flex-shrink: 0;
        padding: 4px;
      }
    }

    .mm-invite {
      display: flex;
      align-items: flex-start;
      gap: 8px;

      .mm-invite-field {
        flex: 1;
      }

      .MuiButtonBase-root {
        flex-shrink: 0;
        margin-top: 8px;
        font-size: ${theme.fonts.sm};
        padding: 7px 16px;
        border-radius: 8px;
        text-transform: none;
        white-space: nowrap;
      }
    }
  `}
`;

export const TokensManagerWrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 16px;

    .tm-block-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;

      .tm-block-title {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .tm-count {
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        color: ${theme.colors.bastille}99;
        background: ${theme.colors.bastille}0d;
        border-radius: 999px;
        padding: 1px 8px;
      }
    }

    .tm-intro {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;
      margin: 0 0 10px;
      line-height: 1.6;
    }

    .tm-empty {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}99;
      margin: 0;
      padding: 14px;
      background: ${theme.colors.bastille}08;
      border-radius: 8px;
      line-height: 1.5;
    }

    .tm-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tm-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid ${theme.colors.bastille}14;
      border-radius: 10px;

      .tm-row-info {
        flex: 1;
        min-width: 0;

        .tm-row-name {
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tm-row-sub {
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}99;
          margin: 2px 0 0;
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
      }

      .tm-hint {
        font-family: monospace;
        font-size: ${theme.fonts.xs};
        font-weight: 500;
        color: ${theme.colors.bastille}99;
        background: ${theme.colors.bastille}0d;
        border-radius: 4px;
        padding: 1px 6px;
      }

      .tm-dot {
        color: ${theme.colors.bastille}4d;
      }

      /* A kept row that no longer works. Loud enough to be read as a state
         rather than a label, since the row otherwise looks live. */
      .tm-orphaned {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${theme.colors.saltBox};
        background: ${theme.colors.saltBox}1a;
        border-radius: 4px;
        padding: 1px 6px;
      }

      .MuiIconButton-root {
        flex-shrink: 0;
        padding: 4px;
      }
    }

    .tm-orphaned-help {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;
      margin: 10px 0 0;
      padding: 10px 12px;
      background: ${theme.colors.saltBox}14;
      border-radius: 8px;
      line-height: 1.6;
    }

    .tm-create {
      display: flex;
      align-items: flex-start;
      gap: 8px;

      .tm-create-field {
        flex: 1;
      }

      .tm-create-expiry {
        width: 150px;
        flex-shrink: 0;
      }

      .MuiButtonBase-root {
        flex-shrink: 0;
        margin-top: 8px;
        font-size: ${theme.fonts.sm};
        padding: 7px 16px;
        border-radius: 8px;
        text-transform: none;
        white-space: nowrap;
      }
    }
  `}
`;

export const TokenMintedContent = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 14px;

    .tm-minted-warning {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};
      margin: 0;
      padding: 12px 14px;
      background: ${theme.colors.fernGreen}14;
      border-radius: 8px;
      line-height: 1.5;
    }

    .tm-minted-help {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;
      margin: 0;
      line-height: 1.6;
    }
  `}
`;
