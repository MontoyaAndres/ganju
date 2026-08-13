import type { PricingConfig } from '../components/react/PricingCalculator';

// Plan numbers for the marketing site's estimator. Kept local to the website on
// purpose — the @ganju/utils package is CommonJS and importing it into Astro's
// SSR breaks ESM interop, so we don't couple the static site to it.
//
// Mirror of the plan numbers in @ganju/utils, which is what actually bills.
// Duplicated rather than imported because that package is CommonJS and pulling
// it into Astro's SSR breaks ESM interop. Keep in sync with pricing.astro.
//
// Economics note: `messagePer1k` is a platform fee for tool/compute execution,
// NOT token resale — it only holds when inference is paid by the org's OWN LLM
// key (organizationLlm.apiKey). Turns on our shared model cost us real money and
// bill at a separate, much higher rate; the app enforces both, and this
// estimator deliberately models only the own-key case (see messagesHint copy),
// because a two-rate slider is more confusing than it is accurate. Free can't
// bring a key at all, so it simply stops at its cap; its turn envelope (history
// + tool loops) is also tightened to bound our trial cost.
export const PRICING: PricingConfig = {
  proBase: 29, // $/mo flat base
  includedMessages: 3_000, // channel assistant turns included
  includedStorageGb: 5, // embedded/RAG content included
  messagePer1k: 2, // $ per 1,000 extra messages, on the org's OWN key
  storagePerGb: 0.5, // $ per extra GB of embedded content
  customDomain: 15, // $/mo custom-domain add-on (covers Cloudflare ACM + margin)
  freeMessages: 100, // Free tier monthly cap — trial-sized; runs on our shared key
  freeEmbeddedMb: 5, // Free tier embedded-content allowance
  messageMax: 200_000, // estimator slider upper bound
  storageMax: 200 // estimator slider upper bound (GB)
};
