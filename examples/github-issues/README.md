# github-issues

List and open issues in your GitHub repositories, so an assistant can check
whether a bug is already reported and file it if not.

| Tool | What it does |
| --- | --- |
| `github-list-issues` | The most recently updated issues, with labels, author and comment count |
| `github-create-issue` | Opens a new issue with a title, body and labels |

## What it shows

- **`ctx.secret`.** The GitHub token isn't in the code, in `ganju.json` or in
  the bundle. You send it once with `ganju secret set`, and the tool reads it on
  each call. Rotating it needs no redeploy.
- **Input validation in the schema.** `repo` must match `owner/name` (a
  `pattern`), `state` is an `enum`, and `limit` has a `minimum` and `maximum`.
  A bad value is refused before your code runs.
- **Error messages the model can act on.** A 401 says to reset the secret,
  and a 404 says to check the repository name or the token's access.
- **A write tool whose description says to confirm first.**

## Set up

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
with **Issues: Read and write** on only the repositories you want the assistant
to reach. Then:

```bash
ganju link

# Read from the environment so it stays out of your shell history.
read -s GANJU_SECRET_VALUE && export GANJU_SECRET_VALUE
ganju secret set GITHUB_TOKEN
unset GANJU_SECRET_VALUE

ganju test github-list-issues --input '{"repo":"your-org/your-repo","limit":5}'
ganju deploy
```

`ganju test` runs with the real secret, so testing `github-create-issue` opens a
real issue. Point it at a scratch repository.

## Files

```
ganju.json             two tools, allowedHosts: ["api.github.com"]
src/listIssues.ts      github-list-issues
src/createIssue.ts     github-create-issue
src/lib/github.ts      the authenticated request, and its error messages
```
