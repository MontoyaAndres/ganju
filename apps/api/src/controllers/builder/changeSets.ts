import { and, eq, inArray } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import * as customCodeActions from '../artifact/customCodeActions';
import { resolveCustomCodeToolReadOnly } from '../artifact/customCode';
import { dataHandler } from './dataItems';
import { projectHandler } from './projectItems';

import type { CustomCodeCaller } from '../artifact/customCodeActions';
import type { ItemHandler, ItemScope, StagedItem } from './items';

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

interface StoredItem extends StagedItem {
  undoable: boolean;
}

// One entry per item that applied, in order: what Undo needs to put it back.
// Entries saved before other areas existed are the functions' own shape.
interface Before {
  index: number;
  state?: unknown;
  undone?: boolean;
  activeVersionId?: string | null;
  appliedVersionId?: string;
}

const {
  BUILDER_CHANGE_SET_STATUS_PROPOSED: PROPOSED,
  BUILDER_CHANGE_SET_STATUS_APPLIED: APPLIED,
  BUILDER_CHANGE_SET_STATUS_FAILED: FAILED,
  BUILDER_CHANGE_SET_STATUS_UNDONE: UNDONE
} = utils.constants;

// Refusals the owner can act on: answered as 400 (a name to type) or 409.
export class ConfirmationError extends Error {}
export class UndoStoppedError extends Error {}

const loadChangeSet = async (
  caller: CustomCodeCaller,
  scope: Scope,
  changeSetId: string
) => {
  const [row] = await caller.db
    .select()
    .from(db.schema.builderChangeSet)
    .where(
      and(
        eq(db.schema.builderChangeSet.id, changeSetId),
        eq(db.schema.builderChangeSet.projectId, scope.projectId),
        eq(db.schema.builderChangeSet.organizationId, scope.organizationId)
      )
    )
    .limit(1);
  if (!row) throw new Error('Change set not found');
  return row;
};

const liveVersionId = async (caller: CustomCodeCaller, scope: Scope) =>
  (await customCodeActions.listVersions(caller, scope)).activeVersionId;

// Actions turned off (by the owner on the Tools page, or by containment) stay
// off: turning a version on would move nothing anyone can call.
const assertActionsOn = async (caller: CustomCodeCaller, scope: Scope) => {
  const { tool } = await resolveCustomCodeToolReadOnly(
    caller.db,
    scope.organizationId,
    scope.projectId
  );
  if (tool && !tool.enabled) {
    throw new Error(
      'Actions are turned off for this project. Turn them on in Tools first.'
    );
  }
};

const turnOn: ItemHandler = {
  apply: async (caller, scope, item) => {
    await assertActionsOn(caller, scope);
    const versionId = String(item.payload.versionId);
    const previous = await liveVersionId(caller, scope);
    await customCodeActions.switchVersion(
      caller,
      { ...scope, versionId },
      false
    );
    return { activeVersionId: previous, appliedVersionId: versionId };
  },
  check: async (caller, scope, _item, before) => {
    const { appliedVersionId } = before as { appliedVersionId: string };
    if ((await liveVersionId(caller, scope)) !== appliedVersionId) {
      throw new Error(
        'The actions were already changed after this was applied, so undoing it would replace newer work. Ask the assistant to change them instead.'
      );
    }
  },
  undo: async (caller, scope, _item, before) => {
    const { activeVersionId } = before as { activeVersionId: string | null };
    if (activeVersionId) {
      await customCodeActions.switchVersion(
        caller,
        { ...scope, versionId: activeVersionId },
        true
      );
      return;
    }
    // Nothing was live before: turn the actions off.
    const { tool } = await resolveCustomCodeToolReadOnly(
      caller.db,
      scope.organizationId,
      scope.projectId
    );
    if (tool) {
      await caller.db
        .update(db.schema.artifactTool)
        .set({ enabled: false })
        .where(eq(db.schema.artifactTool.id, tool.id));
    }
  }
};

const handlerFor = (item: StagedItem): ItemHandler => {
  if (item.area === 'functions') {
    if (item.op !== 'turn_on')
      throw new Error(`Unknown change functions ${item.op}`);
    return turnOn;
  }
  if (item.area === 'data') return dataHandler(item.op);
  return projectHandler(item.area, item.op);
};

const stateOf = (entry: Before) =>
  entry.state !== undefined
    ? entry.state
    : {
        activeVersionId: entry.activeVersionId ?? null,
        appliedVersionId: entry.appliedVersionId
      };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Apply a proposed change set as the owner who clicked. Every delete needs
 * the name of what it deletes typed in `confirm` (by item index). Items run
 * in order and stop at the first failure; what did apply is recorded so it
 * can be undone.
 */
