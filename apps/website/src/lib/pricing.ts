import type { PricingConfig } from '../components/react/PricingCalculator';

// Plan numbers for the marketing site's estimator. Kept local to the website on
// purpose — the @ganju/utils package is CommonJS and importing it into Astro's
// SSR breaks ESM interop, so we don't couple the static site to it.
//
// SOURCE OF TRUTH for pricing. When the app gains real billing, mirror these
// numbers into its config. Keep this in sync with pricing.astro, pricing.md,
// and the Plans section of TASKS.md.
//
// Economics note: the per-message overage fee is a platform fee for tool/compute
// execution, NOT token resale — so it only holds when inference is paid by the
// org's OWN LLM key (organizationLlm.apiKey). We never flat-rate our own model's
// inference, because a single turn's token cost is variable and can exceed the
// fee. So use of the shared platform model is bounded to each plan's INCLUDED
// allowance (Free: freeMessages on our key; Pro: includedMessages on our key).
// Past that allowance a channel must run on the org's own key to continue —
// enforced by the shared-key cap in @ganju/utils and the runner. Free can't
// bring a key, so it simply stops at its cap (upgrade to continue); its turn
// envelope (history + tool loops) is also tightened to bound our trial cost.
export const PRICING: PricingConfig = {
  proBase: 20, // $/mo flat base
  includedMessages: 3_000, // channel assistant turns included
  includedStorageGb: 5, // embedded/RAG content included
  messagePer1k: 2, // $ per 1,000 extra messages
  storagePerGb: 0.5, // $ per extra GB of embedded content
  customDomain: 15, // $/mo custom-domain add-on (covers Cloudflare ACM + margin)
  freeMessages: 100, // Free tier monthly cap — trial-sized; runs on our shared key
  freeEmbeddedMb: 5, // Free tier embedded-content allowance
  messageMax: 200_000, // estimator slider upper bound
  storageMax: 200 // estimator slider upper bound (GB)
};
