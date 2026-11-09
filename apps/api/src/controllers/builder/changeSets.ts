import { and, eq, inArray } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import * as customCodeActions from '../artifact/customCodeActions';
import { resolveCustomCodeToolReadOnly } from '../artifact/customCode';

import type { CustomCodeCaller } from '../artifact/customCodeActions';
import type { StagedItem } from './tools';

interface Scope {
  organizationId: string;
  projectId: string;
  userId: string;
}

interface StoredItem extends StagedItem {
  undoable: boolean;
}

// One entry per item that applied, in order: what it replaced.
interface Before {
  index: number;
  activeVersionId: string | null;
  appliedVersionId: string;
}

const {
  BUILDER_CHANGE_SET_STATUS_PROPOSED: PROPOSED,
  BUILDER_CHANGE_SET_STATUS_APPLIED: APPLIED,
  BUILDER_CHANGE_SET_STATUS_FAILED: FAILED,
  BUILDER_CHANGE_SET_STATUS_UNDONE: UNDONE
} = utils.constants;

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

/**
 * Apply a proposed change set as the owner who clicked. Items run in order
 * and stop at the first failure; what did apply is recorded so it can be
 * undone.
 */
export const applyChangeSet = async (
  caller: CustomCodeCaller,
  scope: Scope,
  changeSetId: string
) => {
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
    await loadChangeSet(caller, scope, changeSetId);
    throw new Error('This change set was already applied or put aside');
  }

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
      if (item.area !== 'functions' || item.op !== 'turn_on') {
        throw new Error(`Unknown change ${item.area} ${item.op}`);
      }
      await assertActionsOn(caller, scope);
      const versionId = String(item.payload.versionId);
      const previous = await liveVersionId(caller, scope);
      await customCodeActions.switchVersion(
        caller,
        { ...scope, versionId },
        false
      );
      before.push({
        index,
        activeVersionId: previous,
        appliedVersionId: versionId
      });
      results.push({ label: item.label, ok: true });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
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
 * Put back what an applied change set replaced, newest first. Refused when
 * something else has changed the same thing since, so an undo never throws
 * away newer work.
 */
export const undoChangeSet = async (
  caller: CustomCodeCaller,
  scope: Scope,
  changeSetId: string
) => {
  const row = await loadChangeSet(caller, scope, changeSetId);
  if (row.status !== APPLIED && row.status !== FAILED) {
    throw new Error('This change set was already undone, or was never applied');
  }
  const before = (row.before as Before[] | null) ?? [];
  if (!before.length)
    throw new Error(
      'Nothing in this change set was applied, so undo is invalid'
    );

  const live = await liveVersionId(caller, scope);
  const last = before[before.length - 1];
  if (live !== last.appliedVersionId) {
    throw new Error(
      'The actions were already changed after this was applied, so undoing it would replace newer work. Ask the assistant to change them instead.'
    );
  }

  for (const entry of [...before].reverse()) {
    if (entry.activeVersionId) {
      await customCodeActions.switchVersion(
        caller,
        { ...scope, versionId: entry.activeVersionId },
        true
      );
      continue;
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

  const [updated] = await caller.db
    .update(db.schema.builderChangeSet)
    .set({ status: UNDONE, undoneAt: new Date() })
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
      return `The owner applied "${what}". It is live now.`;
    });
};
