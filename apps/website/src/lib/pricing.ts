import type { PricingConfig } from '../components/react/PricingCalculator';

// Plan numbers for the marketing site's estimator. Kept local to the website on
// purpose — the @ganju/utils package is CommonJS and importing it into Astro's
// SSR breaks ESM interop, so we don't couple the static site to it.
//
// SOURCE OF TRUTH for pricing. When the app gains real billing, mirror these
// numbers into its config. Keep this in sync with pricing.astro, pricing.md,
// and the Plans section of TASKS.md.
//
// Economics note: the per-message fee assumes inference runs on the org's OWN
// LLM key (organizationLlm.apiKey) — it's a platform fee, not token resale. If
// Ganju ever supplies a default model, that path must pass tokens through with
// margin instead, or this rate loses money per message.
export const PRICING: PricingConfig = {
  proBase: 20, // $/mo flat base
  includedMessages: 10_000, // channel assistant turns included
  includedStorageGb: 5, // embedded/RAG content included
  messagePer1k: 2, // $ per 1,000 extra messages
  storagePerGb: 0.5, // $ per extra GB of embedded content
  customDomain: 15, // $/mo custom-domain add-on (covers Cloudflare ACM + margin)
  freeMessages: 2_000, // Free tier monthly cap — well below Pro's 10k allowance
  freeEmbeddedMb: 50, // Free tier embedded-content allowance
  messageMax: 200_000, // estimator slider upper bound
  storageMax: 200 // estimator slider upper bound (GB)
};
