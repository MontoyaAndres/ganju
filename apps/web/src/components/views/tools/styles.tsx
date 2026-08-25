import { css, type Theme } from '@emotion/react';
import styled from '@emotion/styled';

/**
 * A JSON field: Monaco in a box that reads like the fields around it, plus
 * whatever the language service has to say about what is in it.
 *
 * Shared rather than declared inside one of the components below, because the
 * same field appears on the page (the sample-input box) and inside the modals
 * (both schemas, the body template, the whole-config editor) — and those are two
 * separate styled components. Declared in only one of them, the other renders an
 * unstyled stack: a bare label, a bordered Format button on its own line, and no
 * box around the editor.
 */
const jsonField = (theme: Theme) => css`
  .tools-json-field {
    margin-bottom: 16px;

    .tools-json-field-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
      font-size: ${theme.fonts.sm};
      font-weight: 600;
      color: ${theme.colors.bastille};
    }

    .tools-json-field-head-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .tools-json-format {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      font: inherit;
      font-weight: 500;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}99;

      &:hover {
        color: ${theme.colors.bastille};
      }

      svg {
        width: 14px;
        height: 14px;
      }
    }

    .tools-json-field-surface {
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;
      overflow: hidden;
      background-color: ${theme.colors.white};
    }

    &.invalid .tools-json-field-surface {
      border-color: ${theme.colors.thunderbird};
    }

    .tools-json-field-errors {
      margin: 6px 0 0 0;
      padding-left: 18px;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.thunderbird};
    }

    .tools-json-field-help {
      display: block;
      margin-top: 6px;
      font-size: ${theme.fonts.xs};
      color: ${theme.colors.bastille}80;
      line-height: 1.5;
    }

    .tools-json-loading {
      padding: 8px;
    }

    &.compact {
      margin-bottom: 0;

      .tools-json-field-head {
        margin-bottom: 6px;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
      }

      .MuiButtonBase-root {
        padding: 2px 12px;
        min-height: 26px;
        border-radius: 8px;
        text-transform: none;
        font-size: ${theme.fonts.xs};
        line-height: 1.4;

        .button-text {
          font-weight: 600;
        }

        svg {
          width: 14px;
          height: 14px;
        }
      }
    }
  }
`;

