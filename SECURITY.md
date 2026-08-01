# Security Policy

Ganju is open source, and the hosted service at `ganju.ai` runs the same code. We
take reports about either seriously and we'd rather hear from you than read about it
later.

## Reporting a vulnerability

**Email <hello@ganju.ai>** with `SECURITY` in the subject. If you'd rather use
GitHub, open a [private security advisory](https://github.com/MontoyaAndres/ganju/security/advisories/new) —
please don't open a public issue for a vulnerability.

Include whatever you have:

- What the issue is and roughly how bad you think it is
- Steps to reproduce it, or a proof of concept
- The affected component (`apps/api`, `apps/mcp`, `apps/web`, `apps/resource-handler`,
  a package, or the hosted service) and the commit or URL you tested
- Anything you think we'd get wrong when triaging it

You don't need a polished write-up. A rough report today beats a perfect one next
month.

## What we commit to

| Stage | Target |
| --- | --- |
| We acknowledge your report | Within **3 business days** |
| We confirm the issue and give you an assessment | Within **10 business days** |
| We ship a fix for a critical issue | As fast as we can, typically within **30 days** |
| We tell you it's fixed and agree on disclosure | Before we publish anything |

We'll keep you updated if any of these slip. If you don't hear back within the
acknowledgement window, please email again — a missed report is a bug in our process.

## Safe harbour

We will not pursue or support legal action against you for security research that
follows this policy, and we'll treat it as authorized under applicable
anti-hacking law. To stay inside it:

- Only test against **your own account, organization, and projects**.
- Don't access, modify, or retain data belonging to anyone else. If you encounter
  someone else's data, stop and tell us.
- Don't run denial-of-service tests, spam, brute-force at volume, or anything that
  degrades the service for other users.
- Don't use social engineering, physical attacks, or attacks against our staff or
  our providers' infrastructure.
- Give us a reasonable chance to fix the issue before disclosing it publicly.

Testing against third-party services connected to Ganju — Google, Microsoft, Slack,
the chat platforms, or a customer's own endpoint — is **out of scope** and covered by
those providers' own policies, not this one.

## Scope

**In scope:** this repository, and the hosted service at `ganju.ai`, `app.ganju.ai`,
`api.ganju.ai`, and `mcp.ganju.ai`.

**Out of scope**, unless you can show real impact:

- Missing security headers or cookie flags with no demonstrated exploit
- Reports produced by an automated scanner with no proof of concept
- Rate limiting on unauthenticated endpoints, absent a concrete attack
- Vulnerabilities in third-party services or in a self-hosted deployment someone else
  configured
- Social engineering, physical security, and spam or email-spoofing reports without
  an exploitable path

Things we're **especially** interested in, because of what this codebase does:

- Cross-tenant access — reaching another organization's, project's, or artifact's data
- Anything that exposes a decrypted credential (`artifact_credential`,
  `organization_llm.apiKey`, channel bot tokens, webhook secrets)
- SSRF that gets past the screening on `http-endpoint`, `mcp-proxy`, or the crawler
- Auth and OAuth flaws in the MCP authorization path or the OIDC provider
- Prompt injection that escalates into an unauthorized **tool call** — reading a
  poisoned resource and having it send mail, delete a calendar event, or post to a
  channel

## Rewards

We don't run a paid bug bounty yet. We'll credit you in the acknowledgements below
if you'd like, and we'll say thank you properly.

## Thanks

Nobody yet. Your name could go here.

## Self-hosted deployments

If you self-host Ganju, you're responsible for your own instance: keep it updated,
rotate `CRYPTO_SECRET` and `JWT_SECRET` if they're ever exposed, and don't reuse the
example values. We'll publish advisories for vulnerabilities in the code through
GitHub Security Advisories so you can track them.
