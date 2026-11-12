import type { Database } from '@ganju/db';

import type { Bindings } from '../../types';

export type ItemArea =
  'functions' | 'data' | 'knowledge' | 'prompts' | 'tools' | 'bot';

/**
 * One line of a change set. Everything but `label` is set by the code that
 * staged it, so the card says what a click does from facts rather than from
 * the model's words.
 */
export interface StagedItem {
  area: ItemArea;
  op: string;
  payload: Record<string, unknown>;
  label: string;
  deletes?: string;
  // How Undo puts it back: step by step, by restoring the whole database to
  // just before it (anything saved since is lost), or not at all.
  undo?: 'reverse' | 'restore' | 'none';
  // What even Undo can't bring back.
  lost?: 'file' | 'credentials' | 'secret';
  // A table change in a database whose schema a developer pushes from code.
  managedByCode?: boolean;
}

export interface ItemScope {
  organizationId: string;
  projectId: string;
  artifactId: string;
  userId: string;
}

export interface ItemCaller {
  env: Bindings;
  db: Database;
}

export interface ItemHandler {
  // Returns what Undo needs.
  apply: (
    caller: ItemCaller,
    scope: ItemScope,
    item: StagedItem
  ) => Promise<unknown>;
  // Refuses before anything is undone, when newer work would be lost.
  check?: (
    caller: ItemCaller,
    scope: ItemScope,
    item: StagedItem,
    before: unknown
  ) => Promise<void>;
  undo: (
    caller: ItemCaller,
    scope: ItemScope,
    item: StagedItem,
    before: unknown
  ) => Promise<void>;
}

export class StagingError extends Error {}
