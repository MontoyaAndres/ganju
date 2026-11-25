# Ganju Pricing

Simple pricing. Pro is $29 a month and starts with a 7-day free trial. You only
pay more if you go past what's included. Or self-host Ganju for free.

## Free trial: 7 days of Pro

Every new organization starts with a 7-day free trial of Pro.

- A card is required at checkout; nothing is charged during the trial.
- If you don't cancel before day 7, Pro starts and the card is charged $29 for
  the first month. Usage past what's included is billed per period after that.
- Cancel any time before the trial ends and nothing is charged. You get a
  reminder email 3 days before it ends.
- During the trial you get everything in Pro, capped at 300 bot replies on our
  AI model and 300 Assistant credits, with no usage billed. Replies on your own
  AI key don't count toward that cap.
- The full Pro allowances start with your first paid month. You can start Pro
  early from Billing.
- One free trial per person: a second organization you own starts on Pro right
  away.

An organization without a plan (trial canceled or ended unpaid, or Pro canceled
after the paid period) keeps everything it built, but it can't be used, its
bots don't answer and its MCP server refuses requests until it starts Pro.

## Pro: $29/mo

For a bot people use every day.

- Unlimited projects, prompts and channels
- 3,000 bot replies a month
- 1 GB of searchable content
- The Assistant builds actions for you
- Functions and a database per project
- Invite your team and use your own AI model
- 24/7 support

### How Pro is billed

$29 covers the month. Each item has an amount included; you only pay extra for
what goes past it.

| What | Included each month | After that |
| --- | --- | --- |
| Bot replies on your own AI key | 3,000 | $2 per 1,000 |
| Bot replies on our AI model | 1,000 of those 3,000 | $15 per 1,000 |
| Searchable content | 1 GB | $2 per GB |
| Calls to your own functions | 1,000,000 | $5 per million |
| Assistant credits | 1,000 | $2 per 100, up to a limit you set |
| Custom web address | Optional | $15 a month |

Always free, on every plan: messages people send to your bot, using Ganju from
Claude, ChatGPT or Cursor, catalog integrations and remote MCP servers, file
storage, and the project database (measured, not billed yet).

## Enterprise: Custom

For larger teams with their own terms.

- Everything in Pro
- Allowances and contract set with you
- A custom web address
- A named contact for support

## Compare plans

| | Pro | Enterprise |
| --- | --- | --- |
| Price | $29 / mo | Custom |
| Projects | Unlimited | Unlimited |
| Bot replies included | 3,000 / mo | Custom |
| Past the included replies | Billed as usage | Custom |
| Searchable content | 1 GB, then $2 / GB | Custom |
| File storage | Unlimited | Unlimited |
| Prompts per project | Unlimited | Unlimited |
| Tools switched on | Up to 40 per channel | Up to 40 per channel |
| HTTP endpoints per project | Unlimited | Unlimited |
| Channels per project | Unlimited | Unlimited |
| Automatic resource sync | Daily or weekly | Daily or weekly |
| The Assistant | 1,000 credits / mo | Yes |
| Functions | 1M calls / mo | Yes |
| Database per project | 9 GB, 50 tables | Yes |
| Invite your team | Yes | Yes |
| Bring your own AI model | Yes | Yes |
| Support | 24/7 | Named contact |

## Self-hosted: free

Ganju is open source (Apache-2.0), and running your own instance is free. You
bring your own Cloudflare account, Postgres database and AI keys, and you run
and pay for the infrastructure. Guide: https://ganju.ai/docs/deploy/
Source: https://github.com/MontoyaAndres/ganju