export const Wrapper = styled.div`
  ${({ theme }) => css`
    ${jsonField(theme)}

    height: calc(100vh - 60px);

    @media (min-width: ${theme.screens.xl}) {
      height: 100vh;
    }

    .tools-container {
      padding: 20px;
      max-width: 1100px;
      margin: 0 auto;

      @media (min-width: ${theme.screens.xl}) {
        padding: 28px 32px;
      }
    }

    .tools-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 20px;

      .tools-header-text {
        flex: 1;
        min-width: 0;
        max-width: 640px;
      }

      .tools-title {
        font-size: ${theme.fonts['2xl']};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-subtitle {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 6px 0 0 0;
        line-height: 1.4;
      }
    }

    .tools-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: ${theme.fonts.sm};

      & > svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      & > span {
        flex: 1;
        line-height: 1.4;
      }

      &.tools-banner-success {
        background-color: ${theme.colors.peppermint};
        color: ${theme.colors.parsley};

        & > svg {
          color: ${theme.colors.japaneseLaurel};
        }
      }

      &.tools-banner-warning {
        background-color: ${theme.colors.earlyDawn};
        color: ${theme.colors.romanCoffee};

        & > svg {
          color: ${theme.colors.tahitiGold};
        }
      }

      &.tools-banner-error {
        background-color: ${theme.colors.fairPink};
        color: ${theme.colors.thunderbird};

        & > svg {
          color: ${theme.colors.thunderbird};
        }
      }
    }

    .tools-tabs {
      display: flex;
      gap: 4px;
      border-bottom: 1px solid ${theme.colors.alto};
      margin-bottom: 20px;

      .tools-tab {
        position: relative;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 16px;
        border: none;
        background: none;
        cursor: pointer;
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.saltBox};
        transition: color 0.15s ease;

        .tools-tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 10px;
          background-color: ${theme.colors.bastille}0F;
          color: ${theme.colors.bastille}CC;
          font-size: ${theme.fonts.xs};
          font-weight: 600;
        }

        &:hover {
          color: ${theme.colors.bastille};
        }

        &.active {
          color: ${theme.colors.bastille};

          &::after {
            content: '';
            position: absolute;
            left: 8px;
            right: 8px;
            bottom: -1px;
            height: 2px;
            background-color: ${theme.colors.bastille};
            border-radius: 2px 2px 0 0;
          }
        }

        &.locked {
          opacity: 0.45;

          svg {
            width: 14px;
            height: 14px;
          }
        }
      }
    }

    .tools-functions-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;

      .MuiButtonBase-root {
        font-size: ${theme.fonts.sm};
        padding: 6px 16px;
        border-radius: 8px;
        text-transform: none;

        .button-text {
          font-weight: 600;
        }
      }
    }

    .tools-inline-link {
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      font: inherit;
      color: inherit;
      text-decoration: underline;
    }

    .tools-version-picker {
      min-width: 190px;

      .MuiInputBase-root {
        font-size: ${theme.fonts.sm};
      }

      .MuiInputBase-input {
        padding-top: 8.5px;
        padding-bottom: 8.5px;
      }
    }

    .tools-version-chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      background-color: ${theme.colors.bastille}14;
      color: ${theme.colors.bastille}CC;

      &.published {
        background-color: ${theme.colors.peppermint};
        color: ${theme.colors.parsley};
      }

      &.live {
        background-color: ${theme.colors.peppermint};
        color: ${theme.colors.parsley};
      }

      &.draft {
        background-color: ${theme.colors.earlyDawn};
        color: ${theme.colors.romanCoffee};
      }
    }

    .tools-state-chip {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: ${theme.fonts.xs};
      font-weight: 600;
      white-space: nowrap;
      background-color: ${theme.colors.bastille}14;
      color: ${theme.colors.bastille}99;
    }

    .tools-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 12px 20px;
      margin: 0 0 16px 0;
      padding: 12px 14px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;

      dt {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
        margin-bottom: 3px;
      }

      dd {
        margin: 0;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
      }
    }

    .tools-ide {
      margin-top: 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
      overflow: hidden;

      .tools-ide-body {
        display: grid;
        grid-template-columns: 1fr;

        @media (min-width: ${theme.screens.md}) {
          grid-template-columns: 220px 1fr;
        }
      }

      .tools-ide-surface {
        min-width: 0;
        border-top: 1px solid ${theme.colors.alto};

        @media (min-width: ${theme.screens.md}) {
          border-top: none;
          border-left: 1px solid ${theme.colors.alto};
        }
      }

      /* VS Code's Explorer, at its own scale and in this app's palette.
         What makes it recognisable is the shape and the behaviour — the
         twisties, the indent guides, the 22px rows, the hover-revealed toolbar,
         rename in place — not VS Code's particular greys, so the greys are ours.
         Named here as roles rather than repeated as interpolations below, which
         is also the list to read if this ever needs a dark variant.
         The one exception is the file-type icons: those are identity colours
         and live in the theme beside the channel brand colours. */
      .tools-explorer {
        --exp-bg: ${theme.colors.bastille}08;
        --exp-fg: ${theme.colors.bastille}CC;
        --exp-strong: ${theme.colors.bastille};
        --exp-muted: ${theme.colors.bastille}80;
        --exp-hover: ${theme.colors.bastille}0F;
        --exp-press: ${theme.colors.bastille}1A;
        --exp-selected: ${theme.colors.indigo}24;
        --exp-focus: ${theme.colors.indigo};
        --exp-on-focus: ${theme.colors.white};
        --exp-guide: ${theme.colors.alto};
        --exp-line: ${theme.colors.alto};
        --exp-surface: ${theme.colors.white};
        --exp-danger: ${theme.colors.thunderbird};
        --exp-danger-bg: ${theme.colors.fairPink};

        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 160px;
        overflow: hidden;
        background-color: var(--exp-bg);
        color: var(--exp-fg);
        font-size: 13px;
        user-select: none;

        .tools-explorer-title {
          padding: 8px 12px 6px;
          font-size: 11px;
          font-weight: 400;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--exp-muted);
        }

        .tools-explorer-section {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 22px;
          padding-right: 4px;

          /* VS Code reveals the section's actions on hover over the whole
             section, not over each button — so the row is the hover target. */
          &:hover .tools-explorer-actions button,
          &:focus-within .tools-explorer-actions button {
            opacity: 1;
          }
        }

        .tools-explorer-section-label {
          display: flex;
          align-items: center;
          gap: 2px;
          flex: 1;
          min-width: 0;
          height: 100%;
          padding: 0 4px 0 2px;
          border: none;
          background: none;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: var(--exp-strong);
          text-align: left;
        }

        .tools-explorer-actions {
          display: flex;
          align-items: center;
          gap: 1px;
          flex-shrink: 0;

          button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            padding: 0;
            border: none;
            border-radius: 5px;
            background: none;
            cursor: pointer;
            color: var(--exp-strong);
            /* Hidden until the section is hovered, as in VS Code — the tree is
               the content, and three icons sitting on it permanently is three
               things to read past every time. Keyboard focus reveals them too,
               or they would be unreachable without a mouse. */
            opacity: 0;
            transition: opacity 0.1s ease;

            &:hover {
              background-color: var(--exp-press);
            }

            &:focus-visible {
              opacity: 1;
              outline: 1px solid var(--exp-focus);
            }

            svg {
              width: 16px;
              height: 16px;
            }
          }
        }

        .tools-explorer-tree {
          flex: 1;
          /* Without this the flex item grows to its content and the sidebar
             pushes the editor's height instead of scrolling. */
          min-height: 0;
          overflow: auto;
          padding-bottom: 8px;
          outline: none;

          /* The list only paints the strong selection while it has focus, which
             is how VS Code distinguishes "this row is selected" from "this row
             is what your keyboard is pointing at". */
          &:focus-visible .tools-explorer-row.selected {
            background-color: var(--exp-focus);
            color: var(--exp-on-focus);

            .tools-explorer-twisty,
            .tools-explorer-icon.folder,
            .tools-explorer-icon.plain,
            .tools-explorer-badge {
              color: var(--exp-on-focus);
            }
          }
        }

        .tools-explorer-row {
          position: relative;
          display: flex;
          align-items: center;
          gap: 3px;
          height: 22px;
          padding-right: 6px;
          cursor: pointer;
          white-space: nowrap;

          &:hover {
            background-color: var(--exp-hover);
          }

          &.selected {
            background-color: var(--exp-selected);
          }

          /* The file the editor is showing. VS Code marks it in the tab, not in
             the tree — here there is one tab and it is a label, so the tree is
             the only place the open file can be pointed at. */
          &.active .tools-explorer-name {
            font-weight: 600;
          }

          &.attached {
            cursor: default;
            opacity: 0.6;

            &:hover {
              background-color: transparent;
            }
          }

          &.draft {
            background-color: transparent;
            cursor: default;
          }
        }

        .tools-explorer-name {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tools-explorer-badge {
          margin-left: auto;
          padding-left: 8px;
          font-size: 10px;
          color: var(--exp-muted);
        }

        /* One 8px column per ancestor level, each drawing the vertical guide
           that tells you which folder a deep row belongs to. */
        .tools-explorer-indent {
          display: flex;
          flex-shrink: 0;
        }

        .tools-explorer-guide {
          width: 8px;
          height: 22px;
          margin-left: 4px;
          border-left: 1px solid var(--exp-guide);
        }

        .tools-explorer-twisty,
        .tools-explorer-twisty-slot {
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .tools-explorer-twisty {
          color: var(--exp-muted);
        }

        .tools-explorer-icon {
          width: 16px;
          height: 16px;
          flex-shrink: 0;

          /* Seti's colours, so a .js file is the same yellow here as in the
             editor the author has open on another screen. */
          &.js {
            color: ${theme.fileIcons.js};
          }

          &.json {
            color: ${theme.fileIcons.json};
          }

          &.folder {
            color: ${theme.fileIcons.folder};
          }

          &.plain {
            color: ${theme.colors.saltBox};
          }
        }

        .tools-explorer-input {
          display: flex;
          flex: 1;
          min-width: 0;

          input {
            flex: 1;
            min-width: 0;
            height: 18px;
            padding: 0 4px;
            border: 1px solid var(--exp-focus);
            border-radius: 2px;
            background-color: var(--exp-surface);
            outline: none;
            font-family: inherit;
            font-size: 13px;
            color: var(--exp-strong);
          }

          &.invalid input {
            border-color: var(--exp-danger);
          }

          /* Absolutely placed so a name that fails validation doesn't push
             every row below it down while it is being corrected. */
          .tools-explorer-input-error {
            position: absolute;
            top: 100%;
            left: 24px;
            right: 6px;
            z-index: 5;
            padding: 3px 6px;
            border: 1px solid var(--exp-danger);
            border-top: none;
            background-color: var(--exp-danger-bg);
            font-size: 11px;
            line-height: 1.35;
            white-space: normal;
            color: var(--exp-danger);
          }
        }

        .tools-explorer-menu {
          position: fixed;
          z-index: 30;
          min-width: 170px;
          padding: 4px 0;
          border: 1px solid var(--exp-line);
          border-radius: 5px;
          background-color: var(--exp-surface);
          box-shadow: ${theme['custom-shadows'].small};

          button {
            display: block;
            width: 100%;
            padding: 4px 22px;
            border: none;
            background: none;
            cursor: pointer;
            font: inherit;
            font-size: 13px;
            color: var(--exp-strong);
            text-align: left;

            &:hover:not(:disabled) {
              background-color: var(--exp-focus);
              color: var(--exp-on-focus);
            }

            &:disabled {
              opacity: 0.4;
              cursor: default;
            }

            &.danger:hover:not(:disabled) {
              background-color: var(--exp-danger);
            }
          }

          .tools-explorer-menu-sep {
            display: block;
            margin: 4px 0;
            border-top: 1px solid var(--exp-line);
          }
        }
      }

      .tools-ide-bar,
      .tools-ide-status {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        background-color: ${theme.colors.bastille}08;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
      }

      .tools-ide-bar {
        border-bottom: 1px solid ${theme.colors.alto};
      }

      .tools-ide-status {
        border-top: 1px solid ${theme.colors.alto};
      }

      .tools-ide-file {
        font-weight: 600;
        color: ${theme.colors.bastille}CC;
      }

      .tools-ide-flag {
        padding: 1px 7px;
        border-radius: 8px;
        font-weight: 600;
        background-color: ${theme.colors.bastille}14;
        color: ${theme.colors.bastille}99;

        &.unsaved {
          background-color: ${theme.colors.earlyDawn};
          color: ${theme.colors.romanCoffee};
        }
      }

      .tools-ide-bar-right,
      .tools-ide-status-right {
        margin-left: auto;
      }

      .monaco-editor,
      .monaco-editor-background,
      .monaco-editor .margin {
        background-color: transparent;
      }

      .monaco-editor .margin-view-overlays .line-numbers {
        color: ${theme.colors.bastille}66;
      }

      .monaco-editor .scroll-decoration {
        box-shadow: none;
      }

      &.readonly {
        .monaco-editor,
        .monaco-editor-background,
        .monaco-editor .margin {
          background-color: ${theme.colors.bastille}06;
        }

        .monaco-editor .cursors-layer > .cursor {
          display: none;
        }

        .monaco-editor .current-line {
          display: none;
        }
      }
    }

    .tools-ide-notice {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid ${theme.colors.alto};
      background-color: ${theme.colors.earlyDawn};
      font-size: ${theme.fonts.xs};
      line-height: 1.55;
      color: ${theme.colors.romanCoffee};

      & > svg {
        flex-shrink: 0;
        width: 16px;
        height: 16px;
      }

      code {
        padding: 0 4px;
        border-radius: 4px;
        background-color: ${theme.colors.bastille}0F;
        font-family: monospace;
      }
    }

    .tools-ide-loading {
      margin-top: 16px;
      padding: 12px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
    }

    .tools-budget {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      margin-bottom: 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;

      .tools-budget-text {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}CC;

        strong {
          color: ${theme.colors.bastille};
        }
      }

      .tools-budget-hint {
        display: block;
        margin-top: 2px;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
      }

      .tools-budget-bar {
        height: 4px;
        border-radius: 2px;
        background-color: ${theme.colors.bastille}14;
        overflow: hidden;

        span {
          display: block;
          height: 100%;
          border-radius: 2px;
          background-color: ${theme.colors.bastille}80;
          transition: width 0.2s ease;
        }
      }

      /* The bar is a Skeleton rather than the real element, so the track's own
         background would show through as a second rectangle. */
      &.loading .tools-budget-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      &.over {
        border-color: ${theme.colors.thunderbird}66;

        .tools-budget-hint {
          color: ${theme.colors.thunderbird};
        }

        .tools-budget-bar span {
          background-color: ${theme.colors.thunderbird};
        }
      }
    }

    .tools-filters {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;

      .tools-filter {
        padding: 6px 12px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 16px;
        background: none;
        cursor: pointer;
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        color: ${theme.colors.saltBox};
        transition:
          color 0.15s ease,
          border-color 0.15s ease,
          background-color 0.15s ease;

        &:hover {
          color: ${theme.colors.bastille};
        }

        &.active {
          border-color: ${theme.colors.bastille};
          background-color: ${theme.colors.bastille};
          color: ${theme.colors.white};
        }
      }
    }

    .tools-group-detail-item-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    .tools-section-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 16px;

      .tools-section-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0 0 4px 0;
      }

      .tools-section-subtitle {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0;
      }

      .MuiButtonBase-root {
        font-size: ${theme.fonts.sm};
        padding: 6px 16px;
        border-radius: 8px;
        text-transform: none;

        .button-text {
          font-weight: 600;
        }
      }
    }

    .tools-function-list {
      display: flex;
      flex-direction: column;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
      overflow: hidden;

      /* Same box as a real row, so the list doesn't resize when one replaces
         the other. */
      .tools-function-item-skeleton {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;

        & + .tools-function-item-skeleton {
          border-top: 1px solid ${theme.colors.alto};
        }

        .tools-function-item-skeleton-main {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
          min-width: 0;
        }

        .tools-function-item-skeleton-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
      }

      .tools-function-item {
        display: flex;
        flex-direction: column;
        padding: 14px 16px;

        & + .tools-function-item {
          border-top: 1px solid ${theme.colors.alto};
        }

        .tools-function-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .tools-function-item-main {
          min-width: 0;
          flex: 1;
          border: none;
          background: none;
          padding: 0;
          text-align: left;
          font: inherit;
          color: inherit;
        }

        button.tools-function-item-main {
          cursor: pointer;
        }

        .tools-function-item-tags {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 6px;
        }

        .tools-function-tag {
          padding: 1px 7px;
          border-radius: 8px;
          font-size: ${theme.fonts.xs};
          background-color: ${theme.colors.bastille}0F;
          color: ${theme.colors.bastille}99;
        }

        .tools-function-chevron {
          color: ${theme.colors.bastille}66;
          transition: transform 0.15s ease;

          &.open {
            transform: rotate(180deg);
          }
        }

        .tools-function-item-detail {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
          margin-top: 12px;
        }

        .tools-function-detail-label {
          margin: 0 0 4px 0;
          font-size: ${theme.fonts.xs};
          font-weight: 600;
          color: ${theme.colors.bastille}99;
        }

        .tools-function-detail-code {
          margin: 0;
          padding: 10px 12px;
          border-radius: 8px;
          background-color: ${theme.colors.bastille}08;
          font-family: monospace;
          font-size: ${theme.fonts.xs};
          line-height: 1.6;
          color: ${theme.colors.bastille}CC;
          overflow-x: auto;
        }

        .tools-function-detail-empty {
          margin: 0;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}80;
        }

        .tools-function-test {
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px dashed ${theme.colors.alto};

          .tools-function-detail-empty {
            margin-top: 8px;
          }
        }

        .tools-function-test-result {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 12px;
        }

        .tools-test-block {
          padding: 10px 12px;
          border-radius: 8px;
          background-color: ${theme.colors.bastille}08;

          .tools-function-detail-label {
            margin-bottom: 4px;
          }

          pre {
            margin: 0;
            font-family: monospace;
            font-size: ${theme.fonts.xs};
            line-height: 1.6;
            color: ${theme.colors.bastille}CC;
            white-space: pre-wrap;
            word-break: break-word;
          }

          ul {
            margin: 0;
            padding-left: 18px;
            font-size: ${theme.fonts.xs};
            line-height: 1.7;
            color: ${theme.colors.bastille}CC;
          }

          code {
            font-family: monospace;
            color: ${theme.colors.bastille};
          }

          &.error {
            background-color: ${theme.colors.fairPink};

            pre,
            ul,
            code,
            .tools-function-detail-label {
              color: ${theme.colors.thunderbird};
            }
          }
        }

        .tools-function-item-title {
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
        }

        .tools-function-item-description {
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}99;
          margin: 2px 0 0 0;
        }

        .tools-function-item-id {
          display: inline-block;
          margin-top: 6px;
          font-family: monospace;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}80;
          word-break: break-all;
        }

        .tools-function-item-actions {
          display: flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
      }
    }

    .tools-locked {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px 20px 48px;
      text-align: center;

      .tools-locked-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 12px;
        background-color: ${theme.colors.bastille};
        color: ${theme.colors.white};
        font-size: ${theme.fonts.xs};
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;

        svg {
          width: 13px;
          height: 13px;
        }
      }

      h3 {
        font-size: ${theme.fonts.lg};
        color: ${theme.colors.bastille};
        margin: 0;
      }

      & > p {
        max-width: 460px;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0;
      }

      .tools-locked-preview {
        width: 100%;
        max-width: 640px;
        margin: 8px 0 4px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 10px;
        overflow: hidden;
        opacity: 0.55;
        user-select: none;
        text-align: left;

        .tools-locked-preview-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid ${theme.colors.alto};
          background-color: ${theme.colors.bastille}08;

          .tools-locked-preview-dot {
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background-color: ${theme.colors.bastille}26;
          }

          .tools-locked-preview-file {
            margin-left: 6px;
            font-size: ${theme.fonts.xs};
            color: ${theme.colors.bastille}80;
          }
        }

        .tools-locked-preview-code {
          margin: 0;
          padding: 14px 16px;
          overflow-x: auto;
          font-family: monospace;
          font-size: ${theme.fonts.xs};
          line-height: 1.7;
          color: ${theme.colors.bastille}CC;
        }
      }
    }

    .tools-empty {
      font-size: ${theme.fonts.base};
      color: ${theme.colors.bastille}99;
      margin: 40px 0;
      text-align: center;
    }

    .tools-empty-state {
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

        .button-text {
          font-weight: 600;
        }
      }
    }

    .tools-group {
      margin-bottom: 24px;
    }

    .tools-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;

      .tools-group-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .tools-group-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        color: ${theme.colors.bastille};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${theme.fonts.base};
        font-weight: 700;
        flex-shrink: 0;

        img {
          width: 20px;
          height: 20px;
          object-fit: contain;
        }
      }

      .tools-group-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-group-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
        margin: 2px 0 0 0;
      }

      .MuiButtonBase-root {
        font-size: ${theme.fonts.xs};
        padding: 4px 12px;
        border-radius: 6px;
        text-transform: none;
        display: flex;
        align-items: center;
        gap: 4px;

        & > svg {
          width: 14px;
          height: 14px;
        }

        .button-text {
          font-weight: 600;
        }
      }
    }

    .tools-accordion {
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
      background-color: ${theme.colors.white};
      margin-bottom: 10px;
      overflow: hidden;
      transition: border-color 0.15s ease;

      &:hover {
        border-color: ${theme.colors.bastille}40;
      }

      &.expanded {
        border-color: ${theme.colors.bastille}40;

        .tools-accordion-chevron {
          transform: rotate(180deg);
        }
      }
    }

    .tools-accordion-header {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: none;
      cursor: pointer;
      text-align: left;
      gap: 12px;

      .tools-accordion-chevron-wrap {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${theme.colors.saltBox};
        transition:
          background-color 0.2s ease,
          color 0.2s ease;
      }

      .tools-accordion-chevron {
        width: 20px;
        height: 20px;
        transition: transform 0.25s ease;
      }

      &:hover {
        background-color: ${theme.colors.bastille}04;

        .tools-group-icon {
          border-color: ${theme.colors.bastille}30;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }

        .tools-accordion-chevron-wrap {
          background-color: ${theme.colors.bastille}0F;
          color: ${theme.colors.bastille};
        }
      }

      .tools-accordion-header-info {
        display: flex;
        align-items: center;
        gap: 14px;
        flex: 1;
        min-width: 0;

        .tools-accordion-chevron-wrap.inline {
          margin-left: auto;
        }
      }

      .tools-group-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        border: 1px solid ${theme.colors.alto};
        color: ${theme.colors.bastille};
        font-size: ${theme.fonts.lg};
        font-weight: 700;
        display: flex;
        justify-content: center;
        align-items: center;
        transition: all 0.2s ease;

        img {
          width: 26px;
          height: 26px;
        }
      }

      .tools-accordion-header-texts {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;

        .tools-group-title {
          font-size: ${theme.fonts.base};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
        }

        .tools-group-meta {
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}99;
          margin: 0;
        }
      }

      .tools-accordion-header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        align-self: stretch;
        gap: 8px;
        flex-shrink: 0;
        flex-wrap: wrap;

        .MuiButtonBase-root {
          font-size: ${theme.fonts.xs};
          padding: 4px 12px;
          border-radius: 6px;
          text-transform: none;
          display: flex;
          align-items: center;
          gap: 4px;

          & > svg {
            width: 14px;
            height: 14px;
          }

          .button-text {
            font-weight: 600;
          }
        }
      }
    }

    .tools-accordion-body {
      padding: 0 16px 16px;
      border-top: 1px solid ${theme.colors.alto};
      padding-top: 14px;

      .tools-banner {
        margin-bottom: 12px;
      }
    }

    .tools-installed-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tools-installed-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;
      background-color: ${theme.colors.white};
      transition: border-color 0.15s ease;
      gap: 12px;

      &:hover {
        border-color: ${theme.colors.bastille}40;
      }

      .tools-installed-item-main {
        flex: 1;
        min-width: 0;
      }

      .tools-installed-item-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-installed-item-description {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        line-height: 1.4;
      }

      .tools-installed-item-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.saltBox};
        margin: 6px 0 0 0;
      }

      .tools-installed-item-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;

        .MuiIconButton-root {
          padding: 6px;

          & > svg {
            width: 18px;
            height: 18px;
          }
        }
      }
    }

    .tools-catalog-controls {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: center;
      }
    }

    .tools-search {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;
      background-color: ${theme.colors.white};
      transition: border-color 0.15s ease;
      flex: 1;
      min-width: 0;

      &:focus-within {
        border-color: ${theme.colors.bastille}60;
      }

      & > svg {
        width: 18px;
        height: 18px;
        color: ${theme.colors.saltBox};
        flex-shrink: 0;
      }

      input {
        flex: 1;
        border: none;
        outline: none;
        background: none;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};

        &::placeholder {
          color: ${theme.colors.bastille}60;
        }
      }
    }

    .tools-catalog-groups {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;

      @media (min-width: ${theme.screens.md}) {
        grid-template-columns: repeat(2, 1fr);
      }

      @media (min-width: ${theme.screens.xl}) {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .tools-installed-skeleton {
      display: flex;
      flex-direction: column;

      .tools-accordion-header-texts {
        display: flex;
        flex-direction: column;
        gap: 6px;
        flex: 1;
      }
    }

    .tools-catalog-group-card-skeleton {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
      background-color: ${theme.colors.white};

      .tools-catalog-group-card-skeleton-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
    }

    .tools-catalog-group-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
      background-color: ${theme.colors.white};
      cursor: pointer;
      text-align: left;
      transition: all 0.15s ease;

      &:hover {
        border-color: ${theme.colors.bastille}60;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);

        .tools-catalog-group-icon {
          border-color: ${theme.colors.bastille}30;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
        }
      }

      .tools-catalog-group-icon {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        border: 1px solid ${theme.colors.alto};
        color: ${theme.colors.bastille};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${theme.fonts.lg};
        font-weight: 700;
        flex-shrink: 0;

        img {
          width: 26px;
          height: 26px;
          object-fit: contain;
        }
      }

      .tools-catalog-group-body {
        flex: 1;
        min-width: 0;
      }

      .tools-catalog-group-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tools-catalog-group-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-catalog-group-connected,
      .tools-catalog-group-expired {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 8px;
        text-transform: uppercase;
        letter-spacing: 0.4px;

        & > svg {
          width: 10px;
          height: 10px;
        }
      }

      .tools-catalog-group-connected {
        color: ${theme.colors.japaneseLaurel};
        background-color: ${theme.colors.peppermint};
      }

      .tools-catalog-group-expired {
        color: ${theme.colors.thunderbird};
        background-color: ${theme.colors.fairPink};
      }

      .tools-catalog-group-description {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .tools-catalog-group-meta {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.saltBox};
        margin: 8px 0 0 0;
        font-weight: 600;
      }
    }

    .tools-group-detail-back {
      display: flex;
      align-items: center;
      gap: 4px;
      border: none;
      background: none;
      padding: 4px 0;
      cursor: pointer;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.saltBox};
      margin-bottom: 12px;

      &:hover {
        color: ${theme.colors.bastille};
      }

      & > svg {
        width: 18px;
        height: 18px;
      }
    }

    .tools-group-detail-header {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      padding: 18px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 10px;
      background-color: ${theme.colors.white};
      margin-bottom: 16px;

      @media (min-width: ${theme.screens.md}) {
        flex-direction: row;
        align-items: center;
      }

      .tools-group-detail-icon {
        width: 52px;
        height: 52px;
        border-radius: 10px;
        background-color: ${theme.colors.bastille}0A;
        color: ${theme.colors.bastille};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${theme.fonts.xl};
        font-weight: 700;
        flex-shrink: 0;

        img {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }
      }

      .tools-group-detail-info {
        flex: 1;
        min-width: 0;
      }

      .tools-group-detail-title {
        font-size: ${theme.fonts.lg};
        font-weight: 700;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-group-detail-description {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        line-height: 1.4;
      }

      .tools-group-detail-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-shrink: 0;
        flex-wrap: wrap;

        .MuiButtonBase-root {
          font-size: ${theme.fonts.sm};
          padding: 6px 14px;
          border-radius: 8px;
          text-transform: none;
          display: flex;
          align-items: center;
          gap: 6px;

          & > svg {
            width: 16px;
            height: 16px;
          }

          .button-text {
            font-weight: 600;
          }
        }

        .tools-group-detail-connected-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          color: ${theme.colors.japaneseLaurel};
          background-color: ${theme.colors.peppermint};
          padding: 6px 10px;
          border-radius: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;

          & > svg {
            width: 14px;
            height: 14px;
          }
        }

        .tools-group-detail-expired-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          color: ${theme.colors.thunderbird};
          background-color: ${theme.colors.fairPink};
          padding: 6px 10px;
          border-radius: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;

          & > svg {
            width: 14px;
            height: 14px;
          }
        }
      }
    }

    .tools-group-detail-config {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-bottom: 16px;
      max-width: 440px;
    }

    .tools-group-detail-config-hint {
      margin: 0;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.bastille}99;
    }

    .tools-group-detail-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tools-http-endpoints {
      display: flex;
      flex-direction: column;
      gap: 12px;

      .tools-http-endpoints-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;

        .tools-http-endpoints-hint {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 0;
          line-height: 1.4;
        }

        .MuiButtonBase-root {
          font-size: ${theme.fonts.sm};
          padding: 6px 14px;
          border-radius: 8px;
          text-transform: none;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 6px;

          & > svg {
            width: 16px;
            height: 16px;
          }

          .button-text {
            font-weight: 600;
          }
        }
      }
    }

    .tools-http-endpoints-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .tools-http-endpoint-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;

      .tools-http-endpoint-item-main {
        min-width: 0;
        flex: 1;
      }

      .tools-http-endpoint-item-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-http-endpoint-item-url {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        word-break: break-all;

        .tools-http-endpoint-method {
          font-size: ${theme.fonts.xs};
          font-weight: 700;
          color: ${theme.colors.bastille};
          background-color: ${theme.colors.bastille}0A;
          padding: 2px 6px;
          border-radius: 4px;
          flex-shrink: 0;
        }
      }

      .tools-http-endpoint-item-description {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        line-height: 1.4;
      }
    }

    .tools-group-detail-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border: 1px solid ${theme.colors.alto};
      border-radius: 8px;
      background-color: ${theme.colors.white};
      transition: border-color 0.15s ease;

      &:hover {
        border-color: ${theme.colors.bastille}40;
      }

      &.disabled {
        opacity: 0.6;
      }

      .tools-group-detail-item-main {
        flex: 1;
        min-width: 0;
      }

      .tools-group-detail-item-title {
        font-size: ${theme.fonts.base};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
      }

      .tools-group-detail-item-description {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        line-height: 1.4;
      }

      .tools-group-detail-item-scopes {
        font-size: 10px;
        font-weight: 600;
        color: ${theme.colors.saltBox};
        background-color: ${theme.colors.bastille}08;
        padding: 2px 6px;
        border-radius: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 6px;
        display: inline-block;
        cursor: help;
      }
    }
  `}
`;