export const applyChangeSet = async (
  caller: CustomCodeCaller,
  scope: Scope,
  changeSetId: string,
  confirm: Record<string, string> = {}
) => {
  const row = await loadChangeSet(caller, scope, changeSetId);
  const pending = row.items as StoredItem[];
  const unconfirmed = pending
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item, index }) =>
        item.deletes && (confirm[String(index)] ?? '').trim() !== item.deletes
    );
  if (row.status === PROPOSED && unconfirmed.length) {
    throw new ConfirmationError(
      `Type the name of each thing this deletes to apply it: ${unconfirmed.map(({ item }) => `"${item.deletes}"`).join(', ')}.`
    );
  }

  // Claimed first, so a double click applies once.
  const [claimed] = await caller.db
    .update(db.schema.builderChangeSet)
    .set({
      status: APPLIED,
      appliedByUserId: scope.userId,
      appliedAt: new Date()
    })
    .where(
      and(
        eq(db.schema.builderChangeSet.id, changeSetId),
        eq(db.schema.builderChangeSet.projectId, scope.projectId),
        eq(db.schema.builderChangeSet.organizationId, scope.organizationId),
        eq(db.schema.builderChangeSet.status, PROPOSED)
      )
    )
    .returning();
  if (!claimed) {
    throw new Error('This change set was already applied or put aside');
  }

  const itemScope: ItemScope = { ...scope, artifactId: claimed.artifactId };
  const items = claimed.items as StoredItem[];
  const before: Before[] = [];
  const results: { label: string; ok: boolean; error?: string }[] = [];
  let failure: string | null = null;

  for (const [index, item] of items.entries()) {
    if (failure) {
      results.push({ label: item.label, ok: false, error: 'Not applied' });
      continue;
    }
    try {
      const state = await handlerFor(item).apply(caller, itemScope, item);
      before.push({ index, state: state ?? null });
      results.push({ label: item.label, ok: true });
    } catch (error) {
      failure = errorText(error);
      results.push({ label: item.label, ok: false, error: failure });
    }
  }

  const [updated] = await caller.db
    .update(db.schema.builderChangeSet)
    .set({
      status: failure ? FAILED : APPLIED,
      before,
      error: failure
    })
    .where(eq(db.schema.builderChangeSet.id, changeSetId))
    .returning();

  return { changeSet: updated, results };
};

/**
 * Put back what an applied change set did, newest first. Refused before
 * anything moves when something else has changed the same thing since, so an
 * undo never throws away newer work. A step that fails stops it; the steps
 * already undone are remembered, so trying again carries on from there.
 */
export const undoChangeSet = async (
  caller: CustomCodeCaller,
  scope: Scope,
  changeSetId: string
) => {
  const loaded = await loadChangeSet(caller, scope, changeSetId);
  if (loaded.status !== APPLIED && loaded.status !== FAILED) {
    throw new Error('This change set was already undone, or was never applied');
  }
  if (!((loaded.before as Before[] | null) ?? []).length)
    throw new Error(
      'Nothing in this change set was applied, so undo is invalid'
    );
  // Claimed first, like Apply, so a double click undoes once; put back as it
  // was if anything stops it.
  const [row] = await caller.db
    .update(db.schema.builderChangeSet)
    .set({ status: UNDONE })
    .where(
      and(
        eq(db.schema.builderChangeSet.id, changeSetId),
        eq(db.schema.builderChangeSet.status, loaded.status)
      )
    )
    .returning();
  if (!row) throw new Error('This change set is already being undone');
  const before = (row.before as Before[] | null) ?? [];
  const release = (values: { before?: Before[]; error?: string | null }) =>
    caller.db
      .update(db.schema.builderChangeSet)
      .set({ status: loaded.status, ...values })
      .where(eq(db.schema.builderChangeSet.id, changeSetId));

  const itemScope: ItemScope = { ...scope, artifactId: row.artifactId };
  const items = row.items as StoredItem[];
  const remaining = [...before].reverse().filter(entry => !entry.undone);

  try {
    for (const entry of remaining) {
      const item = items[entry.index];
      if (item.undo === 'none') continue;
      await handlerFor(item).check?.(caller, itemScope, item, stateOf(entry));
    }
  } catch (error) {
    await release({});
    throw error;
  }

  let failure: string | null = null;
  for (const entry of remaining) {
    const item = items[entry.index];
    if (item.undo === 'none') continue;
    try {
      await handlerFor(item).undo(caller, itemScope, item, stateOf(entry));
      entry.undone = true;
    } catch (error) {
      failure = `"${item.label}" couldn't be undone: ${errorText(error)}`;
      break;
    }
  }

  if (failure) {
    // A failed Apply keeps its own error; the owner sees this one in the
    // answer.
    await release({
      before,
      ...(loaded.status === APPLIED ? { error: failure } : {})
    });
    throw new UndoStoppedError(failure);
  }

  const [updated] = await caller.db
    .update(db.schema.builderChangeSet)
    .set({ status: UNDONE, undoneAt: new Date(), before, error: null })
    .where(eq(db.schema.builderChangeSet.id, changeSetId))
    .returning();
  return { changeSet: updated };
};

// The owner's clicks since the assistant last spoke, as lines it reads at the
// start of the next turn.
export const changeSetNotes = async (
  caller: CustomCodeCaller,
  conversationId: string,
  since: Date
) => {
  const rows = await caller.db
    .select()
    .from(db.schema.builderChangeSet)
    .where(
      and(
        eq(db.schema.builderChangeSet.conversationId, conversationId),
        inArray(db.schema.builderChangeSet.status, [APPLIED, FAILED, UNDONE])
      )
    );
  return rows
    .filter(row => row.updatedAt > since)
    .map(row => {
      const what = row.summary ?? 'the change set';
      if (row.status === UNDONE) return `The owner undid "${what}".`;
      if (row.status === FAILED) {
        return `The owner clicked Apply on "${what}", but it failed: ${row.error}`;
      }
      if (row.error) {
        return `The owner tried to undo "${what}", but it stopped: ${row.error}`;
      }
      return `The owner applied "${what}". It is live now.`;
    });
};
