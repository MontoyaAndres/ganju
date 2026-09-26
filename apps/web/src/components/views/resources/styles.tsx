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
      height: 100vh;
    }

    .sync-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;

      .sync-card-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .sync-card-label {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .sync-card-hint {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.saltBox};
        margin: 2px 0 0 0;
        line-height: 1.4;
      }

      .sync-card-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;

        .MuiTextField-root {
          flex: 1 1 160px;
        }
      }

      .MuiSwitch-root .MuiButtonBase-root {
        padding: 9px;
        border-radius: 50%;
      }
    }

    .resources-sync-settings {
      min-width: 0;

      .button-text {
        display: inline-flex;
        align-items: center;
      }

      .button-text svg {
        width: 24px;
        height: 24px;
      }
    }

    .resources-sync-popover {
      width: 380px;
      max-width: calc(100vw - 32px);
      margin-top: 6px;
      border-radius: 8px;

      .sync-card {
        border: none;
      }
    }

    .resources-list {
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

      .resources-header {
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

        .resources-header-text {
          flex: 1;
          min-width: 0;
          max-width: 640px;
        }

        .resources-title {
          font-size: ${theme.fonts['2xl']};
          color: ${theme.colors.bastille};
          font-weight: 700;
          margin: 0;
        }

        .resources-subtitle {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 6px 0 0 0;
          line-height: 1.4;
        }

        .resources-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .resources-view-toggle {
          display: inline-flex;
          align-items: center;
          background-color: ${theme.colors.bastille}08;
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;
          padding: 3px;
          gap: 2px;

          button {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border: none;
            background: transparent;
            border-radius: 6px;
            font-size: ${theme.fonts.sm};
            font-weight: 500;
            color: ${theme.colors.bastille}99;
            cursor: pointer;
            transition:
              background-color 0.15s ease,
              color 0.15s ease;

            & > svg {
              width: 16px;
              height: 16px;
            }

            &:hover {
              color: ${theme.colors.bastille};
            }

            &.active {
              background-color: ${theme.colors.white};
              color: ${theme.colors.bastille};
              font-weight: 600;
              box-shadow: 0 1px 2px ${theme.colors.bastille}1A;
            }
          }
        }
      }

      .resources-toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        flex-wrap: wrap;

        .resources-back {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;
          background: transparent;
          cursor: pointer;
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille};
          transition: background-color 0.15s ease;

          & > svg {
            width: 16px;
            height: 16px;
          }

          &:hover {
            background-color: ${theme.colors.bastille}08;
          }
        }

        .resources-search {
          flex: 1;
          min-width: 200px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border: 1px solid ${theme.colors.alto};
          border-radius: 8px;
          background-color: ${theme.colors.white};

          & > svg {
            width: 16px;
            height: 16px;
            color: ${theme.colors.bastille}80;
            flex-shrink: 0;
          }

          input {
            flex: 1;
            border: none;
            outline: none;
            background: transparent;
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille};

            &::placeholder {
              color: ${theme.colors.bastille}66;
            }
          }
        }

        .MuiButtonBase-root {
          flex-shrink: 0;
          font-size: ${theme.fonts.sm};
          padding: 6px 14px;
          border-radius: 8px;
          text-transform: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;

          .button-text {
            font-weight: 600;
          }

          & > svg {
            width: 18px;
            height: 18px;
          }
        }
      }

      .resources-folder-heading {
        font-size: ${theme.fonts.lg};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0 0 12px 0;
      }

      .resources-breadcrumbs {
        margin: 0 0 12px 0;
      }

      .resources-folders {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .resource-folder {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          border: 1px solid ${theme.colors.alto};
          border-radius: 10px;
          background: ${theme.colors.white};
          cursor: pointer;
          text-align: left;
          transition:
            border-color 0.15s ease,
            background-color 0.15s ease;

          &:hover {
            border-color: ${theme.colors.bastille}40;
            background-color: ${theme.colors.bastille}05;

            .resource-folder-icon {
              border-color: ${theme.colors.bastille}30;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
            }
          }

          .resource-folder-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: ${theme.colors.bastille};
            border: 1px solid ${theme.colors.alto};
            border-radius: 10px;

            & > svg {
              width: 22px;
              height: 22px;
            }

            img {
              width: 22px;
              height: 22px;
              display: block;
              object-fit: contain;
            }
          }

          .resource-folder-body {
            flex: 1;
            min-width: 0;

            .resource-folder-title {
              font-size: ${theme.fonts.base};
              font-weight: 600;
              color: ${theme.colors.bastille};
              margin: 0;
            }

            .resource-folder-meta {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.bastille}99;
              margin: 2px 0 0 0;
            }
          }

          .resource-folder-action {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border: 1px solid transparent;
            background: transparent;
            border-radius: 8px;
            font-size: ${theme.fonts.sm};
            font-weight: 600;
            color: ${theme.colors.bastille};
            cursor: pointer;
            transition:
              background-color 0.15s ease,
              border-color 0.15s ease;
            flex-shrink: 0;

            & > svg {
              width: 16px;
              height: 16px;
            }

            &:hover {
              border-color: ${theme.colors.bastille}40;
              background-color: ${theme.colors.white};
            }
          }
        }
      }

      .resources-empty-state {
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

        .resources-empty-icon-img {
          width: 48px;
          height: 48px;
          object-fit: contain;
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

      .resources-items {
        display: flex;
        flex-direction: column;
        gap: 8px;

        .resource-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid ${theme.colors.alto};
          cursor: pointer;
          transition:
            border-color 0.15s ease,
            background-color 0.15s ease;

          &:hover {
            border-color: ${theme.colors.bastille}40;
            background-color: ${theme.colors.bastille}05;

            .resource-item-icon {
              border-color: ${theme.colors.bastille}30;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
            }
          }

          &.active {
            border-color: ${theme.colors.bastille}60;
            background-color: ${theme.colors.bastille}0A;
          }

          &.resource-item-skeleton {
            cursor: default;

            &:hover {
              border-color: ${theme.colors.alto};
              background-color: transparent;
            }
          }

          .resource-item-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            overflow: hidden;
            color: ${theme.colors.bastille};
            border: 1px solid ${theme.colors.alto};
            border-radius: 10px;

            & > svg {
              width: 22px;
              height: 22px;
            }

            .resource-item-favicon,
            .resource-item-iconlink {
              width: 22px;
              height: 22px;
              object-fit: contain;
              border-radius: 4px;
            }
          }

          .resource-item-body {
            flex: 1;
            min-width: 0;
          }

          .resource-item-remove-button {
            align-self: center;
          }

          .resource-item-top {
            display: flex;
            gap: 8px;
            justify-content: space-between;

            .resource-item-top-between {
              display: flex;
              gap: 8px;
              align-items: center;
              justify-content: space-between;
            }

            .resource-item-title {
              font-size: ${theme.fonts.base};
              font-weight: 600;
              color: ${theme.colors.bastille};
              margin: 0;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              max-width: 200px;

              @media (min-width: ${theme.screens.md}) {
                max-width: 400px;
              }
            }

            .resource-item-type {
              font-size: ${theme.fonts.xs};
              font-weight: 500;
              color: ${theme.colors.saltBox};
              background-color: ${theme.colors.bastille}0A;
              padding: 2px 8px;
              border-radius: 20px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              width: fit-content;
              height: fit-content;
              max-width: 300px;
            }
          }

          .resource-item-meta {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-top: 4px;
            flex-wrap: wrap;

            & > span {
              font-size: ${theme.fonts.xs};
              color: ${theme.colors.saltBox};
            }

            .resource-item-uri {
              max-width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              font-family: monospace;
            }
          }
        }
      }
    }

    .resource-panel {
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

          .panel-content-mode {
            .panel-content-mode-label {
              font-size: ${theme.fonts.sm};
              font-weight: 600;
              color: ${theme.colors.bastille};
              margin: 0 0 8px 0;
            }

            .panel-content-mode-toggle {
              display: flex;
              border: 1px solid ${theme.colors.alto};
              border-radius: 8px;
              overflow: hidden;

              .panel-content-mode-btn {
                flex: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                padding: 8px 12px;
                border: none;
                background: none;
                cursor: pointer;
                font-size: ${theme.fonts.sm};
                font-weight: 500;
                color: ${theme.colors.saltBox};
                transition:
                  background-color 0.15s ease,
                  color 0.15s ease;

                & > svg {
                  width: 18px;
                  height: 18px;
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

                & + .panel-content-mode-btn {
                  border-left: 1px solid ${theme.colors.alto};
                }
              }
            }
          }

          .panel-crawl-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }

          .panel-size-hint {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.saltBox};
            margin: -8px 0 0 0;
          }

          .panel-file-input-hidden {
            display: none;
          }

          .panel-file-dropzone {
            border: 2px dashed ${theme.colors.alto};
            border-radius: 8px;
            padding: 24px;
            cursor: pointer;
            transition:
              border-color 0.15s ease,
              background-color 0.15s ease;

            &:hover {
              border-color: ${theme.colors.bastille}40;
              background-color: ${theme.colors.bastille}05;
            }

            .panel-file-placeholder {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
              color: ${theme.colors.saltBox};

              & > svg {
                width: 32px;
                height: 32px;
              }

              & > p {
                font-size: ${theme.fonts.sm};
                margin: 0;
              }
            }

            .panel-file-info {
              text-align: center;

              .panel-file-preview {
                max-width: 100%;
                max-height: 200px;
                border-radius: 6px;
                margin-bottom: 8px;
                object-fit: contain;
              }

              .panel-file-name {
                font-size: ${theme.fonts.base};
                font-weight: 600;
                color: ${theme.colors.bastille};
                margin: 0;
                word-break: break-all;
              }

              .panel-file-original {
                font-size: ${theme.fonts.sm};
                color: ${theme.colors.saltBox};
                font-family: monospace;
                margin: 4px 0 0 0;
                word-break: break-all;
              }

              .panel-file-meta {
                font-size: ${theme.fonts.sm};
                color: ${theme.colors.saltBox};
                margin: 4px 0 0 0;
              }

              .panel-file-hint {
                font-size: ${theme.fonts.xs};
                color: ${theme.colors.saltBox};
                margin: 6px 0 0 0;
              }
            }
          }

          .panel-advanced {
            border: 1px solid ${theme.colors.alto};
            border-radius: 8px;
            overflow: hidden;

            .panel-advanced-toggle {
              width: 100%;
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 10px 12px;
              border: none;
              background: none;
              cursor: pointer;
              font-size: ${theme.fonts.sm};
              font-weight: 600;
              color: ${theme.colors.saltBox};
              transition: background-color 0.15s ease;

              & > svg {
                width: 18px;
                height: 18px;
              }

              &:hover {
                background-color: ${theme.colors.bastille}05;
              }
            }

            .panel-advanced-content {
              padding: 0 12px 12px;
              display: flex;
              flex-direction: column;
              gap: 16px;
              border-top: 1px solid ${theme.colors.alto};
              padding-top: 12px;

              .panel-advanced-section {
                .panel-advanced-section-header {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;

                  .MuiIconButton-root {
                    padding: 4px;

                    & > svg {
                      width: 18px;
                      height: 18px;
                    }
                  }
                }

                .panel-advanced-label {
                  font-size: ${theme.fonts.sm};
                  font-weight: 600;
                  color: ${theme.colors.bastille};
                  margin: 0 0 8px 0;
                }

                .panel-audience-checks {
                  display: flex;
                  gap: 8px;

                  .MuiFormControlLabel-label {
                    font-size: ${theme.fonts.sm};
                  }
                }

                .panel-icon-row {
                  display: grid;
                  grid-template-columns: 1fr 120px auto;
                  gap: 12px;
                  align-items: center;
                  margin-top: 8px;

                  .MuiIconButton-root {
                    padding: 4px;

                    & > svg {
                      width: 18px;
                      height: 18px;
                      color: ${theme.colors.red};
                    }
                  }
                }

                .panel-advanced-hint {
                  font-size: ${theme.fonts.xs};
                  color: ${theme.colors.saltBox};
                  margin: 0;
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

          .panel-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;

            .panel-info-item {
              display: flex;
              flex-direction: column;
              gap: 4px;
              min-width: 0;

              .panel-info-label {
                font-size: ${theme.fonts.xs};
                font-weight: 600;
                color: ${theme.colors.saltBox};
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }

              .panel-info-value {
                font-size: ${theme.fonts.sm};
                color: ${theme.colors.bastille};
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .panel-info-badge {
                font-size: ${theme.fonts.xs};
                font-weight: 500;
                color: ${theme.colors.saltBox};
                background-color: ${theme.colors.bastille}0A;
                padding: 2px 8px;
                border-radius: 4px;
                width: fit-content;
              }
            }
          }

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
              word-break: break-all;
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

              .MuiSwitch-root .MuiButtonBase-root {
                padding: 9px;
                border-radius: 50%;
              }
            }

            .panel-children {
              display: flex;
              flex-direction: column;
              gap: 4px;

              .panel-child-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 8px 10px;
                border: 1px solid ${theme.colors.alto};
                border-radius: 6px;
                background: ${theme.colors.white};
                cursor: pointer;
                text-align: left;
                transition:
                  border-color 0.15s ease,
                  background-color 0.15s ease;

                .panel-child-title {
                  flex: 1;
                  min-width: 0;
                  font-size: ${theme.fonts.sm};
                  color: ${theme.colors.bastille};
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }

                &:hover {
                  border-color: ${theme.colors.bastille}40;
                  background-color: ${theme.colors.bastille}05;
                }
              }
            }

            .MuiButtonBase-root {
              font-size: ${theme.fonts.sm};
              padding: 6px 14px;
              border-radius: 8px;
              text-transform: none;
              display: flex;
              align-items: center;
              gap: 4px;

              .button-text {
                font-weight: 600;
              }

              & > svg {
                width: 16px;
                height: 16px;
              }
            }
          }

          .panel-file-error {
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.red};
            margin: 0;
            padding: 12px;
            background-color: ${theme.colors.red}0A;
            border: 1px solid ${theme.colors.red}33;
            border-radius: 8px;
          }

          .panel-view-image {
            max-width: 100%;
            max-height: 300px;
            border-radius: 8px;
            border: 1px solid ${theme.colors.alto};
            object-fit: contain;
            margin-bottom: 12px;
          }

          .panel-content-pre {
            background-color: ${theme.colors.bastille}08;
            border: 1px solid ${theme.colors.alto};
            border-radius: 8px;
            padding: 12px;
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille};
            overflow-x: auto;
            margin: 0;
            line-height: 1.5;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .panel-section-toggle {
            margin-top: 8px;
            padding: 8px 12px;
            font-size: ${theme.fonts.sm};
            font-weight: 500;
            color: ${theme.colors.bastille};
            background: transparent;
            border: 1px solid ${theme.colors.alto};
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 120ms ease;

            &:hover {
              background-color: ${theme.colors.bastille}08;
            }
          }
        }
      }
    }
  `}
`;
