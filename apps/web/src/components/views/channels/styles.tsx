import { css } from '@emotion/react';
import styled from '@emotion/styled';

interface IProps {
  panelWidth: number;
}

export const Wrapper = styled.div<IProps>`
  ${({ theme, panelWidth }) => css`
    display: flex;
    height: calc(100vh - 60px);
    position: relative;
    max-width: 1100px;
    margin: 0 auto;

    @media (min-width: ${theme.screens.xl}) {
      height: calc(100vh - 0px);
    }

    .channels-list {
      flex: 1;
      overflow-y: auto;
      padding: 20px;

      @media (min-width: ${theme.screens.md}) {
        padding: 24px 32px;
      }

      &.has-selection {
        display: none;

        @media (min-width: ${theme.screens.md}) {
          display: block;
          padding-right: ${panelWidth - 80}px;
        }
      }

      .channels-header {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
        margin-bottom: 20px;

        @media (min-width: ${theme.screens.md}) {
          flex-direction: row;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .channels-header-text {
          flex: 1;
          min-width: 0;
          max-width: 640px;
        }

        .channels-title {
          font-size: ${theme.fonts['2xl']};
          color: ${theme.colors.bastille};
          font-weight: 700;
          margin: 0;
        }

        .channels-subtitle {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 6px 0 0 0;
          line-height: 1.4;
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

      .channels-empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 56px 20px;
        text-align: center;

        & > svg {
          width: 48px;
          height: 48px;
          color: ${theme.colors.bastille}40;
        }

        h3 {
          font-size: ${theme.fonts.lg};
          color: ${theme.colors.bastille};
          margin: 0;
        }

        p {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 0 0 8px 0;
        }

        .MuiButtonBase-root {
          font-size: ${theme.fonts.sm};
          padding: 6px 16px;
          border-radius: 8px;
          text-transform: none;
          display: flex;
          align-items: center;
          gap: 4px;

          .button-text {
            font-weight: 600;
          }

          & > svg {
            width: 18px;
            height: 18px;
            color: inherit;
          }
        }
      }

      .channels-items {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .channel-item {
          padding: 14px 16px;
          border-radius: 8px;
          border: 1px solid ${theme.colors.alto};
          cursor: pointer;
          transition:
            border-color 0.15s ease,
            background-color 0.15s ease;
          display: flex;
          align-items: center;
          gap: 12px;

          &:hover {
            border-color: ${theme.colors.bastille}40;
            background-color: ${theme.colors.bastille}05;
          }

          &.active {
            border-color: ${theme.colors.bastille}60;
            background-color: ${theme.colors.bastille}0A;
          }

          &.channel-item-skeleton {
            cursor: default;

            &:hover {
              border-color: ${theme.colors.alto};
              background-color: transparent;
            }
          }

          .channel-item-icon {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid ${theme.colors.alto};
            flex-shrink: 0;

            & > svg {
              width: 22px;
              height: 22px;
              color: ${theme.colors.bastille}CC;
            }
          }

          .channel-item-body {
            flex: 1;
            min-width: 0;

            .channel-item-title {
              font-size: ${theme.fonts.base};
              font-weight: 600;
              color: ${theme.colors.bastille};
              margin: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .channel-item-meta {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
              margin: 4px 0 0 0;
              display: flex;
              align-items: center;
              gap: 8px;
              flex-wrap: wrap;
            }
          }

          .channel-status-pill {
            font-size: ${theme.fonts.xs};
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;

            &.is-active {
              color: ${theme.colors.salem};
              background-color: ${theme.colors.salem}18;
            }

            &.is-disabled {
              color: ${theme.colors.saltBox};
              background-color: ${theme.colors.bastille}10;
            }
          }
        }
      }
    }

    .channel-panel {
      position: fixed;
      top: 68px;
      right: 0;
      bottom: 0;
      width: 100%;
      background-color: ${theme.colors.white};
      z-index: 5;
      display: flex;
      flex-direction: column;
      overflow: hidden;

      @media (min-width: ${theme.screens.md}) {
        width: ${panelWidth}px;
        border-left: 1px solid ${theme.colors.alto};
        flex-shrink: 0;
      }

      @media (min-width: ${theme.screens.xl}) {
        top: 0;
      }

      .panel-resize-handle {
        display: none;

        @media (min-width: ${theme.screens.md}) {
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          width: 4px;
          height: 100%;
          cursor: col-resize;
          z-index: 10;

          &:hover {
            background-color: ${theme.colors.bastille}1A;
          }
        }
      }

      .panel-header {
        display: flex;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid ${theme.colors.alto};
        gap: 8px;

        @media (min-width: ${theme.screens.md}) {
          border-top: 1px solid ${theme.colors.alto};
        }

        .panel-back-btn {
          display: flex;

          @media (min-width: ${theme.screens.md}) {
            display: none;
          }
        }

        .panel-back-inline {
          display: flex;
        }

        .panel-title {
          font-size: ${theme.fonts.lg};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .panel-actions {
          display: flex;
          align-items: center;
          gap: 4px;

          .panel-close-btn {
            display: none;

            @media (min-width: ${theme.screens.md}) {
              display: flex;
            }
          }
        }
      }

      .panel-tabs {
        display: flex;
        border-bottom: 1px solid ${theme.colors.alto};
        padding: 0 16px;
        gap: 4px;

        .panel-tab {
          background: none;
          border: none;
          padding: 12px 10px;
          font-size: ${theme.fonts.sm};
          font-weight: 500;
          color: ${theme.colors.saltBox};
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition:
            color 0.15s ease,
            border-color 0.15s ease;

          &:hover {
            color: ${theme.colors.bastille};
          }

          &.active {
            color: ${theme.colors.bastille};
            border-bottom-color: ${theme.colors.bastille};
            font-weight: 600;
          }
        }
      }

      .panel-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px 16px;

        .panel-section {
          margin-bottom: 20px;

          .panel-section-label {
            font-size: ${theme.fonts.sm};
            font-weight: 600;
            color: ${theme.colors.bastille};
            margin: 0 0 8px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
        }

        .panel-bot-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;
          margin-bottom: 16px;

          .panel-bot-avatar {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background-color: ${theme.colors.bastille}10;
            display: flex;
            align-items: center;
            justify-content: center;

            & > svg {
              width: 26px;
              height: 26px;
              color: ${theme.colors.bastille}CC;
            }
          }

          .panel-bot-text {
            flex: 1;
            min-width: 0;

            .panel-bot-name {
              font-size: ${theme.fonts.base};
              font-weight: 600;
              color: ${theme.colors.bastille};
              margin: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .panel-bot-handle {
              font-size: ${theme.fonts.sm};
              color: ${theme.colors.saltBox};
              margin: 2px 0 0 0;
              font-family: monospace;
            }
          }
        }

        .slack-requirements {
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;

          .slack-requirements-group + .slack-requirements-group {
            margin-top: 12px;
          }

          .slack-requirements-label {
            font-size: ${theme.fonts.xs};
            font-weight: 600;
            color: ${theme.colors.bastille};
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 6px 0;
          }

          .slack-scope-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
          }

          .slack-scope-chip {
            font-family: monospace;
            font-size: ${theme.fonts.xs};
            background-color: ${theme.colors.bastille}0D;
            border: 1px solid ${theme.colors.alto};
            border-radius: 6px;
            padding: 2px 6px;
            color: ${theme.colors.bastille};
          }

          .slack-requirements-hint {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.saltBox};
            margin: 8px 0 0 0;
            line-height: 1.4;
          }
        }

        .panel-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px;
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;
          gap: 12px;

          .panel-toggle-label {
            font-size: ${theme.fonts.sm};
            font-weight: 600;
            color: ${theme.colors.bastille};
            margin: 0;
          }

          .panel-toggle-hint {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.saltBox};
            margin: 2px 0 0 0;
            line-height: 1.4;
          }
        }

        .panel-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;

          .panel-stat {
            border: 1px solid ${theme.colors.alto};
            border-radius: 8px;
            padding: 10px 12px;

            .panel-stat-label {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 0;
            }

            .panel-stat-value {
              font-size: ${theme.fonts.lg};
              font-weight: 700;
              color: ${theme.colors.bastille};
              margin: 4px 0 0 0;
            }
          }
        }

        .panel-edit-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel-platform-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;

          .panel-platform-option {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 14px;
            border: 1px solid ${theme.colors.alto};
            border-radius: 8px;
            background: none;
            cursor: pointer;
            color: ${theme.colors.bastille};
            transition: all 0.15s ease;

            & > svg {
              width: 24px;
              height: 24px;
            }

            .panel-platform-label {
              font-size: ${theme.fonts.sm};
              font-weight: 600;
            }

            .panel-platform-soon {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
            }

            &:not(:disabled):hover {
              border-color: ${theme.colors.bastille}60;
              background-color: ${theme.colors.bastille}05;
            }

            &.active {
              border-color: ${theme.colors.bastille};
              background-color: ${theme.colors.bastille}0A;
            }

            &:disabled {
              cursor: not-allowed;
              opacity: 0.55;
            }
          }
        }

        .panel-edit-actions {
          display: flex;
          gap: 8px;

          .MuiButtonBase-root {
            font-size: ${theme.fonts.sm};
            padding: 6px 16px;
            border-radius: 6px;
          }
        }

        .panel-conversation-list {
          display: flex;
          flex-direction: column;
          gap: 8px;

          .panel-conversation-item {
            border: 1px solid ${theme.colors.alto};
            border-radius: 8px;
            padding: 12px;
            cursor: pointer;
            transition:
              border-color 0.15s ease,
              background-color 0.15s ease;

            &:hover {
              border-color: ${theme.colors.bastille}40;
              background-color: ${theme.colors.bastille}05;
            }

            .panel-conversation-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;

              .panel-conversation-title {
                font-size: ${theme.fonts.base};
                font-weight: 600;
                color: ${theme.colors.bastille};
                margin: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex: 1;
              }

              .panel-conversation-scope {
                font-size: ${theme.fonts.xs};
                font-weight: 600;
                color: ${theme.colors.saltBox};
                background-color: ${theme.colors.bastille}08;
                padding: 2px 8px;
                border-radius: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                flex-shrink: 0;
              }
            }

            .panel-conversation-meta {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
              margin: 6px 0 0 0;
              display: flex;
              gap: 12px;
            }
          }
        }

        .panel-empty {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.saltBox};
          text-align: center;
          padding: 32px 20px;
          margin: 0;
        }

        .panel-messages-thread {
          display: flex;
          flex-direction: column;
          gap: 10px;

          .panel-message-bubble {
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid ${theme.colors.alto};
            max-width: 92%;

            &.is-user {
              align-self: flex-start;
              background-color: ${theme.colors.bastille}05;
            }

            &.is-assistant {
              align-self: flex-end;
              background-color: ${theme.colors.white};
            }

            .panel-message-meta {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
              margin-bottom: 4px;
              display: flex;
              align-items: center;
              gap: 8px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              font-weight: 600;
            }

            .panel-message-linked {
              display: flex;
              align-items: center;
              gap: 5px;
              text-transform: none;
              letter-spacing: 0;
            }

            .panel-message-linked-avatar {
              width: 20px;
              height: 20px;
              border-radius: 50%;
              object-fit: cover;
              flex-shrink: 0;

              &.is-fallback {
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: ${theme.colors.bastille}15;
                color: ${theme.colors.bastille}CC;
                font-size: 9px;
                font-weight: 700;
              }
            }

            .panel-message-content {
              font-size: ${theme.fonts.sm};
              color: ${theme.colors.bastille};
              margin: 0;
              white-space: pre-wrap;
              word-break: break-word;
              line-height: 1.5;
            }

            .panel-message-attachments {
              display: flex;
              flex-direction: column;
              gap: 6px;
              margin-top: 8px;

              .panel-attachment {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 8px 10px;
                border: 1px solid ${theme.colors.alto};
                border-radius: 8px;
                background-color: ${theme.colors.white};
                cursor: pointer;
                text-align: left;
                transition:
                  border-color 0.15s ease,
                  background-color 0.15s ease;

                &:hover {
                  border-color: ${theme.colors.bastille}60;
                  background-color: ${theme.colors.bastille}05;
                }

                .panel-attachment-icon {
                  width: 32px;
                  height: 32px;
                  border-radius: 6px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background-color: ${theme.colors.bastille}10;
                  flex-shrink: 0;

                  & > svg {
                    width: 18px;
                    height: 18px;
                    color: ${theme.colors.bastille}CC;
                  }
                }

                .panel-attachment-text {
                  flex: 1;
                  min-width: 0;
                  display: flex;
                  flex-direction: column;
                  gap: 2px;

                  .panel-attachment-title {
                    font-size: ${theme.fonts.sm};
                    font-weight: 600;
                    color: ${theme.colors.bastille};
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  }

                  .panel-attachment-mime {
                    font-size: ${theme.fonts.xs};
                    color: ${theme.colors.saltBox};
                    font-family: monospace;
                  }
                }

                .panel-attachment-open {
                  width: 16px;
                  height: 16px;
                  color: ${theme.colors.saltBox};
                  flex-shrink: 0;
                }
              }
            }

            .panel-message-sources {
              display: flex;
              flex-direction: column;
              gap: 6px;
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px dashed ${theme.colors.alto};

              .panel-message-sources-label {
                font-size: ${theme.fonts.xs};
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: ${theme.colors.saltBox};
                margin: 0;
              }

              .panel-source-pills {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
              }

              .panel-source-pill {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                max-width: 240px;
                padding: 4px 10px 4px 4px;
                border: 1px solid ${theme.colors.alto};
                border-radius: 999px;
                background-color: ${theme.colors.white};
                text-decoration: none;
                color: ${theme.colors.bastille};
                font-size: ${theme.fonts.xs};
                line-height: 1.2;
                cursor: pointer;
                transition:
                  border-color 0.15s ease,
                  background-color 0.15s ease;

                &:hover {
                  border-color: ${theme.colors.bastille}80;
                  background-color: ${theme.colors.bastille}08;
                }

                .panel-source-pill-number {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  min-width: 20px;
                  height: 20px;
                  padding: 0 6px;
                  border-radius: 999px;
                  background-color: ${theme.colors.bastille};
                  color: ${theme.colors.white};
                  font-size: 11px;
                  font-weight: 600;
                  flex-shrink: 0;
                }

                .panel-source-pill-icon {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  flex-shrink: 0;

                  & > svg {
                    width: 12px;
                    height: 12px;
                    color: ${theme.colors.saltBox};
                  }
                }

                .panel-source-pill-label {
                  font-size: ${theme.fonts.xs};
                  font-weight: 500;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  min-width: 0;
                }
              }
            }

            .panel-message-stats {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
              margin: 6px 0 0 0;
              display: flex;
              gap: 10px;
            }

            .panel-message-usages {
              margin-top: 8px;
              border-top: 1px dashed ${theme.colors.alto};
              padding-top: 6px;

              .panel-usage-row {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 2px 0;
              }

              .panel-usage-error {
                font-size: ${theme.fonts.xs};
                color: ${theme.colors.red};
                margin: 2px 0 0 22px;
                line-height: 1.4;
                white-space: pre-wrap;
                word-break: break-word;
              }

              .panel-usage-item {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: ${theme.fonts.xs};
                color: ${theme.colors.bastille}AA;
                padding: 2px 0;

                .panel-usage-kind {
                  font-weight: 600;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                  color: ${theme.colors.saltBox};
                }

                .panel-usage-name {
                  font-family: monospace;
                  color: ${theme.colors.bastille};
                }

                .panel-usage-latency {
                  margin-left: auto;
                  color: ${theme.colors.saltBox};
                }

                &.has-error {
                  color: ${theme.colors.red};
                }

                &.is-clickable {
                  cursor: pointer;
                  border-radius: 4px;
                  padding: 2px 4px;
                  margin: 0 -4px;
                  transition: background-color 0.15s ease;

                  &:hover {
                    background-color: ${theme.colors.bastille}08;
                  }
                }
              }
            }
          }
        }

        .panel-danger-zone {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid ${theme.colors.alto};

          .panel-danger-label {
            font-size: ${theme.fonts.xs};
            font-weight: 700;
            color: ${theme.colors.red};
            margin: 0 0 10px 0;
            text-transform: uppercase;
            letter-spacing: 0.6px;
          }

          .MuiButtonBase-root {
            font-size: ${theme.fonts.sm};
            font-weight: 600;
            text-transform: none;
            padding: 8px 16px;
            border-radius: 8px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: ${theme.colors.red};
            border: 1px solid ${theme.colors.red}40;
            background-color: ${theme.colors.red}08;
            transition:
              background-color 0.15s ease,
              border-color 0.15s ease,
              color 0.15s ease;

            & > svg {
              width: 18px;
              height: 18px;
            }

            &:hover {
              background-color: ${theme.colors.red};
              border-color: ${theme.colors.red};
              color: ${theme.colors.white};
            }
          }
        }
      }
    }
  `}
`;

