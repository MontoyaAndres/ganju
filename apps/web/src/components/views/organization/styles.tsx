import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    padding: 40px 20px;
    max-width: 1200px;
    margin: 0 auto;

    @media (min-width: ${theme.screens.md}) {
      padding: 60px 40px;
    }

    .organization-header {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 16px;
      margin-bottom: 24px;

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
      }

      .organization-heading {
        .organization-title {
          font-size: ${theme.fonts['2xl']};
          color: ${theme.colors.bastille};
          font-weight: 700;
          margin: 0 0 8px 0;
        }

        .create-organization-subtitle {
          font-size: ${theme.fonts.base};
          color: ${theme.colors.bastille}CC;
          font-weight: 400;
          margin: 0;
        }
      }

      .organization-new-button {
        flex-shrink: 0;

        .MuiButtonBase-root {
          text-transform: none;
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          padding: 6px 14px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          width: auto;

          & > svg {
            width: 18px;
            height: 18px;
            margin-right: 0;
          }
        }
      }
    }

    .invitations-panel {
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;

      .invitations-head {
        margin-bottom: 14px;

        .invitations-title {
          font-size: ${theme.fonts.lg};
          font-weight: 700;
          color: ${theme.colors.bastille};
          margin: 0;
        }

        .invitations-subtitle {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 4px 0 0;
        }
      }

      .invitations-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .invitation-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        padding: 14px 16px;
        border: 1px solid ${theme.colors.bastille}14;
        border-radius: 10px;
        background: ${theme.colors.bastille}05;

        .invitation-info {
          min-width: 0;

          .invitation-target {
            font-size: ${theme.fonts.base};
            font-weight: 600;
            color: ${theme.colors.bastille};
            margin: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;

            .invitation-scope {
              font-size: 10px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.04em;
              color: ${theme.colors.bastille}99;
              background: ${theme.colors.bastille}0d;
              border-radius: 4px;
              padding: 2px 6px;
            }
          }

          .invitation-meta {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille}99;
            margin: 4px 0 0;
          }
        }

        .invitation-actions {
          display: flex;
          gap: 8px;

          .MuiButtonBase-root {
            text-transform: none;
            font-size: ${theme.fonts.sm};
            padding: 5px 14px;
            border-radius: 8px;
            min-width: 0;
            width: auto;
          }
        }
      }
    }

    .organization-empty {
      background: ${theme.colors.white};
      border: 1px dashed ${theme.colors.alto};
      border-radius: 12px;
      padding: 32px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;

      .organization-empty-text {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0;
        max-width: 420px;
        line-height: 1.5;
      }

      .MuiButtonBase-root {
        text-transform: none;
        font-size: ${theme.fonts.sm};
        padding: 6px 16px;
        border-radius: 8px;
        width: auto;
      }
    }

    .organization-list {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;

      @media (min-width: ${theme.screens.md}) {
        grid-template-columns: repeat(2, 1fr);
      }

      @media (min-width: ${theme.screens.lg}) {
        grid-template-columns: repeat(3, 1fr);
      }

      .organization-card {
        background: ${theme.colors.white};
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;
        padding: 20px;
        cursor: pointer;
        transition:
          border-color 0.2s ease,
          box-shadow 0.2s ease;
        display: flex;
        flex-direction: column;
        gap: 12px;

        &:hover {
          border-color: ${theme.colors.bastille}40;
          box-shadow: 0 2px 8px ${theme.colors.bastille}20;
        }

        &.organization-card-basic {
          border-style: dashed;
        }

        .organization-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;

          .organization-card-name {
            font-size: ${theme.fonts.lg};
            color: ${theme.colors.bastille};
            font-weight: 600;
            margin: 0;
            word-break: break-word;
          }

          .organization-badges {
            flex-shrink: 0;
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .organization-badge {
            flex-shrink: 0;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: ${theme.colors.fernGreen};
            background: ${theme.colors.fernGreen}1a;
            border-radius: 4px;
            padding: 2px 6px;

            &.organization-badge-basic {
              color: ${theme.colors.saltBox};
              background: ${theme.colors.bastille}0d;
            }

            &.organization-badge-plan {
              color: ${theme.colors.saltBox};
              background: ${theme.colors.bastille}0d;
            }

            &.organization-badge-plan-paid {
              color: ${theme.colors.fernGreen};
              background: ${theme.colors.fernGreen}1a;
            }
          }
        }

        .organization-info {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;

          .organization-info-item {
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille}99;
            font-weight: 400;
          }
        }

        .organization-basic-note {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 0;
          line-height: 1.5;
        }

        .organization-members {
          display: flex;
          align-items: center;

          .member-avatar {
            width: 30px;
            height: 30px;
            border-radius: 999px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: ${theme.colors.bastille};
            color: ${theme.colors.white};
            font-size: ${theme.fonts.xs};
            font-weight: 600;
            border: 2px solid ${theme.colors.white};
            margin-left: -8px;

            &:first-of-type {
              margin-left: 0;
            }

            img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            &.member-avatar-more {
              background: ${theme.colors.alto};
              color: ${theme.colors.bastille};
            }
          }
        }

        .organization-card-actions {
          display: flex;
          gap: 8px;
          margin-top: 4px;

          .MuiButtonBase-root {
            text-transform: none;
            font-size: ${theme.fonts.sm};
            padding: 5px 14px;
            border-radius: 8px;
            min-width: 0;
            width: auto;
          }
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
    max-width: 520px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
    position: relative;

    @media (min-width: ${theme.screens.md}) {
      max-height: 45vh;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid ${theme.colors.alto};

      .modal-title {
        font-size: ${theme.fonts.lg};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .MuiButtonBase-root svg {
        width: 20px;
        height: 20px;
      }
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;

      .form-section {
        display: flex;
        flex-direction: column;
        gap: 12px;

        .form-section-header {
          .form-section-title {
            font-size: ${theme.fonts.base};
            color: ${theme.colors.bastille};
            font-weight: 700;
            margin: 0;
          }

          .form-section-description {
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille}99;
            font-weight: 400;
            margin: 2px 0 0 0;
          }
        }
      }

      .modal-error {
        color: ${theme.colors.red};
        font-size: ${theme.fonts.sm};
        margin: 0;
      }

      .modal-hint {
        color: ${theme.colors.bastille}99;
        font-size: ${theme.fonts.xs};
        line-height: 1.5;
        margin: 0;
      }
    }

    .modal-actions {
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

export const CreateOrganizationWrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    align-items: center;
    height: calc(100vh - 190px);
    padding: 0 20px;
    margin: 60px 0;

    @media (min-width: ${theme.screens.md}) {
      padding: 0;
    }

    .create-organization-header {
      text-align: center;
      margin-bottom: 24px;

      .create-organization-title {
        font-size: ${theme.fonts['2xl']};
        color: ${theme.colors.bastille};
        font-weight: 700;
        line-height: 120%;
      }

      .create-organization-subtitle {
        font-size: ${theme.fonts.base};
        color: ${theme.colors.bastille}CC;
        font-weight: 400;
        margin-top: 4px;
      }
    }

    .create-organization-form {
      width: 100%;
      max-width: 600px;
      display: flex;
      flex-direction: column;
      gap: 24px;

      .form-section {
        display: flex;
        flex-direction: column;
        gap: 12px;

        .form-section-header {
          margin-bottom: 4px;

          .form-section-title {
            font-size: ${theme.fonts.lg};
            color: ${theme.colors.bastille};
            font-weight: 600;
            margin: 0;
          }

          .form-section-description {
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille}99;
            font-weight: 400;
            margin: 4px 0 0 0;
          }
        }
      }

      .create-organization-error {
        color: ${theme.colors.red};
        font-size: ${theme.fonts.sm};
        font-weight: 400;
        margin: 0;
      }

      .create-organization-button {
        margin-top: 12px;

        button {
          font-size: ${theme.fonts.base};
        }
      }
    }
  `}
`;
