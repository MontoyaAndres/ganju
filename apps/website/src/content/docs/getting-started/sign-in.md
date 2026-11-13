---
title: Sign in
description: Create your Ganju account with Google or GitHub, accept an invitation, and manage your profile.
order: 2
updated: 2026-11-13
minutes: 2
outcome: "You're signed in to Ganju and looking at your organizations."
---

Ganju is free to start, no credit card required. There's no separate sign-up:
the first time you sign in, your account is created.

## Sign in

1. Go to [app.ganju.ai](https://app.ganju.ai).
2. Tick **I have read and accept the Terms & Conditions and the Privacy
   Policy**. The sign-in buttons stay disabled until you do.
3. Select **Sign in with Google** or **Sign in with GitHub** and approve the
   request on that site.

You land on your organizations. On your very first sign-in that's the **Create
Your Organization** form. Next step:
[create an organization & project](/docs/getting-started/organization-and-project/).

![The sign-in page: Sign in with Google, Sign in with GitHub and the Terms and Privacy checkbox](/images/sign-in.webp)

The app speaks English and Spanish. The sign-in page offers the other language
at the bottom (**¿Prefieres español?**), and the app remembers your choice.

## If you were invited

An invitation arrives by email and points to a page that says **You've been
invited**. Sign in with **the same email address the invitation was sent to**,
then select **Accept invitation** (or **Decline**).

- Signed in with a different address? The page tells you which address the
  invitation is for. Sign out and sign in with that one.
- Invitations expire after **7 days**. An expired, revoked, or already-used
  link says so; ask whoever invited you to send a new one.
- You can also accept from the **Organizations** page, under **Your
  invitations**, with **Accept** or **Decline**.

An invitation is either to a whole organization or to a single project. A
project invitation gives you that project only; the organization's card shows
**Project access**.

## Your account

Your avatar at the bottom of the rail opens a menu with **Account**,
**Settings**, **Documentation**, and **Logout**. **Account** lets you:

- Upload a profile image and change your **Name**.
- See your **Linked accounts** and **Link** or **Unlink** Google and GitHub, so
  you can sign in with either. You must keep at least one linked account.

To download your personal data or delete your account, see
[Settings → Your data](/docs/settings/#your-data) and
[Danger zone](/docs/settings/#danger-zone).

## Signing in from a terminal

Developers using the [`ganju` CLI](/docs/tools/cli/) sign in once per machine.
It opens the same sign-in in your browser:

```bash
ganju login     # sign in on this machine
ganju whoami    # who this machine is signed in as
ganju logout    # forget the stored token
```

## Troubleshooting

- **The buttons don't respond.** Tick the Terms and Privacy checkbox first.
- **I signed in and don't see my team's organization.** You signed in with a
  different account than the one invited. Sign out and sign in with the invited
  address.
- **"You don't have access to this project".** You're in the organization but
  not in that project. A project admin can add you from the project's members in
  the organization settings.