export const UsageModalOverlay = styled.div`
  ${({ theme }) => css`
    position: fixed;
    inset: 0;
    background-color: ${theme.colors.bastille}55;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;

    .usage-modal {
      background-color: ${theme.colors.white};
      border-radius: 12px;
      width: 100%;
      max-width: 640px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 60px ${theme.colors.bastille}33;
    }

    .usage-modal-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid ${theme.colors.alto};

      .usage-modal-header-text {
        flex: 1;
        min-width: 0;
      }

      .usage-modal-kind {
        font-size: ${theme.fonts.xs};
        font-weight: 700;
        color: ${theme.colors.saltBox};
        text-transform: uppercase;
        letter-spacing: 0.6px;
        margin: 0 0 4px 0;
      }

      .usage-modal-title {
        font-size: ${theme.fonts.lg};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
        word-break: break-word;
      }

      .usage-modal-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.saltBox};
        margin: 4px 0 0 0;
      }
    }

    .usage-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 18px;
      border-top: 1px solid ${theme.colors.alto};
      background-color: ${theme.colors.bastille}04;

      .MuiButtonBase-root {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        text-transform: none;
        padding: 6px 14px;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        gap: 6px;

        & > svg {
          width: 16px;
          height: 16px;
        }
      }
    }

    .usage-modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;

      .usage-modal-section {
        .usage-modal-label {
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          color: ${theme.colors.bastille};
          text-transform: uppercase;
          letter-spacing: 0.6px;
          margin: 0 0 6px 0;
        }

        .usage-modal-meta {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}CC;
          margin: 0;
        }
      }
    }
  `}
`;
