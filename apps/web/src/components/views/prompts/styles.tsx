import { css } from '@emotion/react';
import styled from '@emotion/styled';

interface IProps {
  panelWidth: number;
}

export const Wrapper = styled.div<IProps>`
  ${({ theme, panelWidth }) => css`
    display: flex;
    height: calc(100dvh - 60px - var(--plan-banner-h, 0px));
    position: relative;
    max-width: 1100px;
    margin: 0 auto;

    @media (min-width: ${theme.screens.xl}) {
      height: calc(100dvh - var(--plan-banner-h, 0px));
    }

    .prompts-list {
      flex: 1;
      overflow-y: auto;
      padding: 20px;

      @media (min-width: ${theme.screens.xl}) {
        padding: 28px 32px;
      }

      &.has-selection {
        display: none;

        @media (min-width: ${theme.screens.md}) {
          display: block;
          padding-right: ${panelWidth - 80}px;
        }
      }

      .prompts-header {
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

        .prompts-header-text {
          flex: 1;
          min-width: 0;
          max-width: 640px;
        }

        .prompts-title {
          font-size: ${theme.fonts['2xl']};
          color: ${theme.colors.bastille};
          font-weight: 700;
          margin: 0;
        }

        .prompts-subtitle {
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

      .prompts-empty {
        font-size: ${theme.fonts.base};
        color: ${theme.colors.bastille}99;
        margin: 40px 0;
        text-align: center;
      }

      .prompts-empty-state {
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

      .prompts-items {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .prompt-item {
          padding: 14px 16px;
          border-radius: 8px;
          border: 1px solid ${theme.colors.alto};
          cursor: pointer;
          transition:
            border-color 0.15s ease,
            background-color 0.15s ease;

          &:hover {
            border-color: ${theme.colors.bastille}40;
            background-color: ${theme.colors.bastille}05;
          }

          &.active {
            border-color: ${theme.colors.bastille}60;
            background-color: ${theme.colors.bastille}0A;
          }

          &.prompt-item-skeleton {
            cursor: default;
            display: flex;
            flex-direction: column;
            gap: 6px;

            &:hover {
              border-color: ${theme.colors.alto};
              background-color: transparent;
            }
          }

          .prompt-item-title {
            font-size: ${theme.fonts.base};
            font-weight: 600;
            color: ${theme.colors.bastille};
            margin: 0;
          }

          .prompt-item-command {
            display: inline-block;
            margin-top: 6px;
            padding: 2px 8px;
            font-family:
              ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille}CC;
            background-color: ${theme.colors.bastille}0D;
            border: 1px solid ${theme.colors.alto};
            border-radius: 4px;
            line-height: 1.4;
          }

          .prompt-item-description {
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille}99;
            margin: 4px 0 0 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .prompt-item-date {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.saltBox};
            margin: 8px 0 0 0;
          }
        }
      }
    }

    .prompt-panel {
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

      .panel-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px 16px;

        .panel-edit-form {
          display: flex;
          flex-direction: column;
          gap: 16px;

          .panel-command-hint {
            margin: -8px 0 0 0;
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille}99;

            code {
              font-family:
                ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: ${theme.fonts.xs};
              padding: 2px 6px;
              color: ${theme.colors.bastille};
              background-color: ${theme.colors.bastille}0D;
              border: 1px solid ${theme.colors.alto};
              border-radius: 4px;
            }
          }

          .panel-messages-section {
            .panel-messages-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 12px;

              .panel-messages-label {
                font-size: ${theme.fonts.sm};
                font-weight: 600;
                color: ${theme.colors.bastille};
                margin: 0;
              }

              .panel-messages-mode-toggle {
                display: flex;
                border: 1px solid ${theme.colors.alto};
                border-radius: 6px;
                overflow: hidden;

                .panel-mode-btn {
                  display: flex;
                  align-items: center;
                  gap: 4px;
                  padding: 4px 10px;
                  border: none;
                  background: none;
                  cursor: pointer;
                  font-size: ${theme.fonts.xs};
                  font-weight: 500;
                  color: ${theme.colors.saltBox};
                  transition:
                    background-color 0.15s ease,
                    color 0.15s ease;

                  & > svg {
                    width: 14px;
                    height: 14px;
                  }

                  &:hover {
                    background-color: ${theme.colors.bastille}05;
                  }

                  &.active {
                    background-color: ${theme.colors.bastille}0A;
                    color: ${theme.colors.bastille};
                    font-weight: 600;
                  }

                  &:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                  }

                  & + .panel-mode-btn {
                    border-left: 1px solid ${theme.colors.alto};
                  }
                }
              }
            }

            .panel-messages-error {
              font-size: ${theme.fonts.sm};
              color: ${theme.colors.red};
              margin: 0 0 8px 0;
            }

            .panel-message-builder {
              display: flex;
              flex-direction: column;
              gap: 12px;

              .panel-message-card {
                border: 1px solid ${theme.colors.alto};
                border-radius: 8px;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;

                &.panel-message-card-user {
                  border-left: 3px solid ${theme.colors.bastille};
                }

                &.panel-message-card-assistant {
                  border-left: 3px solid ${theme.colors.saltBox};
                }

                .panel-message-card-header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;

                  .panel-message-role-toggle {
                    display: flex;
                    border: 1px solid ${theme.colors.alto};
                    border-radius: 6px;
                    overflow: hidden;

                    .panel-role-btn {
                      padding: 3px 10px;
                      border: none;
                      background: none;
                      cursor: pointer;
                      font-size: ${theme.fonts.xs};
                      font-weight: 500;
                      color: ${theme.colors.saltBox};
                      transition:
                        background-color 0.15s ease,
                        color 0.15s ease;

                      &:hover {
                        background-color: ${theme.colors.bastille}05;
                      }

                      &.active {
                        background-color: ${theme.colors.bastille}0A;
                        color: ${theme.colors.bastille};
                        font-weight: 600;
                      }

                      &:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                      }

                      & + .panel-role-btn {
                        border-left: 1px solid ${theme.colors.alto};
                      }
                    }
                  }

                  .MuiIconButton-root {
                    padding: 4px;

                    & > svg {
                      width: 18px;
                      height: 18px;
                      color: ${theme.colors.red};
                    }
                  }
                }
              }

              .panel-add-message {
                .MuiButtonBase-root {
                  font-size: ${theme.fonts.sm};
                  padding: 6px 14px;
                  border-radius: 6px;
                  text-transform: none;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                  width: fit-content;

                  .button-text {
                    font-weight: 600;
                  }

                  & > svg {
                    width: 16px;
                    height: 16px;
                  }
                }
              }
            }

            .panel-schema-editor {
              border: 1px solid ${theme.colors.alto};
              border-radius: 8px;
              padding: 12px;
              margin-top: 12px;

              .panel-schema-label {
                font-size: ${theme.fonts.sm};
                font-weight: 600;
                color: ${theme.colors.bastille};
                margin: 0 0 4px 0;
              }

              .panel-schema-hint {
                font-size: ${theme.fonts.xs};
                color: ${theme.colors.saltBox};
                margin: 0 0 12px 0;
                line-height: 1.4;
              }

              .panel-schema-vars {
                display: flex;
                flex-direction: column;
                gap: 12px;

                .panel-schema-var {
                  border: 1px solid ${theme.colors.alto};
                  border-radius: 8px;
                  padding: 10px;

                  .panel-schema-var-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 8px;

                    .panel-schema-var-name {
                      font-size: ${theme.fonts.sm};
                      font-weight: 600;
                      color: ${theme.colors.bastille};
                      font-family: monospace;
                      background-color: ${theme.colors.bastille}0A;
                      padding: 2px 8px;
                      border-radius: 4px;
                    }

                    .MuiFormControlLabel-label {
                      font-size: ${theme.fonts.sm};
                    }
                  }

                  .panel-schema-var-fields {
                    display: grid;
                    grid-template-columns: 120px 1fr;
                    gap: 10px;
                  }
                }
              }
            }
          }

          .panel-edit-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;

            .MuiButtonBase-root {
              font-size: ${theme.fonts.sm};
              padding: 6px 16px;
              border-radius: 6px;
            }
          }
        }

        .panel-view {
          display: flex;
          flex-direction: column;
          gap: 20px;

          .panel-section {
            .panel-section-label {
              font-size: ${theme.fonts.sm};
              font-weight: 600;
              color: ${theme.colors.bastille};
              margin: 0 0 8px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .panel-section-text {
              font-size: ${theme.fonts.base};
              color: ${theme.colors.bastille}CC;
              margin: 0;
              line-height: 1.5;
            }
          }

          .panel-messages {
            display: flex;
            flex-direction: column;
            gap: 12px;

            .panel-message {
              padding: 12px;
              border-radius: 8px;
              border: 1px solid ${theme.colors.alto};

              &.panel-message-user {
                background-color: ${theme.colors.bastille}05;
              }

              &.panel-message-assistant {
                background-color: ${theme.colors.white};
              }

              .panel-message-role {
                font-size: ${theme.fonts.xs};
                font-weight: 700;
                color: ${theme.colors.saltBox};
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }

              .panel-message-content {
                font-size: ${theme.fonts.base};
                color: ${theme.colors.bastille};
                margin: 6px 0 0 0;
                line-height: 1.5;
                white-space: pre-wrap;
                word-break: break-word;
              }
            }
          }

          .panel-schema-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;

            .panel-section-label {
              margin: 0;
            }

            .panel-schema-view-toggle {
              display: flex;
              border: 1px solid ${theme.colors.alto};
              border-radius: 6px;
              overflow: hidden;

              .panel-mode-btn {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 6px 10px;
                background: ${theme.colors.white};
                border: none;
                cursor: pointer;
                font-size: ${theme.fonts.xs};
                color: ${theme.colors.saltBox};
                transition: all 0.2s;

                svg {
                  width: 14px;
                  height: 14px;
                }

                &.active {
                  background: ${theme.colors.bastille};
                  color: ${theme.colors.white};
                }

                &:not(.active):hover {
                  background: ${theme.colors.bastille}08;
                }
              }
            }
          }

          .panel-schema-visual {
            display: flex;
            flex-direction: column;
            gap: 8px;

            .panel-schema-visual-var {
              border: 1px solid ${theme.colors.alto};
              border-radius: 8px;
              padding: 10px 12px;
              background-color: ${theme.colors.white};

              .panel-schema-visual-row {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;

                .panel-schema-visual-name {
                  font-size: ${theme.fonts.sm};
                  font-weight: 600;
                  color: ${theme.colors.bastille};
                  font-family: monospace;
                }

                .panel-schema-visual-type {
                  font-size: ${theme.fonts.xs};
                  font-weight: 600;
                  color: ${theme.colors.saltBox};
                  background-color: ${theme.colors.bastille}08;
                  padding: 2px 8px;
                  border-radius: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }

                .panel-schema-visual-required {
                  font-size: ${theme.fonts.xs};
                  font-weight: 600;
                  color: ${theme.colors.red};
                  background-color: ${theme.colors.red}12;
                  padding: 2px 8px;
                  border-radius: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }

                .panel-schema-visual-optional {
                  font-size: ${theme.fonts.xs};
                  font-weight: 600;
                  color: ${theme.colors.saltBox};
                  background-color: ${theme.colors.bastille}08;
                  padding: 2px 8px;
                  border-radius: 10px;
                  text-transform: uppercase;
                  letter-spacing: 0.5px;
                }
              }

              .panel-schema-visual-description {
                font-size: ${theme.fonts.sm};
                color: ${theme.colors.bastille}CC;
                margin: 6px 0 0 0;
                line-height: 1.4;
              }
            }
          }

          .panel-schema {
            background-color: ${theme.colors.bastille}08;
            border: 1px solid ${theme.colors.alto};
            border-radius: 8px;
            padding: 12px;
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille};
            overflow-x: auto;
            margin: 0;
            line-height: 1.5;
          }
        }
      }
    }
  `}
`;
