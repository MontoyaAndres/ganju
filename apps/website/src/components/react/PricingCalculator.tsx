import { useMemo, useState } from 'react';

// Interactive island: the pricing page is static HTML; this estimator hydrates
// on its own (`client:only="react"`). The plan numbers come in as props from
// pricing.astro (see src/lib/pricing.ts) so the client bundle stays lean.
//
// Copy is intentionally plain — no "RAG", "MCP", or "assistant turn" jargon.
// We only charge for two things: messages your bots send, and how much content
// your AI can search. Everything else (and using Ganju from Claude/Cursor/etc.)
// is included.

export interface PricingConfig {
  proBase: number;
  includedMessages: number;
  includedStorageGb: number;
  messagePer1k: number;
  storagePerGb: number;
  customDomain: number;
  freeMessages: number;
  freeEmbeddedMb: number;
  messageMax: number;
  storageMax: number;
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const num = new Intl.NumberFormat('en-US');

// Quick starting points so people don't have to guess their numbers.
const PRESETS = [
  { label: '👋 Just trying it out', messages: 1_000, storageGb: 1 },
  { label: '💬 Small support bot', messages: 8_000, storageGb: 3 },
  { label: '🚀 Growing product', messages: 30_000, storageGb: 10 },
  { label: '🏢 High volume', messages: 100_000, storageGb: 30 }
];

export default function PricingCalculator({
  config
}: {
  config: PricingConfig;
}) {
  const {
    proBase,
    includedMessages,
    includedStorageGb,
    messagePer1k,
    storagePerGb,
    customDomain: customDomainPrice,
    freeMessages,
    freeEmbeddedMb,
    messageMax,
    storageMax
  } = config;

  const [messages, setMessages] = useState(1_000);
  const [storageGb, setStorageGb] = useState(1);
  const [customDomain, setCustomDomain] = useState(false);

  const result = useMemo(() => {
    const extraMessages = Math.max(0, messages - includedMessages);
    const extraStorage = Math.max(0, storageGb - includedStorageGb);

    // Stripe bills these meters in whole packages ("round up to nearest complete
    // package": 1,000 messages, 1 GB), so mirror that here — otherwise the
    // estimate could quote less than the real invoice for partial blocks.
    const messageBlocks = Math.ceil(extraMessages / 1_000);
    const storageBlocks = Math.ceil(extraStorage);

    const messageCost = messageBlocks * messagePer1k;
    const storageCost = storageBlocks * storagePerGb;
    const domainCost = customDomain ? customDomainPrice : 0;
    const total = proBase + messageCost + storageCost + domainCost;

    return {
      extraMessages,
      extraStorage,
      messageCost,
      storageCost,
      domainCost,
      total
    };
  }, [
    messages,
    storageGb,
    customDomain,
    includedMessages,
    includedStorageGb,
    messagePer1k,
    storagePerGb,
    customDomainPrice,
    proBase
  ]);

  // "Free is enough" when usage stays under the free message cap and the free
  // content allowance, with no paid add-on turned on.
  const withinFree =
    messages <= freeMessages &&
    storageGb <= freeEmbeddedMb / 1_024 &&
    !customDomain;

  return (
    <div className="calc">
      <div className="calc-presets">
        {PRESETS.map(p => {
          const active = messages === p.messages && storageGb === p.storageGb;
          return (
            <button
              key={p.label}
              type="button"
              className={`calc-preset${active ? ' active' : ''}`}
              onClick={() => {
                setMessages(p.messages);
                setStorageGb(p.storageGb);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="calc-grid">
        <div className="calc-controls">
          <div className="calc-field">
            <div className="calc-field-head">
              <label htmlFor="calc-messages">
                How many messages will your bots send?
              </label>
              <span className="calc-value">
                {num.format(messages)}
                <small>/mo</small>
              </span>
            </div>
            <input
              id="calc-messages"
              type="range"
              min={0}
              max={messageMax}
              step={1_000}
              value={messages}
              onChange={e => setMessages(Number(e.target.value))}
            />
            <p className="calc-hint">
              Every reply your bot sends on Telegram, Slack, WhatsApp, or
              Discord. The first {num.format(includedMessages)} each month are
              included.
            </p>
          </div>

          <div className="calc-field">
            <div className="calc-field-head">
              <label htmlFor="calc-storage">
                How much can your AI search through?
              </label>
              <span className="calc-value">
                {num.format(storageGb)}
                <small> GB</small>
              </span>
            </div>
            <input
              id="calc-storage"
              type="range"
              min={0}
              max={storageMax}
              step={1}
              value={storageGb}
              onChange={e => setStorageGb(Number(e.target.value))}
            />
            <p className="calc-hint">
              Documents, web pages, and files your AI can read and answer from.
              The first {includedStorageGb} GB are included — that's thousands
              of pages.
            </p>
          </div>

          <label className="calc-toggle" htmlFor="calc-domain">
            <input
              id="calc-domain"
              type="checkbox"
              checked={customDomain}
              onChange={e => setCustomDomain(e.target.checked)}
            />
            <span>
              Use your own web address
              <span className="calc-hint">
                Like your-company.mcp.ganju.ai — adds{' '}
                {usd.format(customDomainPrice)}/mo
              </span>
            </span>
          </label>
        </div>

        <div className="calc-result">
          <p className="calc-result-label">You'd pay about</p>
          <div className="calc-result-total">
            <span className="calc-result-amount">
              {usd.format(result.total)}
            </span>
            <span className="calc-result-per">per month</span>
          </div>

          <ul className="calc-breakdown">
            <li>
              <span>Pro plan</span>
              <span>{usd.format(proBase)}</span>
            </li>
            {result.extraMessages > 0 && (
              <li>
                <span>{num.format(result.extraMessages)} extra messages</span>
                <span>{usd.format(result.messageCost)}</span>
              </li>
            )}
            {result.extraStorage > 0 && (
              <li>
                <span>{num.format(result.extraStorage)} GB extra content</span>
                <span>{usd.format(result.storageCost)}</span>
              </li>
            )}
            {customDomain && (
              <li>
                <span>Your own web address</span>
                <span>{usd.format(result.domainCost)}</span>
              </li>
            )}
          </ul>

          <p className="calc-included">
            Your plan already includes {num.format(includedMessages)} messages
            and {includedStorageGb} GB every month.
          </p>

          <p className="calc-note">
            Using Ganju from Claude, Cursor, or ChatGPT is always free — it
            never uses up your messages.
          </p>

          {withinFree && (
            <p className="calc-free">
              🎉 Good news — this fits the Free plan. You might not need Pro
              yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
