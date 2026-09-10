# Legal review brief — Polar as merchant of record

**This is a brief for a lawyer, not a legal review.** It was written by an engineer to save counsel the discovery work: it states what changed in the product, quotes the exact clauses affected, and sets out the questions that need deciding. Every answer below is a question, not a position. Nothing here is legal advice, and none of it should ship on its own authority.

Counsel needs to be comfortable with **Colombian consumer law** (Ley 1480 de 2011 and its implementing decrees) and ideally with **EU/UK data protection** for the last section. Companion to [POLAR_MIGRATION.md](POLAR_MIGRATION.md).

## What changed

Billing moved from Stripe to [Polar](https://polar.sh). Stripe does not support Colombia as a seller country; Polar does, through Stripe Connect Express.

The part that matters legally is not the vendor name. **Polar is a merchant of record**, and its own terms say so plainly: *"Polar is the reseller of the Product. This structure allows Polar to handle all Sales Tax collection, reporting and remittance."* Elsewhere: *"As the seller, Polar shall be entitled to cancel a Transaction and grant Buyer a refund…"*

So on every paid transaction:

| | Before | After |
| --- | --- | --- |
| Who the customer pays | Ganju S.A.S. | **Polar Software, Inc.** (Delaware) |
| Who issues the invoice | Ganju | Polar |
| Who collects and remits IVA/VAT | Ganju | Polar |
| Who can issue a refund | Ganju, via Stripe | **Polar only** |
| Who supplies the service | Ganju | Ganju (unchanged) |

Ganju remains the supplier of the Service. What moved is the *sale*.

**There are no live paying customers.** Stripe live mode was never activated, so nothing has been sold to anyone under either arrangement. Every question below is prospective, which is the good news: there is no remediation to do, only a decision to get right before the first sale.

## Question 1 — the *derecho de retracto* and who actually refunds

**Current text**, unchanged by the migration and deliberately left alone pending this review:

> To exercise it, email **hello@ganju.ai** from the address on your account within that window and say you're exercising your *derecho de retracto*. We'll cancel the subscription and **refund what you paid within 30 calendar days**, through the same payment method, as the statute requires.

**The concern.** Art. 47 of Ley 1480 gives a consumer five business days to withdraw from a distance contract and obliges the supplier to return the money within 30 calendar days. The clause promises exactly that. But Ganju no longer holds the money and cannot issue the refund — Polar does, on Polar's timetable, through Polar's processes.

The commitment is probably still correct as a matter of *obligation* (Ganju is the supplier; the duty is Ganju's). The risk is **operational**: a promise to refund in 30 days that depends on a third party's refund queue, with no contractual SLA behind it.

**What counsel should decide:**

1. Does the retracto obligation sit with Ganju, with Polar as reseller, or with both jointly? Note art. 4 makes consumer rights unwaivable, so a clause reassigning the duty away from Ganju may simply be void rather than effective.
2. If the duty stays with Ganju, is the 30-day promise safe to keep given the dependency? Is a commitment to *initiate* the refund materially different from a commitment to *complete* it, and would the difference survive art. 42–43 on abusive clauses?
3. Does anything need to change in how the right is exercised — for instance, should the customer be told they may also raise it directly with Polar?

**What engineering needs back:** either "leave the clause as it is" or replacement wording. If wording changes, see [Afterwards](#afterwards).

## Question 2 — the "service is with us, purchase is with Polar" split

**Current text**, added in this migration:

> Your use of the Service is still governed by these terms and your relationship for the Service is still with us; it is the *purchase transaction* that is with Polar, and Polar's own terms apply to it.

**The concern.** Two of them.

First, **liability**. Under Ley 1480 the *productor* and the *proveedor/expendedor* are jointly and severally liable to the consumer. This sentence is intended as a factual description of who sells what, not as a limitation — but it could be *read* as an attempt to push part of the relationship onto a third party. If it reads that way to a Colombian consumer authority, art. 42–43 on abusive clauses is the exposure.

Second, **incorporation by reference**. "Polar's own terms apply to it" binds the consumer to a document they have not seen, hosted by a foreign company, in English. Art. 37 on adhesion contracts requires terms to be legible and available. Is a bare reference enough, or does this need a link, a summary, or a checkbox at signup?

**What counsel should decide:**

1. Is the split described accurately and non-abusively, or does it need rewording?
2. Does Polar's own agreement need to be linked, surfaced at checkout, or explicitly accepted?
3. Does anything need saying about Polar being a Delaware entity — jurisdiction, applicable law, or the consumer's forum?

## Question 3 — *reversión del pago* under a merchant of record

**Current text**, unchanged:

> Separately, art. 51 of the same law and its implementing decree give you the right to request **reversión del pago** through your card issuer in the cases it lists, such as fraud or a service that was never provided. Nothing in these terms limits either right.

**The concern.** This is the one with real operational risk, and it is the reason this question is separate from the first.

Art. 51 and Decreto 587 de 2016 create a statutory payment-reversal mechanism with defined timelines, running through the issuer, the acquirer and the *proveedor*. Under a merchant of record the card transaction belongs to **Polar**, settled through Polar's acquiring relationship. Ganju is not in the payment chain at all.

So: can a Colombian consumer actually exercise art. 51 against a transaction acquired by a US merchant of record, and if they do, what reaches Ganju? The clause says the right is not limited — which is correct as a statement of law, but Ganju may have no mechanism to honour it directly.

**What counsel should decide:**

1. Does art. 51 reach this transaction structure at all, and if not, does saying "nothing in these terms limits this right" become misleading rather than protective?
2. If it does reach, what must Ganju be able to do operationally, and does that need to be contracted with Polar rather than assumed?
3. Is there a disclosure obligation — does the consumer need telling that the card transaction is with a foreign merchant of record before they pay?

## The data-protection thread — separate, and time-sensitive

Not a *terms* question, but it belongs in the same review because it has a **deadline attached**.

[dpa.md](../apps/website/src/md/dpa.md) commits:

> Before a new subprocessor starts processing Customer Content we will update that page and give **at least 30 days' notice** to the Owner of every paid organization. If you have a reasonable, documented data-protection objection we can't resolve, you may terminate the affected subscription and we'll refund the unused portion of the current period.

Polar is a new subprocessor. The subprocessor page has been updated (Stripe, Inc. → Polar Software, Inc., dated 10 September 2026), which is half the obligation. The other half is the 30 days' notice.

**Today that obligation is satisfiable trivially, because production has no paid organizations to notify.** That is only true while it stays true:

> **Onboard Polar before the first paying customer.** If a customer is signed up first and Polar is switched on afterwards, 30 days' notice plus an objection-and-refund right is owed to that customer before Polar may process their data.

Counsel should also confirm whether the Stripe → Polar change needs any notice under Ley 1581 de 2012 / Decreto 1074 de 2015 independent of the DPA commitment, and whether the transfer of billing personal data to a US entity needs anything beyond what the current policy says.

## Afterwards

If any of the four documents changes materially — [terms.md](../apps/website/src/md/terms.md), [privacy.md](../apps/website/src/md/privacy.md) and their Spanish mirrors — two things must happen together:

1. Update the **"Last updated" / "Última actualización"** date on the changed documents.
2. Bump **`CONSENT_CURRENT_VERSION`** in [constants.ts](../packages/utils/src/constants.ts) to match.

It currently reads `2026-09-10`, already bumped for this migration and matching the four documents. Bumping it re-prompts every existing user to re-accept, and the old acceptance stays on record.

**So this review should land before that ships**, not after. Two bumps in a fortnight means asking every user to accept twice, which is its own kind of bad.

**The Spanish version governs.** [privacidad.md](../apps/website/src/md/es/privacidad.md) states that for data subjects in Colombia the Spanish text prevails, so any wording counsel approves has to be mirrored there rather than left as a translation of record.
