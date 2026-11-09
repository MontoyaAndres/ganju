import { css } from '@emotion/react';
import styled from '@emotion/styled';

const buttonReset = css`
  .MuiButtonBase-root.MuiButton-root {
    font-size: 14px;
    padding: 6px 14px;
    border-radius: 8px;
    text-transform: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: auto;
    white-space: nowrap;

    .button-text {
      font-weight: 600;
    }

    & > svg {
      width: 18px;
      height: 18px;
    }
  }
`;

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    max-width: 1500px;
    margin: 0 auto;
    padding: 16px;
    box-sizing: border-box;

    @media (min-width: ${theme.screens.xl}) {
      height: 100vh;
      padding: 24px 28px;
    }

    ${buttonReset}

    .assistant-layout {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;

      @media (min-width: ${theme.screens.lg}) {
        grid-template-columns: 220px minmax(0, 1fr);
      }

      @media (min-width: ${theme.screens['2xl']}) {
        grid-template-columns: 220px minmax(0, 1fr) 360px;

        .assistant-try {
          display: flex;
        }

        .assistant-try-toggle {
          display: none;
        }
      }
    }

    .assistant-layout.is-try-open .assistant-try {
      display: flex;
      position: fixed;
      inset: 0 0 0 auto;
      width: min(400px, 100vw);
      z-index: 20;
      padding: 16px;
      background: ${theme.colors.white};
      box-shadow: -8px 0 24px ${theme.colors.bastille}1a;
      box-sizing: border-box;

      @media (min-width: ${theme.screens['2xl']}) {
        position: static;
        width: auto;
        padding: 0;
        box-shadow: none;
      }
    }

    .assistant-chats {
      display: none;
      flex-direction: column;
      gap: 8px;
      min-height: 0;

      @media (min-width: ${theme.screens.lg}) {
        display: flex;
      }

      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        flex: 1;
        overflow-y: auto;
      }

      li button {
        width: 100%;
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: center;
        column-gap: 8px;
        padding: 8px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: ${theme.colors.bastille};
        text-align: left;
        cursor: pointer;
        font: inherit;

        &:hover {
          background: ${theme.colors.bastille}0a;
        }

        &.is-active {
          background: ${theme.colors.bastille}12;
        }

        svg {
          width: 16px;
          height: 16px;
          color: ${theme.colors.bastille}80;
        }
      }
    }

    .assistant-chats-heading {
      margin: 8px 0 0;
      font-size: ${theme.fonts.xs};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: ${theme.colors.bastille}80;
    }

    .assistant-chats-empty,
    .assistant-month {
      margin: 0;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}80;
    }

    .assistant-chat-title {
      font-size: ${theme.fonts.sm};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .assistant-chat-time {
      grid-column: 2;
      font-size: 11px;
      color: ${theme.colors.bastille}80;
    }

    .assistant-chat {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 12px;
      background: ${theme.colors.white};
    }

    .assistant-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid ${theme.colors.bastille}14;

      h2 {
        margin: 0;
        font-size: ${theme.fonts.lg};
        color: ${theme.colors.bastille};
      }

      p {
        margin: 4px 0 0;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
      }
    }

    .assistant-header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .assistant-credits {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;
    }

    .assistant-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }

    .assistant-empty {
      margin: auto;
      max-width: 440px;
      text-align: center;
      color: ${theme.colors.bastille};

      svg {
        width: 36px;
        height: 36px;
        color: ${theme.colors.indigo};
      }

      h3 {
        margin: 8px 0 4px;
        font-size: ${theme.fonts.lg};
      }

      p {
        margin: 0;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        line-height: 1.5;
      }
    }

    .assistant-owner {
      align-self: flex-end;
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 14px 14px 4px 14px;
      background: ${theme.colors.bastille};
      color: ${theme.colors.white};
      font-size: ${theme.fonts.sm};
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .assistant-note {
      align-self: center;
      max-width: 90%;
      margin: 0;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}80;
      text-align: center;
    }

    .assistant-reply {
      max-width: 90%;
      font-size: ${theme.fonts.sm};
      line-height: 1.55;
      color: ${theme.colors.bastille};
      overflow-wrap: anywhere;

      p:first-of-type {
        margin-top: 0;
      }
    }

    .assistant-reply-credits {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      color: ${theme.colors.bastille}66;
    }

    .assistant-progress {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;
    }

    .assistant-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${theme.colors.indigo};
      animation: assistant-pulse 1.2s ease-in-out infinite;
    }

    @keyframes assistant-pulse {
      0%,
      100% {
        opacity: 0.3;
      }
      50% {
        opacity: 1;
      }
    }

    .assistant-card {
      max-width: 560px;
      padding: 14px 16px;
      border: 1px solid ${theme.colors.bastille}1f;
      border-radius: 12px;
      background: ${theme.colors.bastille}05;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};
    }

    .assistant-card-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;

      svg {
        color: ${theme.colors.indigo};
      }
    }

    .assistant-card-text {
      margin: 8px 0 0;
      line-height: 1.5;
      color: ${theme.colors.bastille}cc;

      p {
        margin: 0 0 6px;
      }
    }

    .assistant-card-label {
      margin: 10px 0 4px;
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      color: ${theme.colors.bastille}99;
    }

    .assistant-card-list {
      margin: 8px 0 0;
      padding-left: 18px;
      line-height: 1.5;
    }

    .assistant-card-possible {
      margin-top: 0;
      color: ${theme.colors.bastille}cc;
    }

    .assistant-card-warning {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 10px 0 0;
      color: ${theme.colors.tahitiGold};
      font-size: ${theme.fonts.xs};
      font-weight: 600;
    }

    .assistant-card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }

    .assistant-card-status {
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      color: ${theme.colors.japaneseLaurel};

      &.is-error {
        color: ${theme.colors.thunderbird};
      }
    }

    .assistant-card-secret {
      margin-top: 10px;
    }

    .assistant-card-error {
      margin: 6px 0 0;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.thunderbird};
    }

    .assistant-patch {
      max-height: 280px;
      overflow: auto;
      margin: 0;
      padding: 10px;
      border-radius: 8px;
      background: ${theme.colors.bastille};
      color: ${theme.colors.white}cc;
      font-size: 12px;
      line-height: 1.45;

      .is-add {
        color: #8fd19e;
      }

      .is-remove {
        color: #f19999;
      }
    }

    .assistant-compose {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 12px 16px 16px;
      border-top: 1px solid ${theme.colors.bastille}14;

      & > div {
        flex: 1;
      }
    }

    .assistant-try {
      display: none;
      min-height: 0;
      flex-direction: column;
    }

    .assistant-locked {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 60px 0;
      text-align: center;
      max-width: 520px;
      margin: 0 auto;

      h3 {
        font-size: ${theme.fonts.lg};
        color: ${theme.colors.bastille};
        margin: 0;
      }

      p {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0;
        line-height: 1.5;
      }
    }

    .assistant-locked-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      background: ${theme.colors.bastille}0d;
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      color: ${theme.colors.bastille};
    }

    .try-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid ${theme.colors.bastille}1a;
      border-radius: 12px;
      background: ${theme.colors.white};
    }

    .try-header {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding: 14px;
      border-bottom: 1px solid ${theme.colors.bastille}14;

      h3 {
        margin: 0;
        font-size: ${theme.fonts.base};
        color: ${theme.colors.bastille};
      }

      p {
        margin: 0;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
        line-height: 1.45;
      }
    }

    .try-title {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;

      @media (min-width: ${theme.screens['2xl']}) {
        .try-close {
          display: none;
        }
      }
    }

    .try-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      background: ${theme.colors.bastille}05;
    }

    .try-empty {
      margin: auto;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}80;
      text-align: center;
    }

    .try-line {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 12px;
      font-size: ${theme.fonts.sm};
      line-height: 1.45;
      overflow-wrap: anywhere;

      p {
        margin: 0 0 4px;
      }
    }

    .try-user {
      align-self: flex-end;
      background: ${theme.colors.peppermint};
      color: ${theme.colors.bastille};
      white-space: pre-wrap;
    }

    .try-assistant {
      align-self: flex-start;
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.bastille}14;
      color: ${theme.colors.bastille};
    }

    .try-notice {
      align-self: center;
      max-width: 95%;
      background: ${theme.colors.earlyDawn};
      color: ${theme.colors.romanCoffee};
      font-size: ${theme.fonts.xs};
    }

    .try-footer {
      margin: 6px 0 0;
      font-size: 11px;
      color: ${theme.colors.bastille}80;
      white-space: pre-wrap;
    }

    .try-typing {
      display: flex;
      gap: 4px;

      span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${theme.colors.bastille}66;
        animation: assistant-pulse 1.2s ease-in-out infinite;

        &:nth-of-type(2) {
          animation-delay: 0.2s;
        }

        &:nth-of-type(3) {
          animation-delay: 0.4s;
        }
      }
    }

    .try-buttons {
      display: flex;
      gap: 8px;
      padding: 8px 14px 0;
    }

    .try-compose {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px 14px;

      & > div {
        flex: 1;
      }
    }
  `}
`;
