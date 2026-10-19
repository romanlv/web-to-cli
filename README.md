<!-- template -->
# web-to-cli: a template for a CLI that writes its own commands, for any website

This is [x-cli](https://github.com/romanlv/x-cli) with X taken out. What is left is the machinery that let x-cli start with
no commands and build every one it has from a sentence: a CLI, a request queue, a worker, a browser
layer on the person's own sign-in, and the awf workflows in which coding agents explore a site,
write an op, verify it against the live site, review it on a second model and merge it. The next
call runs the op as plain Playwright code: no model, no tokens.

Pointing it at another site is `bun create`, a few questions, and one settings file:

```sh
bun create romanlv/web-to-cli hn-cli     # copies the template, git init, bun install
cd hn-cli
bun run configure                        # asks: command name, site URL, sign-in needed, careful
bin/hn context:add me --url https://news.ycombinator.com
bin/hn context:login me                  # a public site: opens it once, headless, and saves the session
bin/hn page                              # what the agents see: the page as text, each control with a ref
bin/hn request "the front page stories, with points and comment counts"
bin/hn request:status R-0001 --wait
```

## What is the template's and what is the site's

| Part | Where | Per site? |
| --- | --- | --- |
| CLI, contexts, op runner, triage, requests, worker, browser, page sessions | `core/*.ts` | no |
| The build and repair workflows, and every prompt agents get | `core/workflows/`, `core/instructions/` | no |
| **The site's settings**: name, origin, sign-in signs, refusals, how careful to be | `site/site.ts` | **yes: start here** |
| The sign-in check and the domain's hooks, built from those settings | `site/domain.ts` | only for what settings can't say |
| The moves every page shares (`app.open`, `app.list`, `app.json`, …) | `site/helpers/` | grows with each build |
| What ops may and may not do on the site, test data, limits, the reference op | `site/authoring.md` | yes |
| What the site is like: pages, controls, the calls behind them | `site/knowledge/` | grows with each build |
| The ops | `site/ops/<noun>-<verb>/` | written by the agents, through requests |

`core/` is x-cli's, unchanged except for one setting a public site needs (`noSignIn`), so fixes
there can be carried between CLIs made from it. The domain folder is always `site/`; only the
command, the origin and the environment prefix change.

## `bun run configure`

```
bun run configure [<cli>] [--url <origin>] [--public] [--careful] [--prefix <PREFIX_>] [--into <dir>] [--yes]
```

`bun create` can't ask questions itself: it runs a template's postinstall with no terminal and
hides its output. So the template's `package.json` only sets `"bun-create": { "start": "bun run
configure" }`, which makes `bun create` end by naming this step. It asks for what isn't given as a
flag (or takes every answer as flags, with `--yes` for the defaults, for scripts), then:

- names the command (`bin/<cli>`, `package.json`, `site/site.ts`) and the origin
- `--public`: the site needs no account, so `context:login` opens it headless and saves the session
- `--careful`: the site watches for automation (as X does): installed Chrome without the automation
  switch, one kept browser between calls, one build at a time
- sets the environment prefix (`HNCLI_` for `hn`; the template's is `WEBCLI_`)
- rewrites this part of the README, fills in `docs/prompts.md` for the CLI, and removes itself
- with `--into <dir>`, run from a template checkout, copies the template there first (no ops, state
  or sign-ins), installs and runs `git init`: the same result without `bun create` or GitHub
- refuses to configure the template's own checkout in place (`--force` overrides)

`bun create` makes the first commit from the unconfigured template, so `configure`'s changes show
as one diff to commit.

Then fill in what it can't know, from one look at the site: [`docs/new-site.md`](docs/new-site.md).

## Requirements

[bun](https://bun.sh) 1.4+, git and Google Chrome (Playwright's Chromium stands in when Chrome is
missing). Building ops also needs [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
(planner, builder, troubleshooter), [Codex CLI](https://github.com/openai/codex) (checker),
[Herdr](https://herdr.dev) (the panes the Claude agents run in) and Node.js (for the sandbox).
`workflows.json` turns the sandbox on; a sandboxed Claude needs `CLAUDE_CODE_OAUTH_TOKEN` in `.env`
(`claude setup-token`). x-cli's README has the details, all of which hold here.
<!-- /template -->

## Using it

```sh
bin/site help                         # the ops it has, grouped by noun
bin/site <op> --help                  # an op's flags, from its input schema
bin/site <op> ... --json              # { ok, data, error, next } for scripts and agents
bin/site request "what you want read" # have an op built
bin/site requests                     # the ledger
```

Exit codes: 0 done, 1 unexpected, 2 bad input, 3 signed out or not found, 4 the site refused
(rate limit), 5 a request was filed or is open, 6 `--wait` gave up.

## Checks

`bun run ci:fast` (lint, types, unit and workflow tests, seconds), `bun run ci:check` (all of it).

## More

- [`DESIGN.md`](DESIGN.md): how all of it works, and why.
- [`docs/new-site.md`](docs/new-site.md): adapting the template to a site.
- [`docs/prompts.md`](docs/prompts.md): every prompt the agents get, filled in for a sample request.
