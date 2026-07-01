import { Context } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import { Plan } from '../../utils';

import { AppEnv } from '../../types';

const list = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ORGANIZATION_LIST_LLM.parseAsync({
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const rows = await dbInstance
    .select()
    .from(db.schema.organizationLlm)
    .where(
      eq(db.schema.organizationLlm.organizationId, currentValues.organizationId)
    )
    .orderBy(desc(db.schema.organizationLlm.createdAt));

  return c.json(
    rows.map(({ apiKey: _k, ...rest }) => ({ ...rest, hasApiKey: true }))
  );
};

const create = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ORGANIZATION_CREATE_LLM.parseAsync({
    ...body,
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);
  const encryptionKey = utils.getCredentialEncryptionKey(c);
  const encryptedApiKey = utils.encryptString(
    currentValues.apiKey,
    encryptionKey
  );

  const [organizationRow] = await dbInstance
    .select()
    .from(db.schema.organization)
    .where(eq(db.schema.organization.id, currentValues.organizationId))
    .limit(1);

  if (!organizationRow) throw new Error('Organization not found');

  // Connecting a custom model is a paid feature: Free orgs use the shared
  // platform model only (throws PlanLimitError → 402 on Free).
  Plan.assertCustomLlmAllowed(
    await Plan.getEffectivePlan(dbInstance, organizationRow.id)
  );

  const [created] = await dbInstance
    .insert(db.schema.organizationLlm)
    .values({
      name: currentValues.name,
      provider: currentValues.provider,
      model: currentValues.model,
      baseUrl: currentValues.baseUrl || null,
      apiKey: encryptedApiKey,
      systemPrompt: currentValues.systemPrompt || null,
      config: currentValues.config || null,
      organizationId: organizationRow.id
    })
    .returning();

  const { apiKey: _k, ...safe } = created;
  return c.json({ ...safe, hasApiKey: true });
};

const update = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ORGANIZATION_UPDATE_LLM.parseAsync({
    ...body,
    llmId: c.req.param('llmId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  // Editing a custom model is a paid feature too: a downgraded org can only list
  // or delete its models, not keep editing them (throws PlanLimitError → 402 on
  // Free).
  Plan.assertCustomLlmAllowed(
    await Plan.getEffectivePlan(dbInstance, currentValues.organizationId)
  );

  const [existing] = await dbInstance
    .select()
    .from(db.schema.organizationLlm)
    .where(
      and(
        eq(db.schema.organizationLlm.id, currentValues.llmId),
        eq(
          db.schema.organizationLlm.organizationId,
          currentValues.organizationId
        )
      )
    )
    .limit(1);

  if (!existing) throw new Error('LLM not found');

  const updates: Record<string, unknown> = {};
  if (currentValues.name !== undefined) updates.name = currentValues.name;
  if (currentValues.provider !== undefined)
    updates.provider = currentValues.provider;
  if (currentValues.model !== undefined) updates.model = currentValues.model;
  if (currentValues.baseUrl !== undefined)
    updates.baseUrl = currentValues.baseUrl || null;
  if (currentValues.systemPrompt !== undefined)
    updates.systemPrompt = currentValues.systemPrompt || null;
  if (currentValues.config !== undefined)
    updates.config = currentValues.config || null;
  if (currentValues.apiKey !== undefined) {
    const encryptionKey = utils.getCredentialEncryptionKey(c);
    updates.apiKey = utils.encryptString(currentValues.apiKey, encryptionKey);
  }

  const [updated] = await dbInstance
    .update(db.schema.organizationLlm)
    .set(updates)
    .where(eq(db.schema.organizationLlm.id, existing.id))
    .returning();

  const { apiKey: _k, ...safe } = updated;
  return c.json({ ...safe, hasApiKey: true });
};

const remove = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ORGANIZATION_REMOVE_LLM.parseAsync({
    llmId: c.req.param('llmId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const removed = await dbInstance.transaction(async tx => {
    const [existing] = await tx
      .select()
      .from(db.schema.organizationLlm)
      .where(
        and(
          eq(db.schema.organizationLlm.id, currentValues.llmId),
          eq(
            db.schema.organizationLlm.organizationId,
            currentValues.organizationId
          )
        )
      )
      .limit(1);

    if (!existing) throw new Error('LLM not found');

    const inUse = await tx
      .select({ id: db.schema.channel.id })
      .from(db.schema.channel)
      .where(eq(db.schema.channel.llmId, existing.id))
      .limit(1);

    if (inUse.length > 0) {
      throw new Error('LLM is in use by one or more channels');
    }

    await tx
      .delete(db.schema.organizationLlm)
      .where(eq(db.schema.organizationLlm.id, existing.id));

    return existing;
  });

  return c.json({ id: removed.id });
};

export const OrganizationLlmController = {
  list,
  create,
  update,
  remove
};
