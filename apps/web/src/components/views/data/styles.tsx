import { css } from '@emotion/react';
import styled from '@emotion/styled';

import type { Theme } from '@emotion/react';

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

// A checkbox with a label and a line of help under it. Only the label's own
// span is styled: the checkbox renders as a span too.
const flagStyles = (theme: Theme) => css`
  .MuiFormControlLabel-root.column-flag {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    align-items: start;
    column-gap: 10px;
    margin: 0;

    .MuiCheckbox-root {
      align-self: start;
      padding: 0;
      margin-top: 1px;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    .MuiFormControlLabel-label {
      font-size: ${theme.fonts.sm};
      line-height: 20px;

      & > span {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      small {
        font-size: ${theme.fonts.xs};
        line-height: 16px;
        color: ${theme.colors.bastille}99;
      }
    }
  }
`;

export const Wrapper = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px 16px;
    gap: 16px;
    box-sizing: border-box;

    @media (min-width: ${theme.screens.md}) {
      padding: 20px;
    }

    @media (min-width: ${theme.screens.xl}) {
      height: 100vh;
      padding: 28px 32px;
    }

    ${buttonReset}

    .MuiButtonBase-root.MuiButton-outlinedError {
      color: ${theme.colors.thunderbird};
      border-color: ${theme.colors.thunderbird}80;
    }

    .data-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;

      .data-title {
        font-size: ${theme.fonts['2xl']};
        color: ${theme.colors.bastille};
        font-weight: 700;
        margin: 0;
      }

      .data-subtitle {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 6px 0 0;
        line-height: 1.4;
      }
    }

    .data-layout-skeleton {
      .data-main {
        display: flex;
      }

      @media (max-width: calc(${theme.screens.md} - 1px)) {
        .data-main {
          display: none;
        }
      }

      .data-table-item {
        cursor: default;
      }
    }

    .data-skeleton-toolbar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }

    .data-skeleton-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
    }

    .data-empty-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }

    .data-empty-state .data-empty-hint {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}80;
    }

    .data-error,
    .data-inline-error {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.thunderbird};
      margin: 0;
    }

    .data-status {
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}99;
    }

    .data-banner {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid ${theme.colors.alto};
      background: ${theme.colors.white};
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }

      &.data-banner-danger {
        border-color: ${theme.colors.thunderbird}55;
        background: ${theme.colors.fairPink};
      }

      &.data-banner-warning {
        border-color: ${theme.colors.tahitiGold}55;
        background: ${theme.colors.earlyDawn};
      }

      .data-banner-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .data-banner-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
    }

    .data-empty-state,
    .data-locked {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px 0;
      text-align: center;
      max-width: 560px;
      margin: 0 auto;

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
        margin: 0;
        line-height: 1.5;
      }
    }

    .data-locked-badge {
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

    .data-when {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 16px;
      border-radius: 10px;
      background: ${theme.colors.bastille}08;
      text-align: left;
      box-sizing: border-box;
    }

    .data-create {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: stretch;

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: flex-start;

        .MuiButtonBase-root.MuiButton-root {
          margin-top: 2px;
        }
      }
    }

    .data-layout {
      flex: 1;
      min-height: 0;
      display: flex;
      gap: 16px;

      .data-main {
        display: none;
      }

      &.has-selection {
        .data-tables {
          display: none;
        }

        .data-main {
          display: flex;
        }
      }

      @media (min-width: ${theme.screens.md}) {
        .data-main,
        &.has-selection .data-main {
          display: flex;
        }

        .data-tables,
        &.has-selection .data-tables {
          display: flex;
        }
      }
    }

    .data-tables {
      width: 100%;
      flex-direction: column;
      gap: 8px;
      display: flex;
      min-height: 0;

      @media (min-width: ${theme.screens.md}) {
        width: 240px;
        flex-shrink: 0;
        border-right: 1px solid ${theme.colors.alto};
        padding-right: 16px;
      }

      .data-tables-header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        .data-tables-title {
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: ${theme.colors.bastille}99;
        }
      }

      .data-tables-items {
        display: flex;
        flex-direction: column;
        gap: 2px;
        overflow-y: auto;
      }

      .data-table-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
        text-align: left;

        svg {
          width: 18px;
          height: 18px;
          color: ${theme.colors.bastille}80;
          flex-shrink: 0;
        }

        &:hover {
          background: ${theme.colors.bastille}0a;
        }

        &.active {
          background: ${theme.colors.bastille}12;
          font-weight: 600;
        }

        .data-table-item-name {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .data-table-item-count {
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}80;
        }
      }

      .data-tables-empty {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 0;

        p {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 0;
        }
      }

      .data-tables-none {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}80;
        margin: 8px 0;
      }
    }

    .data-main {
      flex: 1;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      gap: 12px;

      .data-main-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;

        .data-back-btn {
          @media (min-width: ${theme.screens.md}) {
            display: none;
          }
        }

        .data-main-title {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: baseline;
          gap: 8px;

          h2 {
            font-size: ${theme.fonts.lg};
            color: ${theme.colors.bastille};
            margin: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          code {
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille}80;
          }
        }
      }

      .data-main-description {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0;
      }

      .data-main-placeholder {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: ${theme.colors.bastille}80;
        font-size: ${theme.fonts.sm};

        svg {
          width: 40px;
          height: 40px;
          color: ${theme.colors.bastille}30;
        }
      }
    }

    .data-tabs {
      display: inline-flex;
      gap: 4px;
      padding: 3px;
      border-radius: 8px;
      background: ${theme.colors.bastille}0a;

      .data-tab {
        border: none;
        background: transparent;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}b3;

        &.active {
          background: ${theme.colors.white};
          color: ${theme.colors.bastille};
          font-weight: 600;
          box-shadow: 0 1px 2px ${theme.colors.bastille}1a;
        }
      }
    }

    .data-rows {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;

      .data-rows-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .data-rows-search {
        flex: 1;
        min-width: 180px;
        max-width: 360px;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;

        svg {
          width: 18px;
          height: 18px;
          color: ${theme.colors.bastille}80;
        }

        input {
          flex: 1;
          border: none;
          outline: none;
          font-size: ${theme.fonts.sm};
          background: transparent;
          min-width: 0;
        }
      }

      .data-rows-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }

      .data-danger-text.MuiButtonBase-root {
        color: ${theme.colors.thunderbird};
      }

      .data-grid {
        flex: 1;
        min-height: 360px;

        .MuiDataGrid-root {
          border-radius: 10px;
          font-size: ${theme.fonts.sm};
        }

        .MuiDataGrid-row {
          cursor: pointer;
        }
      }

      .data-cell-relation {
        display: inline-block;
        padding: 1px 8px;
        border-radius: 999px;
        background: ${theme.colors.indigo}14;
        color: ${theme.colors.indigo};
        font-size: ${theme.fonts.xs};
        line-height: 20px;
      }
    }

    .data-schema {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 24px;
    }

    .data-card {
      border: 1px solid ${theme.colors.alto};
      border-radius: 12px;
      padding: 16px;
      background: ${theme.colors.white};

      &.data-card-danger {
        border-color: ${theme.colors.red}33;
        background: ${theme.colors.red}05;
      }

      .data-card-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;

        h3 {
          font-size: ${theme.fonts.base};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
        }
      }

      .data-card-muted {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0;
        line-height: 1.5;
      }
    }

    .data-columns {
      display: flex;
      flex-direction: column;
      margin: 0 -16px -16px;

      .data-columns-head,
      .data-column {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px 16px;
        padding: 12px 16px;

        @media (min-width: ${theme.screens.md}) {
          grid-template-columns:
            minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.6fr)
            72px;
          align-items: start;
        }
      }

      .data-columns-head {
        display: none;
        padding-top: 8px;
        padding-bottom: 8px;
        border-top: 1px solid ${theme.colors.alto}80;
        border-bottom: 1px solid ${theme.colors.alto}80;
        background: ${theme.colors.bastille}05;
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${theme.colors.bastille}80;

        @media (min-width: ${theme.screens.md}) {
          display: grid;
        }
      }

      .data-column {
        border-top: 1px solid ${theme.colors.alto}80;

        &:nth-of-type(2) {
          border-top: none;

          @media (max-width: calc(${theme.screens.md} - 1px)) {
            border-top: 1px solid ${theme.colors.alto}80;
          }
        }

        &:hover {
          background: ${theme.colors.bastille}05;
        }
      }

      .data-column-name {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;

        .data-column-title {
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          color: ${theme.colors.bastille};
          line-height: 24px;
        }

        code {
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}80;
        }
      }

      .data-column-description {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
        margin: 2px 0 0;
        line-height: 1.4;
      }

      .data-column-type,
      .data-column-rules {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        grid-column: 1 / -1;

        @media (min-width: ${theme.screens.md}) {
          grid-column: auto;
        }
      }

      .data-column-type {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }

      .data-column-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
      }

      .data-column-actions {
        display: flex;
        justify-content: flex-end;
        gap: 2px;
        grid-column: 2;
        grid-row: 1;

        @media (min-width: ${theme.screens.md}) {
          grid-column: auto;
          grid-row: auto;
          margin-top: -4px;
        }
      }
    }

    .data-chip {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      background: ${theme.colors.indigo}14;
      color: ${theme.colors.indigo};
      font-size: ${theme.fonts.xs};
      line-height: 18px;

      &.data-chip-muted {
        background: ${theme.colors.bastille}0d;
        color: ${theme.colors.bastille}b3;
      }
    }

    .data-plain-list {
      margin: 8px 0 0;
      padding-left: 18px;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille};
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .data-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      max-width: 640px;

      .data-form-row {
        display: flex;
        flex-direction: column;
        gap: 14px;

        @media (min-width: ${theme.screens.md}) {
          flex-direction: row;
        }
      }

      .data-form-actions {
        display: flex;
        gap: 8px;
      }
    }

    ${flagStyles(theme)}
  `}
`;

