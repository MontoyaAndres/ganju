// What one WhatsApp channel takes from a webhook. A Meta app sends every
// number's events to each of its callbacks, signed with the same app secret,
// so a channel keeps only what was addressed to its own number and business
// account; otherwise another channel's bot answers its messages.

export interface WhatsappWebhookChange<V> {
  field?: string;
  value?: V;
}

export interface WhatsappWebhookEnvelope<V> {
  entry?: Array<{ id?: string; changes?: Array<WhatsappWebhookChange<V>> }>;
}

export interface WhatsappAddressedValue {
  metadata?: { phone_number_id?: string };
  messages?: unknown[];
}

/**
 * The change carrying a message for this channel's number, wherever Meta put
 * it in the batch. A change that doesn't say which number it's for is kept.
 */
export const whatsappMessageChange = <V extends WhatsappAddressedValue>(
  payload: WhatsappWebhookEnvelope<V>,
  phoneNumberId: string
): V | undefined =>
  (payload.entry ?? [])
    .flatMap(entry => entry.changes ?? [])
    .find(change => {
      const value = change.value;
      if (!value?.messages?.length) return false;
      const to = value.metadata?.phone_number_id;
      return !to || to === phoneNumberId;
    })?.value;

/**
 * The changes with one of `fields` from this channel's business account. An
 * entry without an id, or a channel that hasn't saved its account, keeps
 * them: template events only touch the channel's own stored templates.
 */
export const whatsappAccountChanges = <V>(
  payload: WhatsappWebhookEnvelope<V>,
  businessAccountId: string | undefined,
  fields: readonly string[]
): WhatsappWebhookChange<V>[] =>
  (payload.entry ?? [])
    .filter(
      entry => !entry.id || !businessAccountId || entry.id === businessAccountId
    )
    .flatMap(entry =>
      (entry.changes ?? []).filter(
        change => !!change.field && fields.includes(change.field)
      )
    );
