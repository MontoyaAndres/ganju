import { css } from '@emotion/react';
import styled from '@emotion/styled';

export const Wrapper = styled.div`
  ${({ theme }) => css`
    height: calc(100vh - 60px);
    overflow-y: auto;
    padding: 20px;

    @media (min-width: ${theme.screens.xl}) {
      height: 100vh;
      padding: 28px 32px;
    }

    .overview-inner {
      max-width: 1100px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .overview-header {
      display: flex;
      flex-direction: column;
      gap: 16px;

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: flex-start;
        justify-content: space-between;
      }
    }

    .overview-heading {
      min-width: 0;

      .overview-title {
        font-size: ${theme.fonts['2xl']};
        font-weight: 700;
        color: ${theme.colors.bastille};
        line-height: 120%;
        word-break: break-word;
      }

      .overview-subtitle {
        margin-top: 4px;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.saltBox};
        line-height: 140%;
      }
    }

    .overview-mcp {
      width: 100%;
      flex-shrink: 0;

      @media (min-width: ${theme.screens.md}) {
        width: 420px;
      }

      .overview-mcp-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${theme.colors.saltBox};
        margin-bottom: 6px;
      }

      .overview-mcp-row {
        display: flex;
        align-items: center;
        gap: 2px;
        background: ${theme.colors.white};
        border: 1px solid ${theme.colors.alto};
        border-radius: 10px;
        padding: 4px 4px 4px 6px;

        .overview-mcp-url {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 7px;
          padding: 6px 8px;
          text-align: left;
          transition: background 120ms ease;

          &:hover {
            background: ${theme.colors.bastille}08;
          }

          .overview-mcp-url-text {
            flex: 1;
            min-width: 0;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: ${theme.fonts.sm};
            color: ${theme.colors.bastille};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .overview-mcp-url-copy {
            font-size: 15px;
            color: ${theme.colors.saltBox};
            flex-shrink: 0;
          }
        }

        svg {
          font-size: 18px;
        }
      }
    }

    .overview-card {
      background: ${theme.colors.white};
      border: 1px solid ${theme.colors.alto};
      border-radius: 14px;
      box-shadow: ${theme.colors.bastille}0A 0px 1px 2px;
    }

    .overview-activity {
      padding: 18px 18px 12px;

      .overview-activity-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 8px;

        .overview-activity-title {
          font-size: ${theme.fonts.base};
          font-weight: 700;
          color: ${theme.colors.bastille};
        }

        .overview-activity-sub {
          margin-top: 2px;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.saltBox};
        }
      }

      .overview-activity-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .overview-seg {
        display: inline-flex;
        align-items: center;
        background: ${theme.colors.bastille}08;
        border-radius: 8px;
        padding: 2px;

        .overview-seg-btn {
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 6px;
          padding: 5px 10px;
          font-size: ${theme.fonts.xs};
          font-weight: 600;
          color: ${theme.colors.saltBox};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          transition:
            background 120ms ease,
            color 120ms ease;

          &.icon {
            padding: 5px 8px;

            svg {
              font-size: 17px;
            }
          }

          &:hover {
            color: ${theme.colors.bastille};
          }

          &.active {
            background: ${theme.colors.white};
            color: ${theme.colors.bastille};
            box-shadow: ${theme.colors.bastille}14 0px 1px 2px;
          }
        }
      }

      .overview-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 10px;
        margin-bottom: 4px;

        .overview-legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 6px;
          padding: 3px 6px;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.saltBox};
          transition: opacity 120ms ease;

          &:hover {
            background: ${theme.colors.bastille}06;
          }

          &.is-hidden {
            opacity: 0.4;

            .overview-legend-dot,
            .overview-legend-icon {
              filter: grayscale(1);
            }
          }

          .overview-legend-dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            flex-shrink: 0;
          }

          .overview-legend-icon {
            width: 13px;
            height: 13px;
            flex-shrink: 0;
          }

          strong {
            color: ${theme.colors.bastille};
            font-weight: 600;
          }
        }
      }

      .overview-chart {
        position: relative;
        width: 100%;
        height: 240px;
      }

      .overview-activity-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 6px;
        height: 200px;
        color: ${theme.colors.saltBox};

        svg {
          font-size: 30px;
          color: ${theme.colors.alto};
        }

        p {
          font-size: ${theme.fonts.sm};
        }
      }
    }

    .overview-stats {
      display: grid;
      grid-template-columns: 1fr;
      gap: 14px;

      @media (min-width: ${theme.screens.sm}) {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .overview-stat {
      text-align: left;
      cursor: pointer;
      padding: 16px;
      transition:
        border-color 120ms ease,
        box-shadow 120ms ease,
        transform 120ms ease;
      display: flex;
      flex-direction: column;
      gap: 12px;

      &:hover {
        border-color: ${theme.colors.bastille}40;
        box-shadow: ${theme.colors.bastille}14 0px 6px 18px;
        transform: translateY(-1px);
      }

      .overview-stat-top {
        display: flex;
        align-items: center;
        justify-content: space-between;

        .overview-stat-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: ${theme.colors.bastille}0A;
          color: ${theme.colors.bastille};

          svg {
            font-size: 20px;
          }
        }

        .overview-stat-arrow {
          color: ${theme.colors.alto};

          svg {
            font-size: 18px;
          }
        }
      }

      .overview-stat-count {
        font-size: ${theme.fonts['4xl']};
        font-weight: 700;
        color: ${theme.colors.bastille};
        line-height: 100%;
      }

      .overview-stat-label {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
      }

      .overview-stat-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.saltBox};
      }
    }

    .overview-recent {
      padding: 16px 18px;

      .overview-recent-title {
        font-size: ${theme.fonts.base};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin-bottom: 10px;
      }

      .overview-recent-list {
        display: flex;
        flex-direction: column;
      }

      .overview-recent-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 0;
        border-top: 1px solid ${theme.colors.bastille}0A;

        &:first-of-type {
          border-top: none;
        }

        .overview-recent-source {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${theme.colors.white};
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          text-transform: uppercase;

          svg {
            width: 15px;
            height: 15px;
          }
        }

        .overview-recent-text {
          flex: 1;
          min-width: 0;
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.saltBox};
          line-height: 140%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          strong {
            color: ${theme.colors.bastille};
            font-weight: 600;
          }

          .overview-recent-name {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille};
            background: ${theme.colors.bastille}0A;
            padding: 1px 5px;
            border-radius: 5px;
          }

          .overview-recent-via {
            color: ${theme.colors.saltBox};
          }
        }

        .overview-recent-time {
          flex-shrink: 0;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.saltBox};
          white-space: nowrap;
        }
      }

      .overview-recent-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 6px;
        padding: 28px 10px;
        color: ${theme.colors.saltBox};

        svg {
          font-size: 28px;
          color: ${theme.colors.alto};
        }

        p {
          font-size: ${theme.fonts.sm};
        }
      }
    }

    .overview-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-align: center;
      padding: 60px 20px;
      color: ${theme.colors.saltBox};

      svg {
        font-size: 32px;
        color: ${theme.colors.alto};
      }
    }
  `}
`;