export const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;

  @media (max-width: 768px) {
    padding: 0;
  }
`;

export const ModalDialog = styled.div`
  ${({ theme }) => css`
    background-color: ${theme.colors.white};
    border-radius: 12px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);

    &.http-endpoint-dialog {
      max-width: 720px;
    }

    &.function-dialog {
      max-width: 640px;
    }

    .tools-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid ${theme.colors.alto};

      .tools-modal-title {
        font-size: ${theme.fonts.lg};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .http-endpoint-mode-toggle {
        display: flex;
        border: 1px solid ${theme.colors.alto};
        border-radius: 6px;
        overflow: hidden;
        margin-right: 4px;

        .http-endpoint-mode-btn {
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

          &:hover:not(:disabled) {
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

          & + .http-endpoint-mode-btn {
            border-left: 1px solid ${theme.colors.alto};
          }
        }
      }
    }

    .tools-field {
      display: block;
      margin-bottom: 16px;

      & > span {
        display: block;
        margin-bottom: 6px;
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
      }

      & > small {
        display: block;
        margin-top: 5px;
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}80;
        line-height: 1.45;
      }

      input,
      textarea {
        width: 100%;
        padding: 9px 12px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;
        outline: none;
        font-family: inherit;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
        resize: vertical;

        &:focus {
          border-color: ${theme.colors.bastille};
        }
      }
    }

    ${jsonField(theme)}

    .tools-field-error {
      margin: 0 0 8px 0;
      font-size: ${theme.fonts.sm};
      color: ${theme.colors.thunderbird};
    }

    .tools-modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;

      .tools-configure-help {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille}99;
        margin: 0 0 12px 0;
        line-height: 1.5;

        code {
          font-family: monospace;
          font-size: ${theme.fonts.xs};
          background-color: ${theme.colors.bastille}0A;
          padding: 1px 6px;
          border-radius: 4px;
        }
      }

      .tools-config-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .tools-config-field-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .tools-config-field-label {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 0;
        line-height: 1.4;
      }

      .tools-config-field-help {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.bastille}99;
        margin: 4px 0 0 0;
        line-height: 1.4;
      }

      .tools-config-weekdays {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 10px;
      }

      .tools-config-weekday {
        padding: 6px 12px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 6px;
        background-color: ${theme.colors.white};
        color: ${theme.colors.bastille};
        font-size: ${theme.fonts.sm};
        font-weight: 500;
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;

        &:hover:not(:disabled):not(.active) {
          border-color: ${theme.colors.bastille}40;
        }

        &.active {
          background-color: ${theme.colors.bastille};
          border-color: ${theme.colors.bastille};
          color: ${theme.colors.white};
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }

      .http-endpoint-form {
        display: flex;
        flex-direction: column;
        gap: 16px;

        .http-endpoint-section {
          margin: 0;
        }
      }

      .http-endpoint-section {
        font-size: ${theme.fonts.sm};
        font-weight: 600;
        color: ${theme.colors.bastille};
        margin: 10px 0 20px 0;
      }

      .http-endpoint-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;

        > * {
          flex: 1;
        }
      }

      .http-endpoint-method {
        max-width: 160px;
        flex: 0 0 160px;
      }

      .http-endpoint-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 10px;
      }

      .http-endpoint-list-hint {
        font-size: ${theme.fonts.xs};
        color: ${theme.colors.saltBox};
        margin: -2px 0 2px 0;
        line-height: 1.4;
      }

      .http-endpoint-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;

        span {
          font-size: ${theme.fonts.sm};
          font-weight: 600;
          color: ${theme.colors.bastille};
        }

        .MuiButtonBase-root {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: ${theme.fonts.sm};
          padding: 6px 16px;
          border-radius: 6px;
          text-transform: none;

          & > svg {
            width: 14px;
            height: 14px;
          }
        }
      }

      .http-endpoint-kv {
        display: flex;
        gap: 8px;
        align-items: center;

        > div:first-of-type {
          flex: 0 0 38%;
        }
        > div {
          flex: 1;
        }
      }

      .http-endpoint-arg {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 10px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;
      }

      .http-endpoint-arg-header {
        display: flex;
        gap: 8px;
        align-items: center;

        > div:first-of-type {
          flex: 1;
        }
      }

      .http-endpoint-arg-required {
        flex-shrink: 0;
        white-space: nowrap;
        margin: 0;

        .MuiFormControlLabel-label {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille};
        }
      }

      .http-endpoint-arg-fields {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 10px;
      }

      .http-endpoint-add-secret.MuiButtonBase-root {
        width: auto;
        align-self: flex-start;
        min-height: 0;
        font-size: ${theme.fonts.xs};
        padding: 12px;
        border-radius: 8px;
        text-transform: none;
        color: ${theme.colors.bastille};
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: background-color 0.15s ease;

        & > svg {
          width: 14px;
          height: 14px;
        }

        .button-text {
          font-weight: 600;
        }

        &:hover {
          background-color: ${theme.colors.bastille}12;
        }
      }

      .http-endpoint-new-secret {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border: 1px dashed ${theme.colors.alto};
        border-radius: 8px;
      }

      .http-endpoint-advanced {
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;
        overflow: hidden;
        margin-top: 10px;

        .http-endpoint-advanced-toggle {
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

        .http-endpoint-advanced-content {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          border-top: 1px solid ${theme.colors.alto};
        }
      }

      .http-endpoint-error {
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.red};
        margin: 0;
      }

      .mcp-proxy-list-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;

        .http-endpoint-section {
          margin: 0;
        }

        .mcp-proxy-list-actions {
          display: flex;
          gap: 4px;

          .MuiButtonBase-root {
            font-size: ${theme.fonts.sm};
            padding: 6px 16px;
            border-radius: 6px;
            text-transform: none;
          }
        }
      }

      .mcp-proxy-tool-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 320px;
        overflow-y: auto;
        padding-right: 2px;
      }

      .mcp-proxy-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border: 1px solid ${theme.colors.alto};
        border-radius: 8px;
        background-color: ${theme.colors.white};

        .mcp-proxy-item-main {
          flex: 1;
          min-width: 0;
        }

        .mcp-proxy-item-title {
          font-size: ${theme.fonts.base};
          font-weight: 600;
          color: ${theme.colors.bastille};
          margin: 0;
          word-break: break-word;
        }

        .mcp-proxy-item-description {
          font-size: ${theme.fonts.sm};
          color: ${theme.colors.bastille}99;
          margin: 4px 0 0 0;
          line-height: 1.4;
        }
      }

      .mcp-proxy-disconnect {
        margin-right: auto;
      }
    }

    .tools-modal-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 14px 20px;
      border-top: 1px solid ${theme.colors.alto};

      .MuiButtonBase-root {
        font-size: ${theme.fonts.sm};
        padding: 6px 16px;
        border-radius: 6px;
        text-transform: none;
      }

      .tools-modal-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-right: auto;
        font-size: ${theme.fonts.sm};
        color: ${theme.colors.bastille};
        cursor: pointer;

        small {
          display: block;
          font-size: ${theme.fonts.xs};
          color: ${theme.colors.bastille}80;
        }

        .MuiButtonBase-root {
          padding: 0;
        }
      }
    }

    @media (max-width: ${theme.screens.md}) {
      &.http-endpoint-dialog {
        max-width: 100%;
        width: 100%;
        max-height: 100%;
        height: 100%;
        border-radius: 0;
      }

      .tools-modal-header .http-endpoint-mode-toggle {
        margin-right: 0;
      }

      .tools-modal-body .http-endpoint-form {
        .http-endpoint-row {
          flex-direction: column;
          gap: 14px;
        }

        .http-endpoint-method {
          max-width: 100%;
          flex: 1;
        }

        .http-endpoint-kv > div:first-of-type {
          flex: 1;
        }

        .http-endpoint-arg-header {
          flex-wrap: wrap;
        }

        .http-endpoint-arg-fields {
          grid-template-columns: 1fr;
        }
      }
    }
  `}
`;
