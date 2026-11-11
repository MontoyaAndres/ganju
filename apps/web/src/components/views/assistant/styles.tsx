import { css } from '@emotion/react';
import styled from '@emotion/styled';

const buttonReset = css`
  .MuiButtonBase-root.MuiButton-root {
    font-size: 14px;
    padding: 6px 14px;
    border-radius: 999px;
    text-transform: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: auto;
    white-space: nowrap;
    box-shadow: none;

    .button-text {
      font-weight: 600;
    }

    & > svg {
      width: 18px;
      height: 18px;
    }
  }
`;

const ACCENT = '#5c6ac4';
const SUCCESS = '#2E7D32';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    max-width: 1560px;
    margin: 0 auto;
    padding: 12px;
    box-sizing: border-box;

    @media (min-width: ${theme.screens.md}) {
      padding: 16px;
    }

    @media (min-width: ${theme.screens.xl}) {
      height: 100vh;
      padding: 20px 24px;
    }

    ${buttonReset}

    /* Layout */

    .assistant-layout {
      position: relative;
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;

      @media (min-width: ${theme.screens.lg}) {
        grid-template-columns: 248px minmax(0, 1fr);
      }

      @media (min-width: ${theme.screens['2xl']}) {
        grid-template-columns: 248px minmax(0, 1fr) 380px;
      }
    }

    .assistant-scrim {
      position: fixed;
      inset: 0;
      z-index: 19;
      border: none;
      padding: 0;
      background: ${theme.colors.bastille}40;
      cursor: pointer;
    }

    @media (min-width: ${theme.screens['2xl']}) {
      .assistant-layout:not(.is-chats-open) .assistant-scrim {
        display: none;
      }
    }

    @media (min-width: ${theme.screens.lg}) {
      .assistant-layout:not(.is-try-open) .assistant-scrim {
        display: none;
      }
    }

    /* Past chats */

    .assistant-chats {
      display: none;
      flex-direction: column;
      gap: 6px;
      min-height: 0;
      padding: 12px;
      border-radius: 16px;
      background: ${theme.colors.bastille}06;

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
        column-gap: 10px;
        row-gap: 2px;
        padding: 9px 10px;
        margin-bottom: 2px;
        border: none;
        border-radius: 10px;
        background: transparent;
        color: ${theme.colors.bastille};
        text-align: left;
        cursor: pointer;
        font: inherit;
        transition: background 0.15s ease;

        &:hover {
          background: ${theme.colors.bastille}0a;
        }

        &.is-active {
          background: ${ACCENT}14;

          svg {
            color: ${ACCENT};
          }
        }

        svg {
          width: 16px;
          height: 16px;
          color: ${theme.colors.bastille}66;
        }
      }
    }

    .assistant-layout.is-chats-open .assistant-chats {
      display: flex;
      position: fixed;
      inset: 0 auto 0 0;
      width: min(300px, 86vw);
      z-index: 20;
      border-radius: 0 16px 16px 0;
      background: ${theme.colors.white};
      box-shadow: 8px 0 32px ${theme.colors.bastille}26;

      @media (min-width: ${theme.screens.lg}) {
        position: static;
        width: auto;
        border-radius: 16px;
        background: ${theme.colors.bastille}06;
        box-shadow: none;
      }
    }

    .assistant-chats-top {
      display: flex;
      align-items: center;
      gap: 6px;

      & > * {
        flex: 1;
      }

      .MuiButtonBase-root.MuiButton-root {
        width: 100%;
        justify-content: center;
      }
    }

    .assistant-chats-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: -2px -4px 8px 4px;

      h3 {
        margin: 0;
        font-size: ${theme.fonts.base};
        font-weight: 700;
        color: ${theme.colors.bastille};
      }

      @media (min-width: ${theme.screens.lg}) {
        display: none;
      }
    }

    .assistant-chats-heading {
      margin: 14px 4px 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${theme.colors.bastille}73;
    }

    .assistant-chats-empty {
      margin: 0 4px;
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
      color: ${theme.colors.bastille}73;
    }

    .assistant-month {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 12px;
      background: ${theme.colors.white};
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}b3;

      p {
        margin: 0;
      }
    }

    .assistant-month-line {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;

      svg {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        color: ${ACCENT};
      }
    }

    .assistant-month-out {
      font-weight: 600;
      color: ${theme.colors.red};
    }

    /* Chat */

    .assistant-chat {
      display: flex;
      flex-direction: column;
      min-height: 0;
      border: 1px solid ${theme.colors.bastille}14;
      border-radius: 20px;
      background: ${theme.colors.white};
      overflow: hidden;
    }

    .assistant-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid ${theme.colors.bastille}0f;

      h2 {
        margin: 0;
        font-size: ${theme.fonts.base};
        font-weight: 700;
        color: ${theme.colors.bastille};
      }

      p {
        display: none;
        margin: 2px 0 0;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}8c;

        @media (min-width: ${theme.screens.md}) {
          display: block;
        }
      }
    }

    .assistant-header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .assistant-chats-toggle {
      @media (min-width: ${theme.screens.lg}) {
        display: none;
      }
    }

    .assistant-header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .assistant-credits {
      display: none;
      padding: 4px 10px;
      border-radius: 999px;
      background: ${theme.colors.bastille}0a;
      font-size: 12px;
      font-weight: 600;
      color: ${theme.colors.bastille}a6;

      @media (min-width: ${theme.screens.md}) {
        display: inline-block;
      }
    }

    .assistant-try-toggle.MuiButton-root {
      border-color: ${ACCENT}66;
      color: ${ACCENT};

      &:hover {
        border-color: ${ACCENT};
        background: ${ACCENT}0d;
      }

      @media (min-width: ${theme.screens['2xl']}) {
        display: none;
      }
    }

    .assistant-avatar {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, ${ACCENT}, #8b5cf6);
      color: ${theme.colors.white};

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .assistant-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 24px 16px 8px;
    }

    .assistant-column {
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-height: 100%;
    }

    .assistant-health {
      max-width: 560px;
      margin: 16px auto 0;
      padding: 14px 16px;
      border-radius: 14px;
      background: ${theme.colors.earlyDawn};
      color: ${theme.colors.romanCoffee};
      font-size: ${theme.fonts.sm};

      ul {
        margin: 6px 0 12px;
        padding-left: 18px;
      }

      li {
        overflow-wrap: anywhere;
      }
    }

    .assistant-health-title {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-weight: 600;
      color: ${theme.colors.tahitiGold};
    }

    .assistant-empty {
      margin: auto;
      max-width: 560px;
      padding: 24px 0;
      text-align: center;
      color: ${theme.colors.bastille};

      h3 {
        margin: 14px 0 6px;
        font-size: ${theme.fonts.xl};
        font-weight: 700;
      }

      p {
        margin: 0;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        line-height: 1.55;
      }
    }

    .assistant-empty-icon {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, ${ACCENT}, #8b5cf6);
      color: ${theme.colors.white};
      box-shadow: 0 8px 24px ${ACCENT}40;

      svg {
        width: 28px;
        height: 28px;
      }
    }

    .assistant-empty .assistant-suggestions-label {
      margin-top: 24px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: ${theme.colors.bastille}73;
    }

    .assistant-suggestions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      margin-top: 10px;

      @media (min-width: ${theme.screens.sm}) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      button {
        padding: 12px 14px;
        border: 1px solid ${theme.colors.bastille}1a;
        border-radius: 14px;
        background: ${theme.colors.white};
        color: ${theme.colors.bastille};
        font: inherit;
        font-size: ${theme.fonts.sm};
        line-height: 1.4;
        text-align: left;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease,
          transform 0.15s ease;

        &:hover {
          border-color: ${ACCENT}80;
          box-shadow: 0 4px 14px ${ACCENT}1f;
          transform: translateY(-1px);
        }
      }
    }

    .assistant-owner {
      align-self: flex-end;
      max-width: min(80%, 560px);
      padding: 10px 16px;
      border-radius: 18px 18px 6px 18px;
      background: ${theme.colors.bastille};
      color: ${theme.colors.white};
      font-size: ${theme.fonts.sm};
      line-height: 1.55;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .assistant-note {
      align-self: center;
      max-width: 90%;
      margin: 0;
      padding: 6px 12px;
      border-radius: 999px;
      background: ${theme.colors.bastille}08;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}8c;
      text-align: center;
    }

    .assistant-reply {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .assistant-reply-body {
      flex: 1;
      min-width: 0;
      padding-top: 5px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: ${theme.fonts.sm};
      line-height: 1.65;
      color: ${theme.colors.bastille};
      overflow-wrap: anywhere;

      p:first-of-type {
        margin-top: 0;
      }

      p:last-child {
        margin-bottom: 0;
      }
    }

    .assistant-reply-credits {
      font-size: 11px;
      color: ${theme.colors.bastille}59;
    }

    .assistant-card-row {
      padding-left: 44px;
    }

    .assistant-steps {
      list-style: none;
      margin: 0;
      padding: 10px 14px;
      border-radius: 14px;
      background: ${theme.colors.bastille}06;
      display: flex;
      flex-direction: column;
      gap: 6px;

      li {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}8c;

        svg {
          width: 16px;
          height: 16px;
          color: ${SUCCESS};
        }

        &.is-current {
          color: ${theme.colors.bastille};
          font-weight: 600;
        }

        .assistant-step-time {
          font-weight: 400;
          color: ${theme.colors.bastille}73;
        }
      }
    }

    .assistant-dot {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      margin: 0 4px;
      border-radius: 50%;
      background: ${ACCENT};
      animation: assistant-pulse 1.2s ease-in-out infinite;
    }

    .assistant-typing,
    .try-typing {
      display: inline-flex;
      gap: 4px;
      padding: 6px 0;

      span {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${theme.colors.bastille}59;
        animation: assistant-pulse 1.2s ease-in-out infinite;

        &:nth-of-type(2) {
          animation-delay: 0.2s;
        }

        &:nth-of-type(3) {
          animation-delay: 0.4s;
        }
      }
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

    /* Cards */

    .assistant-card {
      max-width: 580px;
      padding: 16px 18px;
      border: 1px solid ${theme.colors.bastille}14;
      border-radius: 16px;
      background: ${theme.colors.white};
      box-shadow: 0 2px 10px ${theme.colors.bastille}0d;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};

      &.is-change.is-proposed {
        border-color: ${ACCENT}59;
        box-shadow: 0 6px 24px ${ACCENT}1f;
      }

      &.is-change.is-undone,
      &.is-change.is-discarded {
        opacity: 0.75;
      }
    }

    .assistant-card-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: ${theme.fonts.base};
      font-weight: 700;
    }

    .assistant-card-icon {
      flex-shrink: 0;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: ${ACCENT}14;
      color: ${ACCENT};

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .assistant-chip {
      margin-left: auto;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      background: ${theme.colors.bastille}0d;
      color: ${theme.colors.bastille}99;

      &.is-applied {
        background: ${theme.colors.peppermint};
        color: ${SUCCESS};
      }

      &.is-failed {
        background: ${theme.colors.fairPink};
        color: ${theme.colors.thunderbird};
      }
    }

    .assistant-card-text {
      margin: 10px 0 0;
      line-height: 1.55;
      color: ${theme.colors.bastille}cc;

      p {
        margin: 0 0 6px;
      }
    }

    .assistant-card-label {
      margin: 14px 0 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: ${theme.colors.bastille}80;
    }

    .assistant-card-list {
      margin: 10px 0 0;
      padding-left: 18px;
      line-height: 1.55;
    }

    .assistant-card-possible {
      margin: 0;
      padding: 10px 12px;
      list-style: none;
      border-radius: 12px;
      background: ${theme.colors.bastille}06;
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: ${theme.colors.bastille}cc;

      li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }

      svg {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
        margin-top: 2px;
        color: ${SUCCESS};
      }
    }

    .assistant-card-list > li.is-delete {
      margin: 6px 0;
      padding: 8px 10px;
      border-radius: 10px;
      list-style: none;
      margin-left: -18px;
      background: ${theme.colors.thunderbird}0d;
      border: 1px solid ${theme.colors.thunderbird}40;
      color: ${theme.colors.thunderbird};
    }

    .assistant-delete-tag {
      margin-right: 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .assistant-item-note {
      display: block;
      margin-top: 2px;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;
    }

    .assistant-delete-input {
      display: block;
      width: 100%;
      margin-top: 8px;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px solid ${theme.colors.thunderbird}66;
      background: ${theme.colors.white};
      color: ${theme.colors.bastille};
      font: inherit;
      font-size: ${theme.fonts.sm};

      &:focus {
        outline: 2px solid ${theme.colors.thunderbird}55;
        outline-offset: 1px;
      }
    }

    .assistant-delete-confirm {
      margin-bottom: 12px;
    }

    .assistant-undo-confirm {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      background: ${theme.colors.thunderbird}0d;
      color: ${theme.colors.thunderbird};
      font-size: ${theme.fonts.xs};

      p {
        margin: 0 0 8px;
      }

      div {
        display: flex;
        gap: 8px;
      }
    }

    .assistant-card-warning {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 12px 0 0;
      color: ${theme.colors.tahitiGold};
      font-size: ${theme.fonts.xs};
      font-weight: 600;
    }

    .assistant-card-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-top: 14px;

      &:empty {
        display: none;
      }
    }

    .assistant-apply.MuiButton-root {
      padding: 8px 20px;
      background: ${ACCENT};

      &:hover {
        background: #4a57b0;
      }
    }

    .assistant-card-status {
      font-size: ${theme.fonts.xs};
      font-weight: 600;

      &.is-error {
        color: ${theme.colors.thunderbird};
      }
    }

    .assistant-card-secret {
      margin-top: 12px;
    }

    .assistant-card-error {
      margin: 6px 0 0;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.thunderbird};
    }

    .assistant-patch {
      max-height: 300px;
      overflow: auto;
      margin: 0;
      padding: 12px;
      border-radius: 12px;
      background: #1e1b2e;
      color: ${theme.colors.white}cc;
      font-size: 12px;
      line-height: 1.5;

      .is-add {
        color: #8fd19e;
      }

      .is-remove {
        color: #f19999;
      }
    }

    /* Composer */

    .assistant-compose {
      padding: 10px 16px 14px;
    }

    .assistant-compose-box {
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 8px 8px 8px 16px;
      border: 1px solid ${theme.colors.bastille}1f;
      border-radius: 24px;
      background: ${theme.colors.white};
      box-shadow: 0 4px 18px ${theme.colors.bastille}0f;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;

      &:focus-within {
        border-color: ${ACCENT}80;
        box-shadow: 0 4px 22px ${ACCENT}26;
      }

      textarea {
        flex: 1;
        min-height: 24px;
        max-height: 180px;
        padding: 7px 0;
        border: none;
        outline: none;
        resize: none;
        background: transparent;
        font: inherit;
        font-size: ${theme.fonts.sm};
        line-height: 1.5;
        color: ${theme.colors.bastille};

        &::placeholder {
          color: ${theme.colors.bastille}66;
        }
      }
    }

    .assistant-send {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: ${theme.colors.bastille};
      color: ${theme.colors.white};
      cursor: pointer;
      transition:
        background 0.15s ease,
        transform 0.15s ease;

      svg {
        width: 20px;
        height: 20px;
      }

      &:hover:not(:disabled) {
        background: ${ACCENT};
        transform: scale(1.05);
      }

      &:disabled {
        background: ${theme.colors.bastille}1f;
        cursor: default;
      }
    }

    .assistant-compose-hint {
      display: none;
      max-width: 760px;
      margin: 6px auto 0;
      font-size: 11px;
      color: ${theme.colors.bastille}66;
      text-align: center;

      @media (min-width: ${theme.screens.md}) {
        display: block;
      }
    }

    /* Try it as a customer */

    .assistant-try {
      display: none;
      min-height: 0;
      flex-direction: column;

      @media (min-width: ${theme.screens['2xl']}) {
        display: flex;
      }
    }

    .assistant-layout.is-try-open .assistant-try {
      display: flex;
      position: fixed;
      inset: 0 0 0 auto;
      width: min(400px, 100vw);
      z-index: 20;
      padding: 12px;
      background: ${theme.colors.white};
      box-shadow: -8px 0 32px ${theme.colors.bastille}26;
      box-sizing: border-box;

      @media (min-width: ${theme.screens['2xl']}) {
        position: static;
        width: auto;
        padding: 0;
        background: transparent;
        box-shadow: none;
      }
    }

    .try-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid ${theme.colors.bastille}14;
      border-radius: 20px;
      background: ${theme.colors.white};
      overflow: hidden;
    }

    .try-header {
      padding: 12px 12px 12px 14px;
      border-bottom: 1px solid ${theme.colors.bastille}0f;
    }

    .try-title {
      display: flex;
      align-items: center;
      gap: 10px;

      h3 {
        margin: 0;
        font-size: ${theme.fonts.sm};
        font-weight: 700;
        color: ${theme.colors.bastille};
      }

      p {
        margin: 2px 0 0;
        font-size: 11px;
        line-height: 1.4;
        color: ${theme.colors.bastille}8c;
      }

      @media (min-width: ${theme.screens['2xl']}) {
        .try-close {
          display: none;
        }
      }
    }

    .try-title-text {
      flex: 1;
      min-width: 0;
    }

    .try-bot {
      flex-shrink: 0;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: ${theme.colors.peppermint};
      color: ${SUCCESS};
    }

    .try-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px 14px;
      background: #efeae2;
    }

    .try-empty {
      margin: auto;
      max-width: 240px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;

      p {
        margin: 0;
        padding: 8px 12px;
        border-radius: 10px;
        background: ${theme.colors.white}cc;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
      }
    }

    .try-line {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 14px;
      font-size: ${theme.fonts.sm};
      line-height: 1.45;
      overflow-wrap: anywhere;
      box-shadow: 0 1px 1px ${theme.colors.bastille}14;

      p {
        margin: 0 0 4px;
      }

      p:last-child {
        margin-bottom: 0;
      }
    }

    .try-user {
      align-self: flex-end;
      border-bottom-right-radius: 4px;
      background: #d9fdd3;
      color: ${theme.colors.bastille};
      white-space: pre-wrap;
    }

    .try-assistant {
      align-self: flex-start;
      border-bottom-left-radius: 4px;
      background: ${theme.colors.white};
      color: ${theme.colors.bastille};
    }

    .try-notice {
      align-self: center;
      max-width: 95%;
      background: ${theme.colors.earlyDawn};
      color: ${theme.colors.romanCoffee};
      font-size: ${theme.fonts.xs};
      box-shadow: none;
    }

    .try-footer {
      margin: 6px 0 0;
      font-size: 11px;
      color: ${theme.colors.bastille}80;
      white-space: pre-wrap;
    }

    .try-buttons {
      display: flex;
      gap: 8px;
      padding: 10px 14px 0;
      background: #efeae2;

      button {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 12px;
        background: ${theme.colors.white};
        color: ${SUCCESS};
        font: inherit;
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 1px 1px ${theme.colors.bastille}14;

        &:hover {
          background: ${theme.colors.peppermint};
        }
      }
    }

    .try-compose {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px 12px;
      background: #efeae2;

      input {
        flex: 1;
        min-width: 0;
        height: 40px;
        padding: 0 16px;
        border: none;
        border-radius: 999px;
        outline: none;
        background: ${theme.colors.white};
        font: inherit;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};

        &::placeholder {
          color: ${theme.colors.bastille}66;
        }
      }

      .assistant-send {
        width: 40px;
        height: 40px;
        background: ${SUCCESS};

        &:hover:not(:disabled) {
          background: #1b5e20;
        }

        &:disabled {
          background: ${SUCCESS}66;
        }
      }
    }

    /* Locked */

    .assistant-locked {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 72px 16px;
      text-align: center;
      max-width: 520px;
      margin: 0 auto;

      h3 {
        font-size: ${theme.fonts.xl};
        color: ${theme.colors.bastille};
        margin: 0;
      }

      p {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0;
        line-height: 1.55;
      }
    }

    .assistant-locked-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 999px;
      background: ${ACCENT}14;
      font-size: ${theme.fonts.xs};
      font-weight: 700;
      color: ${ACCENT};
    }
  `}
`;