export const McpModalBody = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 14px;

    .mcp-modal-field-label {
      display: block;
      font-size: ${theme.fonts.sm};
      font-weight: 600;
      color: ${theme.colors.bastille};
      margin-bottom: 6px;
    }

    .mcp-modal-field {
      display: flex;
      align-items: center;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;
      padding: 0 10px;
      background: ${theme.colors.bastille}05;

      &.is-error {
        border-color: ${theme.colors.thunderbird};
      }

      .mcp-modal-prefix {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.saltBox};
        white-space: nowrap;
      }

      input {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
        padding: 10px 2px;
      }
    }

    .mcp-modal-error {
      margin-top: 6px;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.thunderbird};
    }

    .mcp-modal-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 4px;
      border-top: 1px solid ${theme.colors.bastille}0A;
    }

    .mcp-modal-section-label {
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: ${theme.colors.saltBox};
    }
  `}
`;

export const HealthCard = styled.div`
  ${({ theme }) => css`
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;

    .health-table-scroll,
    .health-section {
      transition: opacity 0.2s ease;
    }

    &.is-refreshing {
      .health-table-scroll,
      .health-section {
        opacity: 0.5;
        pointer-events: none;
      }
    }

    .health-title,
    .health-section-title {
      font-size: ${theme.fonts.base};
      font-weight: 700;
      color: ${theme.colors.bastille};
    }

    .health-section-title {
      font-size: ${theme.fonts.sm};
      margin-bottom: 6px;
    }

    .health-sub,
    .health-muted {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
      line-height: 140%;
    }

    .health-sub {
      margin-top: 2px;
    }

    .health-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 24px 10px;
      text-align: center;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.saltBox};

      svg {
        font-size: 28px;
        color: ${theme.colors.alto};
      }
    }

    .health-table-scroll {
      overflow-x: auto;
      margin: 0 -18px;
      padding: 0 18px;
    }

    .health-table {
      width: 100%;
      min-width: 640px;
      border-collapse: collapse;
      font-size: ${theme.fonts.sm};

      th {
        text-align: left;
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${theme.colors.saltBox};
        padding: 0 8px 8px;
        white-space: nowrap;
      }

      td {
        padding: 9px 8px;
        border-top: 1px solid ${theme.colors.bastille}0A;
        color: ${theme.colors.bastille};
        vertical-align: middle;
      }

      .num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;

        .MuiSkeleton-root {
          margin-left: auto;
        }
      }

      td.is-error {
        color: ${theme.colors.thunderbird};
        font-weight: 600;
      }

      tbody tr {
        cursor: pointer;
        outline: none;

        &:hover td,
        &:focus-visible td {
          background: ${theme.colors.bastille}05;
        }
      }

      tbody tr.health-row-skeleton {
        cursor: default;

        &:hover td {
          background: none;
        }
      }

      .health-chevron {
        width: 24px;
        color: ${theme.colors.alto};

        svg {
          font-size: 18px;
          display: block;
        }
      }
    }

    .health-tool {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }

    .health-tool-name {
      font-weight: 600;
    }

    .health-tool-key {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
    }

    .health-badge {
      font-size: 11px;
      font-weight: 600;
      color: ${theme.colors.saltBox};
      background: ${theme.colors.bastille}0D;
      padding: 1px 6px;
      border-radius: 5px;
      white-space: nowrap;
    }

    .health-signals {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .health-signal {
      font-size: 11px;
      font-weight: 600;
      color: ${theme.colors.romanCoffee};
      background: ${theme.colors.earlyDawn};
      padding: 2px 7px;
      border-radius: 10px;
      white-space: nowrap;
      cursor: help;
    }

    .health-section {
      border-top: 1px solid ${theme.colors.bastille}0A;
      padding-top: 12px;
    }

    .health-list {
      list-style: none;
      padding: 0;
      display: flex;
      flex-direction: column;
      margin-top: 4px;
    }

    .health-error {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 0;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};

      &:hover .health-error-text {
        text-decoration: underline;
      }

      &.is-skeleton {
        cursor: default;
      }

      .health-error-icon {
        font-size: 16px;
        color: ${theme.colors.thunderbird};
        flex-shrink: 0;
      }

      .health-error-text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;

        code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: ${theme.fonts.xs};
          background: ${theme.colors.bastille}0A;
          padding: 1px 5px;
          border-radius: 5px;
        }
      }

      .health-error-count {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
      }

      .health-muted {
        flex-shrink: 0;
      }
    }

    .health-unused {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;

      .health-unused-name {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .health-muted {
        flex: 1;
      }
    }
  `}
`;

export const HealthModalBody = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;

    .health-muted {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
      line-height: 140%;
    }

    .health-seg {
      display: inline-flex;
      align-self: flex-start;
      background: ${theme.colors.bastille}0A;
      border-radius: 8px;
      padding: 2px;

      .health-seg-btn {
        border: none;
        background: none;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        color: ${theme.colors.saltBox};
        cursor: pointer;

        &.active {
          background: ${theme.colors.white};
          color: ${theme.colors.bastille};
          box-shadow: ${theme.colors.bastille}14 0px 1px 2px;
        }
      }
    }

    .health-rows,
    .health-timeline {
      list-style: none;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .health-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid ${theme.colors.bastille}0F;
      border-left: 3px solid ${theme.colors.alto};
      border-radius: 8px;
      background: ${theme.colors.white};
      cursor: pointer;
      text-align: left;

      &:hover {
        background: ${theme.colors.bastille}05;
      }

      &.is-error {
        border-left-color: ${theme.colors.thunderbird};

        .health-row-title {
          color: ${theme.colors.thunderbird};
        }
      }

      > .health-muted {
        flex-shrink: 0;
        white-space: nowrap;
      }

      &.is-skeleton {
        cursor: default;

        &:hover {
          background: ${theme.colors.white};
        }
      }
    }

    .health-skeleton-stack {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .health-block-skeleton {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .health-row-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .health-row-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};
      min-width: 0;

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: ${theme.fonts.xs};
      }
    }

    .health-preview {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .health-time {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      flex-shrink: 0;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.saltBox};
    }

    .health-badge {
      font-size: 11px;
      font-weight: 600;
      color: ${theme.colors.saltBox};
      background: ${theme.colors.bastille}0D;
      padding: 1px 6px;
      border-radius: 5px;
      flex-shrink: 0;
    }

    .health-call-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .health-call-title {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: ${theme.fonts.base};
      font-weight: 700;
      color: ${theme.colors.bastille};
      word-break: break-word;
    }

    .health-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;

      svg {
        font-size: 16px;
        margin-right: 4px;
      }
    }
  `}
`;