export const DialogContent = styled.div`
  ${({ theme }) => css`
    display: flex;
    flex-direction: column;
    gap: 14px;
    font-size: ${theme.fonts.sm};
    color: ${theme.colors.bastille};

    ${buttonReset}

    .MuiButtonBase-root.MuiButton-outlinedError {
      color: ${theme.colors.thunderbird};
      border-color: ${theme.colors.thunderbird}80;
    }

    p {
      margin: 0;
      line-height: 1.5;
    }

    code {
      font-size: ${theme.fonts.xs};
      padding: 1px 6px;
      border-radius: 4px;
      background: ${theme.colors.bastille}0d;
    }

    .dialog-row {
      display: flex;
      flex-direction: column;
      gap: 12px;

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: flex-start;
      }
    }

    .dialog-subtitle {
      font-size: ${theme.fonts.sm};
      font-weight: 700;
      margin: 4px 0 0;
    }

    .dialog-muted {
      color: ${theme.colors.bastille}99;
    }

    .dialog-warning {
      color: ${theme.colors.romanCoffee};
    }

    .dialog-danger {
      color: ${theme.colors.thunderbird};
    }

    .dialog-warning-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border-radius: 8px;
      background: ${theme.colors.earlyDawn};
    }

    .dialog-list {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .dialog-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 16px;
      border-bottom: 1px solid ${theme.colors.alto}80;

      &:last-of-type {
        border-bottom: none;
        padding-bottom: 0;
      }

      &.dialog-danger-zone {
        padding: 14px;
        border: 1px solid ${theme.colors.red}33;
        border-radius: 10px;
        background: ${theme.colors.red}05;
        align-items: flex-start;
      }
    }

    .dialog-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 16px;
      margin: 0;

      dt {
        color: ${theme.colors.bastille}99;
      }

      dd {
        margin: 0;
      }
    }

    .dialog-meter {
      height: 6px;
      border-radius: 999px;
      background: ${theme.colors.bastille}12;
      overflow: hidden;

      span {
        display: block;
        height: 100%;
        background: ${theme.colors.indigo};
      }
    }

    .dialog-notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: ${theme.colors.peppermint};
    }

    .dialog-columns {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .dialog-column {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 10px 14px 14px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;

      .dialog-column-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 32px;
        margin-right: -6px;
      }

      .dialog-column-title {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dialog-column-actions {
        display: flex;
        align-items: center;
        gap: 2px;
        flex-shrink: 0;

        .MuiButtonBase-root.MuiButton-root {
          padding: 4px 10px;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}b3;

          &.active {
            background: ${theme.colors.bastille}0d;
            color: ${theme.colors.bastille};
          }
        }
      }
    }

    .column-fields {
        flex: 1;
      }

      .dialog-column-actions {
        display: flex;
        gap: 2px;
        align-self: flex-end;

        @media (min-width: ${theme.screens.md}) {
          align-self: flex-start;
        }
      }
    }

    .column-fields {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;

      .column-fields-row {
        display: flex;
        flex-direction: column;
        gap: 12px;

        & > * {
          flex: 1;
          min-width: 0;
        }

        @media (min-width: ${theme.screens.sm}) {
          flex-direction: row;
          align-items: flex-start;
        }
      }

      .column-flags {
        display: grid;
        grid-template-columns: 1fr;
        gap: 14px 24px;
        padding-top: 4px;

        @media (min-width: ${theme.screens.sm}) {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      &:not(.compact) .column-flags {
        padding-top: 14px;
        border-top: 1px solid ${theme.colors.alto}80;
      }
    }

    ${flagStyles(theme)}

    .export-control {
      display: flex;
      flex-direction: column;
      gap: 10px;

      .export-start {
        display: flex;
        flex-direction: column;
        gap: 10px;

        @media (min-width: ${theme.screens.sm}) {
          flex-direction: row;
          align-items: center;

          & > div:first-of-type {
            max-width: 160px;
          }
        }
      }
    }

    .export-files {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;

      button {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 10px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;
        background: ${theme.colors.white};
        cursor: pointer;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
        text-align: left;

        &:hover:not(:disabled) {
          background: ${theme.colors.bastille}08;
        }

        svg {
          width: 18px;
          height: 18px;
        }

        span {
          flex: 1;
        }

        small {
          color: ${theme.colors.bastille}80;
        }
      }
    }

    .import-mode {
      flex-direction: column;

      @media (min-width: ${theme.screens.sm}) {
        flex-direction: row;
      }
    }

    .import-file {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;

      .import-file-name {
        font-weight: 600;
      }

      & > div:last-of-type:not(:first-of-type) {
        max-width: 220px;
      }
    }

    .import-header {
      display: flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
      min-width: 160px;
      margin: -6px 0 0 -8px;
    }

    .import-mapping {
      display: flex;
      flex-direction: column;
      gap: 8px;

      .import-mapping-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }

      .import-mapping-header {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .import-preview {
      overflow: auto;
      max-height: 320px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;

      table {
        border-collapse: collapse;
        width: 100%;
        font-size: ${theme.fonts.xs};
      }

      th,
      td {
        padding: 6px 10px;
        border-bottom: 1px solid ${theme.colors.alto}80;
        text-align: left;
        white-space: nowrap;
        max-width: 240px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      th {
        position: sticky;
        top: 0;
        background: ${theme.colors.white};
        font-weight: 700;
      }

      tr.has-error td:first-of-type {
        color: ${theme.colors.thunderbird};
        font-weight: 700;
      }

      td.bad {
        background: ${theme.colors.fairPink};
        color: ${theme.colors.thunderbird};
      }

      td.unsure {
        background: ${theme.colors.earlyDawn};
        color: ${theme.colors.romanCoffee};
      }
    }

    .import-unmatched {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .import-errors {
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.thunderbird};

      .import-guess {
        color: ${theme.colors.romanCoffee};
      }
    }

    .import-progress,
    .import-done {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: stretch;

      .MuiButtonBase-root.MuiButton-root {
        align-self: flex-start;
      }
    }
  `}
`;

// The row form, in a drawer outside the page's wrapper.
export const PanelContent = styled.div`
  ${({ theme }) => css`
    width: 100vw;
    max-width: 480px;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px 20px 24px;
    box-sizing: border-box;
    font-size: ${theme.fonts.sm};
    color: ${theme.colors.bastille};

    ${buttonReset}

    .panel-header {
      display: flex;
      align-items: center;
      gap: 4px;

      .panel-title {
        flex: 1;
        font-size: ${theme.fonts.lg};
        margin: 0;
      }
    }

    .panel-conflict {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
      padding: 12px;
      border-radius: 8px;
      background: ${theme.colors.earlyDawn};

      p {
        margin: 0;
      }
    }

    .panel-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .data-json-input textarea {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: ${theme.fonts.xs};
    }

    .panel-muted {
      color: ${theme.colors.bastille}99;
      margin: 0;
    }

    .panel-meta {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 16px;
      margin: 0;
      font-size: ${theme.fonts.xs};

      dt {
        color: ${theme.colors.bastille}99;
      }

      dd {
        margin: 0;
      }
    }

    .panel-actions {
      display: flex;
      gap: 8px;
      margin-top: auto;
      position: sticky;
      bottom: 0;
      padding-top: 12px;
      background: ${theme.colors.white};
    }
  `}
`;

export const FooterActions = styled.div`
  ${({ theme }) => css`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;

    && .MuiButtonBase-root.MuiButton-text,
    && .MuiButtonBase-root.MuiButton-outlined {
      color: ${theme.colors.bastille};

      &.Mui-disabled {
        color: ${theme.colors.bastille}59;
      }
    }
  `}
`;
