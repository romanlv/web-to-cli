# Adapting the template to a site

The checkout has two parts: `core/`, the machinery and the instructions every site shares, and the
domain folder `site/`, which is all a new site needs to fill in. `bun run configure` does the
renaming; this page is what is left after it, and why each piece is where it is.

## 1. Create and configure

```sh
bun create romanlv/web-to-cli <cli>-cli
cd <cli>-cli
bun run configure      # or: bun run configure <cli> --url <origin> [--public] [--careful] --yes
```

From a local checkout of the template, `bun run configure <cli> --url <origin> --into ../<cli>-cli`
does the same without GitHub.

Answer no to "needs a signed-in account" (`--public`) for a site that needs no account (the CLI reads it signed out), and `--careful` for
one that watches for automation and limits accounts (X, LinkedIn, most social sites): it costs speed
and buys a lower profile. Both are settings in `site/site.ts`, changeable later.

## 2. One look at the site, into `site/site.ts`

Open the site in your browser, signed in and signed out, and fill in:

| Setting | What to look for |
| --- | --- |
| `signIn.signedIn` | something only a signed-in page shows: an avatar, an account menu, a sign-out link. The most important setting: without it, any loaded page with no sign-in button counts as signed in |
| `signIn.signedOut` | a sign-in button, a password field |
| `signIn.signInPath` | the paths of the sign-in flow, for a site that redirects there |
| `aliases` | other hosts that are the same site (`m.`, `www.`, an old domain) |
| `startPath` | where a run starts: the dashboard, the feed, the front page |
| `ready` | a selector the page shows once its main content is drawn, for a single-page app that draws after load |
| `refusals` | the site's words for a rate limit or a block |
| `testIdAttribute` | the attribute its controls carry (`data-testid`, `data-test`, `data-qa`), if any |
| `directCalls` | false if the site signs its API calls or fingerprints clients: ops then read only what the page's own calls return |

Then check it: `bin/<cli> context:add me --url <origin>`, `bin/<cli> context:login me`, `bin/<cli> page`.
A sign-in check that answers wrong shows up here, before any agent depends on it.

## 3. What settings can't say, in `site/domain.ts`

The hooks are each described in `core/domain.ts`. The ones a site most often needs:

- `signInState` beyond selectors: a context that names an account (`https://site/<user>`) and must
  refuse a session signed in as anyone else (`elsewhere`). x-cli's `x/domain.ts` is the example.
- `submitSignIn`: a sign-in form the CLI may fill from `.env.<context>`, for a site that doesn't
  challenge automated logins (an internal tool, a tenant app). X does, so x-cli has none.
- `keepAlive`: a site that signs out idle sessions within a build's time.
- `prepareBrowser`: routes to block, headers to watch, before any page loads.
- `pageCommands`: an extra `page:<name>` for a move agents make constantly while exploring (a search).

## 4. The rules, in `site/authoring.md`

What the CLI is for and what it must never do on the site, how test data is marked (or that there is
none), the site's limits, and later, the reference op. Agents follow it literally, and intake
declines requests it rules out, so it is the main guardrail. Write what you know into
`site/knowledge/site.md` too: pages, pagination, search, the calls behind them.

## 5. First request

```sh
bun run ci:check && git add -A && git commit -m "<cli> from the web-to-cli template"
bin/<cli> request "<a plain read: a list, a search, one record's page>"
bin/<cli> request:status R-0001 --wait
```

Review the op it builds line by line, fix what you'd do differently (in a worktree), and name it in
`site/authoring.md` as the reference: every later build copies it.

## Where things go

| What | Where | Who writes it |
| --- | --- | --- |
| The machinery: CLI, contexts, op runner, requests, worker, browser, page sessions | `core/*.ts` | nobody per site |
| The workflows that build and repair ops | `core/workflows/` | nobody per site |
| What the workflows tell agents: every prompt, and how any op is written | `core/instructions/` | nobody per site |
| Skills the agents read | `.claude/skills/` (`direct-calls`) | nobody per site |
| The site's settings | `site/site.ts` | you, step 2 |
| The domain's hooks | `site/domain.ts` | you, when settings aren't enough |
| The moves every page shares (`app`) | `site/helpers/` | you, then the agents |
| What is particular to ops for this site, the reference op | `site/authoring.md` | you, then the agents |
| What the site is like | `site/knowledge/site.md` | you, then the agents |
| What one context (account, tenant) is like | `site/knowledge/contexts/<context>.md` | the agents |
| The ops | `site/ops/<noun>-<verb>/` | the agents, through requests |

Code is in `.ts` files and instructions in `.md` files. Agents read the core rules first and the
site's after, and the site's win where they differ: put a rule in `core/instructions/` only when it
holds for every site. After changing either, or `workflows.json`, run `bun run docs:prompts` and
read the diff of `docs/prompts.md`: it is exactly what agents will see.

## Keeping core in step

`core/` is x-cli's with one addition (`noSignIn`, for public sites). Keep it that way: a fix to core
made in one CLI can then be copied to the others and to the template as a whole-file change. What a
site needs that core lacks goes in as a new optional hook in `core/domain.ts`, never as a site's
name in core.
