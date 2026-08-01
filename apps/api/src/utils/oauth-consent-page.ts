// Consent page for the OAuth authorize flow, served at `GET /oauth/consent`.
//
// `@better-auth/oauth-provider` redirects the browser here with the signed
// authorization query, rather than rendering HTML itself — raw HTML isn't a
// response type the authorize endpoint supports. The Allow/Cancel buttons POST
// that query back to `/auth/oauth2/consent`, which replies `{ redirect_uri }`.

import { utils } from '@ganju/utils';

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Read your basic profile',
  email: 'Read your email address',
  offline_access: 'Stay connected when you are away',
  [utils.constants.MCP_SCOPE_READ]: 'Read your MCP servers and their resources'
};

const describeScope = (scope: string): string => {
  if (SCOPE_LABELS[scope]) return SCOPE_LABELS[scope];
  const artifactPrefix = utils.constants.ARTIFACT_SCOPE_PREFIX;
  if (scope.startsWith(artifactPrefix)) {
    return `Access the MCP server "${scope.slice(artifactPrefix.length)}"`;
  }
  return scope;
};

export const oauthConsentHTML = (props: {
  clientName: string;
  clientIcon?: string | undefined;
  oauthQuery: string;
  scopes: string[];
}): string => {
  const name = utils.escapeHtml(props.clientName || 'An application');
  const initial = utils.escapeHtml(
    (props.clientName || 'A').trim().charAt(0).toUpperCase()
  );
  const icon =
    props.clientIcon && /^https?:\/\//i.test(props.clientIcon)
      ? `<img class="brand-icon" src="${utils.escapeHtml(props.clientIcon)}" alt="" />`
      : `<div class="brand-icon brand-icon--fallback">${initial}</div>`;
  const items = props.scopes
    .map(scope => `<li>${utils.escapeHtml(describeScope(scope))}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize ${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fustat:wght@200..800&display=swap" rel="stylesheet" />
<style>
  :root {
    --bastille: #1C1825;
    --alto: #D4D4D4;
    --fern-green: #417741;
    --salt-box: #6E6B73;
    --red: #C62828;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Fustat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #FFFFFF; color: var(--bastille); margin: 0; min-height: 100vh;
    display: flex; align-items: center; justify-content: center; padding: 24px 20px 32px;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    background: #FFFFFF; max-width: 420px; width: 100%; padding: 32px;
    border-radius: 16px; border: 1px solid var(--alto);
    box-shadow: 0px 10px 50px #00000029;
  }
  .brand-icon {
    width: 56px; height: 56px; border-radius: 14px; display: flex;
    align-items: center; justify-content: center; margin: 0 auto 16px;
    object-fit: cover;
  }
  .brand-icon--fallback {
    background: var(--bastille); color: #FFFFFF; font-size: 24px; font-weight: 700;
  }
  h1 { font-size: 20px; font-weight: 700; margin: 0; line-height: 130%; text-align: center; }
  p.sub {
    color: var(--salt-box); font-size: 14px; line-height: 140%;
    margin: 8px 0 0; text-align: center;
  }
  ul { list-style: none; padding: 0; margin: 24px 0; }
  li {
    padding: 12px 0; border-top: 1px solid var(--alto); font-size: 14px;
    line-height: 140%; display: flex; align-items: flex-start; gap: 10px;
  }
  li::before {
    content: '\\2713'; color: var(--fern-green); font-weight: 700;
    flex-shrink: 0;
  }
  .actions { display: flex; gap: 12px; }
  button {
    flex: 1; padding: 12px; border-radius: 8px; border: 1px solid transparent;
    font-family: inherit; font-size: 16px; font-weight: 700; cursor: pointer;
    transition: opacity .15s ease;
  }
  button:disabled { opacity: .5; cursor: default; }
  .allow { background: var(--bastille); color: #FFFFFF; }
  .allow:not(:disabled):hover { opacity: .88; }
  .deny { background: #FFFFFF; color: var(--bastille); border-color: var(--alto); }
  .deny:not(:disabled):hover { background: #F7F7F8; }
  .err {
    color: var(--red); font-size: 13px; line-height: 140%; margin: 16px 0 0;
    text-align: center; display: none;
  }
</style>
</head>
<body>
  <div class="card">
    ${icon}
    <h1>${name} wants to access your Ganju account</h1>
    <p class="sub">It will be able to:</p>
    <ul>${items}</ul>
    <div class="actions">
      <button class="deny" id="deny" type="button">Cancel</button>
      <button class="allow" id="allow" type="button">Allow</button>
    </div>
    <p class="err" id="err">Something went wrong. Please try again.</p>
  </div>
  <script>
    var oauthQuery = ${JSON.stringify(props.oauthQuery)};
    function submit(accept) {
      var buttons = document.querySelectorAll('button');
      buttons.forEach(function (b) { b.disabled = true; });
      fetch('/auth/oauth2/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accept: accept, oauth_query: oauthQuery })
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          // A browser fetch sets sec-fetch-mode: cors, so the endpoint answers
          // with { redirect: true, url } rather than a 302 — for both Allow and
          // Cancel, the latter carrying access_denied back to the client.
          var target = data && (data.url || data.redirect_uri);
          if (target) {
            window.location.href = target;
          } else {
            throw new Error('missing redirect target');
          }
        })
        .catch(function () {
          document.getElementById('err').style.display = 'block';
          buttons.forEach(function (b) { b.disabled = false; });
        });
    }
    document.getElementById('allow')
      .addEventListener('click', function () { submit(true); });
    document.getElementById('deny')
      .addEventListener('click', function () { submit(false); });
  </script>
</body>
</html>`;
};
