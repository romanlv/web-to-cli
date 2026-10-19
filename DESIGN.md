# web-to-cli: a template for self-building CLIs that read a website

## Goal

A CLI made from this template gets information out of one website for the person whose account it is signed in as, by driving a real browser, and writes its own code for any read it has not done before. It is built on the machinery of `workday-cli` and `x-cli`: the same `core/`, the same request queue, the same awf workflows that build and repair ops. Only the domain folder, `site/`, is the site's own.

The template is not tied to a site. `bun create <user>/web-to-cli <dir>` copies it and `bun run configure` turns the copy into a CLI for one: it names the command (`bin/site` becomes `bin/<cli>`), sets the origin, renames the `WEBCLI_` environment prefix, and leaves what it can't know for a person ([`docs/new-site.md`](docs/new-site.md)). This document says `site` for the command and "the site" for whatever it reads; the examples use a generic site with items, its search and an item's page, the way a Hacker News CLI (`configure hn --url https://news.ycombinator.com --public`) would look.

The reads a site's CLI ends up covering are what its people ask for, typically:

- search the site, with its own operators
- a list the site shows (a feed, a category, a front page)
- one record's page and what hangs off it (comments, history)
- the signed-in account's own lists and notifications

By default it only reads (`SITE.readOnly`). Nothing it does, and nothing an agent does while building it, submits a form, posts, buys, deletes or changes a setting. A request for an op that writes is declined at intake. A site that is written to sets `readOnly: false`, and its `authoring.md` says exactly what may change.

Ops start from none: the first op built through the workflows is reviewed by a person line by line and becomes the reference every later build copies (`site/authoring.md`). Everything after it is built on request.

The tool talks to the site through the browser on the person's own sign-in, or signed out for a public site. An op reads the page, or the JSON responses the page itself fetches, which often carry more than the screen shows (see [Browser layer](#browser-layer)). A site that watches for automation gets a slower, quieter browser ([Sites that watch for automation](#sites-that-watch-for-automation)). Out of scope: a site's paid API, and running on a schedule.

## Core and domain

`core/` never imports from `site/`. It is the template's machinery, site-agnostic: what differs between apps is a domain setting or hook in `core/domain.ts` (the sign-in check, `noSignIn`, `appUrl`, `prepareBrowser`, `keepAlive`, `directCalls`, extra `page` commands), every environment variable is named in `core/env.ts` under one prefix, and each part (the direct way, sign-in from `.env.<context>`, what a wait shows, awf's records) has a file of its own.

What a site differs in most is gathered in one file, `site/site.ts`: the `SITE` settings. `site/domain.ts` builds the domain from them, so a site that fits the settings needs no other code before its first request.

```
core/                       the reusable part: knows nothing of the site
  cli.ts                    the commands, their flags and help
  output.ts                 the output envelope, exit codes, text for people
  contexts.ts               named contexts (here: accounts) and their saved sign-ins
  ops.ts                    op registry, defineOp, step(), the runner, triage
  direct.ts                 an op's direct way: plain HTTP on the saved sign-in, tried before the browser
  requests.ts               the request ledger
  worker.ts                 the worker loop, which starts a run per request
  awf.ts                    a run's awf command line, and what awf keeps of it, read back for status
  watch.ts                  what `request:status --wait` shows while it waits
  browser.ts                a signed-in browser per call, and the sign-in
  credentials.ts            a sign-in from `.env.<context>`, for a domain with `submitSignIn`
  session.ts, snapshot.ts   exploring sessions, the `page` commands, the page as text
  workflows/                awf workflows: build.ts (new ops, changes), repair.ts
  instructions/             what core tells agents: prompts.ts (every prompt), authoring.md (any op)
site/                       the domain
  site.ts                   SITE: name, origin, aliases, startPath, signIn, ready, refusals,
                            testIdAttribute, readOnly, directCalls, careful, maxRunning
  domain.ts                 the generic sign-in check and hooks, built from SITE
  helpers/index.ts          Playwright moves every page shares (open, list, json, scroll, text, errors)
  op.ts                     what every op.ts imports: defineOp typed with the helpers, the errors
  main.ts                   the entry point bin/site runs
  knowledge/                site.md, contexts/<context>.md
  ops/<op>/                 one folder per op
  authoring.md              what is particular to this site's ops; read-only rules; names the reference op
bin/site                    the command, renamed by configure
```

The workflows take the domain folder as an argument and read its `authoring.md`, knowledge and ops; they never name the site. Their test-data rules come from `authoring.md` too, which by default says: read only.

## Interface

The CLI is the whole interface. Whoever calls it, a person or an agent, sees commands and text output, and never Playwright, selectors or a browser API. It follows airkit's conventions (the `--json` envelope, exit codes 0 to 4 and 6; 5 is new), so an agent that knows one knows the other.

```
$ site items:search --query "rust compiler" --limit 3
url: https://example.com/item?id=…
...

$ site item:get --id 0
error: no item 0

$ site item:comments --id 8863
error: there is no op item:comments; add --request to have it built
Next: to have it built, with anything the call doesn't say
  site item:comments --id 8863 --request "…"

$ site item:comments --id 8863 --request "nested replies too, oldest first"
request R-0001 filed: no op item:comments yet
Next: check on it
  site request:status R-0001 --wait
```

- **Nothing is built by accident.** A call to an op that doesn't exist fails with exit 2 and names the ops close to it; only `--request` files it.
- **Ops are `noun:verb`** (`items:search`, `items:list`, `item:get`, `item:comments`). `site help` lists them, grouped by noun; `site <op> --help` comes from the op's spec and input schema, so a new op documents itself.
- **One account per call.** Every call runs as the current context, or the one `--context` names (see [Accounts and contexts](#accounts-and-contexts)).
- **Text by default, `--json` for code.** The JSON is the envelope `{ "ok", "data", "error", "next" }`, where `next` lists `{ hint, cmd }` for what to run next. A command returns its data and, where a person reads it differently, its text; `--json` prints the data.
- **A few flags are every command's.** `--json`, `--context`, `--wait`, `--timeout`, `--request`, `--help`, `--headed`, `--dry-run`, `--browser` and `--input-json` steer the call; the rest are the op's, or the command's own (`requests --state`, `page --session`). An op whose input would be one of the shared flags is refused when called, since the flag would never reach it. A read-only domain's help leaves out `--dry-run`, which has no submit to stop before.
- **Errors say what to do next.** A bad input says what is valid; a signed-out session says how to sign in; a rate limit says so; a filed request says how to check on it.
- **stdout is only the result.** Progress goes to stderr; a failure prints nothing to stdout.

| Exit | Meaning |
| --- | --- |
| 0 | done |
| 1 | unexpected error |
| 2 | bad input |
| 3 | precondition: no context, signed out, a record not found |
| 4 | the site refused it: a rate limit, a block, a locked account |
| 5 | pending: a request was filed or is open (op missing, changing or being repaired) |
| 6 | `--wait` gave up before the request finished |

## At a glance

An implemented op is all code: no model call, no tokens, as fast as the site's pages allow. Coding agents are involved only through requests: an op that does not exist, a change to one, or a repair.

```
                    ┌───────────────────────────────────────────────┐
 site <op> ...    ─▶│ op exists? ─yes─▶ run the op (Playwright code) │─ok─▶ result on stdout
                    └─────┬───────────────────────┬─────────────────┘
                          │ no                    │ failed
                          │                       ▼
                          │                 triage (rules)
                          │                 │              │
                          │            op's fault     data, login, browser
                          │                 │              └─▶ error + next hint, exit 1-4
                          ▼                 ▼
 site request "…"    ─▶ request ledger  R-0012 received
 <op> --request ["…"] ─▶   │
                           ▼
                     worker: one awf run per request (run id = R-0012)
                     build (new, change) or repair
                     own worktree, own browser session
                           │  verified and reviewed
                           ▼
                     merged to main ─▶ the next call runs it as code
```

Triage is rules only, so a failing op never calls a model either. Not the op's fault: signed out, a record that is not there, the site refusing (a rate limit, a block: `SITE.refusals`), the browser failing to start. Anything else is filed as a repair request.

## Requests

Building an op can take half an hour, so every change to the tool goes through a request: filed, queued, worked as its own awf run, and checked on later. Nothing blocks the caller unless it asks to wait.

### Filing one

| How | Kind |
| --- | --- |
| `site request "the comments under an item"` | whatever intake decides: new, change or duplicate |
| `site item:comments --id 8863 --request ["…"]` (no such op) | new; the flags given are the first draft of its inputs, the text adds what they don't say |
| `site items:search ... --request "also each item's score"` | change to that op; the rest of the call is the example |
| an op fails and triage says it is the op's fault | repair, filed by the runner with the failure bundle |

A request records the context it was filed in, and its run works as that account. Each way of filing prints the request id and exits 5. `--wait` on any of them blocks until the request finishes, then runs the original call on the new op.

### Following one

- `site request:status R-0012 [--wait]` — state, the stage it is in, the awf run id, and the result, the reason it stopped, or the question it is waiting on. While it waits, it shows each stage of the run with its time, and the running one's turn, agent and last step, from awf's view of the run (`awf runs <id> --json` and its `turns.jsonl`)
- `site requests [--state building]` — the ledger, newest first
- `site request:answer R-0012 "…"` — answer a blocked request's question; its run continues from the stage that asked
- `site request:cancel R-0012 ["why"]` — end a request that isn't finished: its run, if one is going, is stopped, and its worktree removed. A retry takes it up again from the start
- `site request:retry R-0012` — put a failed, deferred or cancelled request back in the queue. It continues from the stage that stopped, unless its run completed (deferred, a flaky repair) or its worktree is gone (cancelled): then it starts again from the first stage

Detail beyond that is awf's: `awf runs R-0012` and `awf logs R-0012`.

### The ledger and the worker

Every request is kept, whatever happens to it, in `.state/requests/`: `ledger.jsonl` has one line per event, and `R-0012.json` the request's current state. The ledger is the record of what the tool was asked for, including what it did not do; `git log` is the record of what it built.

```
received ─▶ building ─▶ done
   │           ├──────▶ failed  ─▶ (retry)
   │           ├──────▶ blocked ─▶ (answer) ─▶ received
   │           ├──────▶ deferred ─▶ (retry)    needs something the tool cannot get yet
   │           ├──────▶ declined               out of scope, unsafe, or too vague to act on
   │           └──────▶ duplicate              an op already does it, or an open request asks for it
   └───────────────────▶ cancelled ─▶ (retry)    request:cancel, from any state that isn't final
```

The worker is a loop: it takes the oldest received request and starts an awf run for it, as many at once as `SITE.maxRunning` (2 by default; 1 for a site that limits each account). Filing a request starts the worker if none is running. When a request starts, the worker decides whether its run continues or starts again from the first stage, and records `redo` on it until that stage starts. Deferred, declined and duplicate are decided by the run's first stage, intake, so they show up as outcomes of a run that ended early.

Two requests for the same thing don't both get built:

- **One intake at a time.** The worker starts a run that begins at intake only while no other is in intake, so each intake sees what the one before it decided. Repairs have no intake and run beside it.
- **Intake sees the open requests.** Each one's id, state, op and text are in the prompt. When one already asks for the same thing, intake answers *same*, and the request ends as its duplicate; its status points to the request that builds it.
- **The op lock.** A run takes a lock on its op once intake has named it, and a second request for that op waits. That catches two names intake would have to guess are the same.
- **After a lock wait, intake again.** A request that waited on an op's lock before building anything drops its worktree and starts again at intake, against main as the other request left it. There it usually ends as a duplicate, or becomes a change to what was built. One that waited with work in its worktree continues where it stopped.

A repair is filed once per op and step: while it is open, a call that fails the same way joins it instead of filing another.

## Operations

An operation (op) is one read as a folder of plain files that agents write and people can read. `site items:search` runs `site/ops/items-search/op.ts`.

| File | Holds | Written by |
| --- | --- | --- |
| `op.ts` | the Playwright code, built from named steps, and the direct way | build, repair |
| `spec.md` | what the op reads, its inputs and outputs, what counts as done | build |
| `notes.md` | what the pages taught: URLs, test ids, quirks, waits that mattered, the calls behind them | build, repair (append only) |
| `examples.json` | inputs that worked, each tagged with the context it worked in | build, repair |
| `history.jsonl` | one line per run: context, ok or failed, at which step, how long | the runner |

An op exports one `defineOp` (from `site/op.ts`) with a typed input, a typed output and a `run` function (`site/authoring.md` has the shape).

- **Steps are named** so a failure points at one (`failed at "read results"`), and each step leaves a screenshot and an accessibility snapshot when it fails.
- **Output is read from the site**, never echoed from input.
- **`app` is the helper library** (`site/helpers/`), for moves every page shares. It starts generic: `open` a path and wait for `SITE.ready`, turning the site's refusals into exit 4; `list` the elements matching a selector, scrolling at a person's pace up to a limit; `json`, the response the page fetches while an action runs; `scroll`, `text`, and `errors`, which reads `SITE.refusals`. The first builds make it the site's own (its search, its pagination). Locators target `SITE.testIdAttribute` first, when the site has one.
- **Every read is bounded**: a `limit` with a default, or a stopping point; a list that scrolls stops after ten scrolls and says there is `more`.
- **Ops are the same for every account.** What differs (a list id, the account's own name) comes in as input or from the account's knowledge file.

`site ops` lists what exists, with each op's last result and whether a request is open on it.

## Accounts and contexts

A context is an account on the site, named as in `kubectl config use-context`: a nickname, a URL and a saved sign-in.

```
$ site context:add me --url https://example.com
$ site context:login me        # a browser opens; the person signs in, 2FA included
$ site contexts
* me   https://example.com   signed in, 2h ago
```

- **The URL is where runs start.** A context URL with a path of its own (an account, a workspace, a tenant) is where runs start, and the sign-in check is made against it; a bare origin starts from `SITE.startPath`. The generic check (`site/domain.ts`) tells signed in from signed out by `SITE.signIn`: the sign-in paths, the signed-out selectors, and the signed-in ones, which a site should name as soon as it knows them. It answers `elsewhere` when a signed-in page is on another host than the site. A site whose URLs name an account teaches `signInState` to refuse a session signed in as anyone else.
- **A public site needs no person.** With `SITE.signIn.required: false` (`configure --public`), the domain sets `noSignIn`: `context:login` opens the context's URL headless and saves that session, with no window and no person, and every page of the site counts as signed in.
- **Otherwise only a person signs in**, in the window, unless the domain adds `submitSignIn` (a form the CLI may fill from `.env.<context>` or `--username` and `--password`). The template has none: automated logins are what watchful sites challenge hardest. The saved sign-in is `.state/contexts/<name>/auth.json`; agents never see or type credentials.
- **Nothing drives or watches the sign-in window.** X refused a sign-in in a Chrome that Playwright launched, and again in one with a debugging port attached; it let the same sign-in through in Chrome started by hand. So `context:login` starts the browser as itself (the installed Chrome for a `careful` site, Playwright's Chromium otherwise), with no Playwright flags and no debugging port, on a profile kept for the context (`.state/contexts/<name>/browser`, so the site sees the same browser each time). The person signs in, then presses Enter in the terminal or quits the browser; core interrupts it (so it saves its cookies), opens the profile with Playwright, headless, with the same browser, asks `signInState`, and saves the sign-in.
- **A request keeps the context it was filed in**, so switching contexts never moves a running build to another account.
- **Account knowledge** lives in `site/knowledge/contexts/<name>.md`, and examples are tagged by context.
- **Signed out mid-run**, a run stops `blocked` with "sign in again: site context:login me" as its question, and continues once that is done.

## Browser layer

Playwright does all the browser work, behind the CLI.

- **Each call and each run gets its own browser.** An op call launches the domain's browser headless with its context's saved sign-in, runs, and closes. Each awf run, and the checker inside it, gets its own browser the same way, so two runs never share a page.
- **Unless the domain keeps one.** A site that limits fresh page loads sets `keepBrowser` (a `careful` site does; x-cli needed it because about 30 loads of X in ten minutes left x.com blank): a context's op calls run one at a time in one signed-in browser that a daemon keeps between them (`ops-<context>-<checkout>`, a session like the exploring ones), and the helpers move within the app instead of loading it again. The daemon starts again when core's or the domain's code changes, closes after ten idle minutes, and a build's is closed with its worktree; a merge's verify calls share one and come a few seconds apart. `--headed`, `--dry-run`, an op with a direct way and `WEBCLI_KEEP_BROWSER=0` start a browser of their own.
- **Headless by default, `--headed` to watch.** A person can watch any op or run, and step in on a stuck screen.
- **Exploring uses the same CLI.** Agents drive the page through `site page` commands, attached to a named session that stays open between calls. The session comes from `--session` or `WEBCLI_SESSION`, which the workflow sets for each agent (`R-0012`, and `R-0012-check` for the checker).

| Command | Prints |
| --- | --- |
| `site page` | URL, title and the accessibility tree, each control with a ref such as `e14` |
| `site page:goto <url>` | the page at that URL |
| `site page:click e14` | the tree after the click, with what changed marked; `page:fill`, `page:select`, `page:press` and `page:wait` likewise |
| `site page:shot` | the path of a screenshot |
| `site page:requests [all \| n [body]]` | the session's recent calls (the last 30; `all` for every kept one) under the command that made them, the newest JSON and event-stream ones numbered; `n` prints one with its headers and bodies, `n body` only its response |
| `site page:fetch` | a call made the way a direct way would, on the saved sign-in; left out when `directCalls` is false |
| `site page:trace`, `site page:close` | the session's trace; end the session |

A domain adds its own through `pageCommands` (x-cli had `page:search` and `page:posts`); the template adds none.

- **Exploring leaves a trace.** Every `page` command is logged with the locator Playwright used, to `trace.jsonl` in the run. Writing `op.ts` starts from what worked, not from the agent's memory of it. The page shows each control's test id (the domain's `testIdAttribute`), and a unique one is the locator suggested: `page.getByTestId(...)`.
- **A direct way, where the site allows one.** An op may have a `direct` way, plain HTTP on the saved cookies with no browser, tried before the browser; the builder finds the calls behind a page with `page:requests`, as the `direct-calls` skill says. A site that tells its own calls from anyone else's (signed calls, rotating query ids, fingerprinting) sets `SITE.directCalls: false`, which keeps an op that has one from loading and leaves out `page:fetch`; its ops read the responses the page fetches instead (`app.json`). x-cli did this for X ([x-cli's `x/knowledge/bot-detection.md`](https://github.com/romanlv/x-cli/blob/main/x/knowledge/bot-detection.md)).
- **The browser a site needs.** By default a call uses Playwright's Chromium. A `careful` site gets `browserChannel: "chrome"` (core falls back to Playwright's Chromium when Chrome isn't installed) and `hideAutomation`: every browser starts without Playwright's `--enable-automation` (so `navigator.webdriver` is false), and a headless one sends the browser's own user agent without `HeadlessChrome`. Playwright still drives the page over DevTools, which a page can notice; Patchright is the step after, if a site starts challenging reads. `SITE.maxRunning: 1` keeps one request's browsers on the account at a time.
- **Signed in for as long as runs need it.** A domain whose app signs out an idle session sets `keepAlive`: while a request runs, the worker opens the app every `signInEveryMs` and saves the fresh cookies, and open sessions nudge their page every `pageEveryMs`. The template sets none. For a domain with `submitSignIn`, a request blocked on signing in is still signed in again by the worker, once per attempt, when `.env.<context>` holds the sign-in. `WEBCLI_KEEP_ALIVE_PAGE_MS` and `WEBCLI_KEEP_ALIVE_SIGN_IN_MS` change the two intervals; neither turns on one the domain leaves unset, and 0 turns one off.
- **A sign-in check runs before every op:** is the context's session still signed in to its URL. If not, it exits 3 with how to sign in again, and no request is filed, because no agent can fix a login. A page that shows neither the site nor a sign-in but does show a refusal exits 4.

## Build workflow: new ops and changes

`core/workflows/build.ts` handles both a new op and a change to one. The worker starts it as `awf run core/workflows/build.ts --id R-0012 -- R-0012`, so the awf run id is the request id.

Three agents work in it, and all run on their own: the **planner**, on a strong model, decides what to build, says what the person wants, and once the app has been surveyed writes the spec everything after is judged against; the **builder**, on a cheaper one, keeps its session from explore on, where the bulk of the turns are; the **checker** is a fresh agent on another model, in its own browser session, so it does not share the builder's assumptions. Panes open in awf's own Herdr session, so the caller does not need to be in Herdr; it only has to be installed.

1. **intake** — the planner reads the request against the existing ops, the knowledge and the other open requests, and decides: build it, or end the run as deferred, declined or duplicate: of an op that does it, or of an open request that asks for the same (*same*). A duplicate costs one short turn and never opens a browser.
   With build, it writes the **intent**: what the person wants and why, what they expect back, what is unclear. Nothing about screens: nobody has opened the app yet.
2. **explore** — the builder surveys the ways on the site a person could serve the intent (its search and operators, its lists, a record's page, the account's own pages), writes what each gives in `notes.md`, picks one, and does the task once that way through `site page`, reading only, leaving a trace. To find records by a value it uses the site's own search. If no way serves the intent, the request ends deferred with what was tried; if the ways differ in what the person gets back, it asks. For a change, only the part that changes.
3. **spec** — the planner writes or updates `spec.md` from the intent and the builder's notes: what the person wants, the way the op uses and the others with why not, inputs, outputs, what done looks like on the site. It may choose another way the builder found; the op is written to the spec.
4. **write** — the builder writes `op.ts` to the spec, from the trace and notes, with `authoring.md` and the reference op open, using the helpers and adding one when a move does not hold for every page yet; a read gets its direct way too, unless the domain rules it out (`directCalls: false`). `examples.json` gets an input for each case the spec tells apart. Then it tries the op as a caller would, and fixes it until all of this holds: each example's output is what the spec says, checked on the site; a direct way gives the same output as `--browser`; a bad input exits 2 saying what is valid; `ci:fast` passes. Verify after it only confirms, with no agent.
5. **verify** — `site` itself runs the op on every example for this context; an op with a direct way runs each both ways, and the two outputs must match. No agent is in this step: either the code works or it does not.
6. **review** — the checker runs the op on an input of its own, not an example, and finds what it read on the site itself (open the records, the pages). It reads the builder's last answer, with what it says it ran, as claims to check. It reads the change against the intent and the spec, `authoring.md` and the reference op: values copied from exploration that should be inputs, logic that belongs in a helper, steps without names.
7. **revise** — a failed verify or a blocking review finding goes back to the builder, which fixes it and tries the op as a caller would again, as in write, for as long as each round gets further than the one before (see [When agents get stuck](#when-agents-get-stuck)). The checker marks each finding blocking or minor; with only minor ones, the builder fixes them in one turn and nobody reviews again. Rounds run the repository's fast checks (`ci:fast`: lint, types, unit and workflow tests, seconds); the full suite (`ci:check`, which would add the browser e2e tests; there are none yet) runs once, before approval. If it is still not right, see [When agents get stuck](#when-agents-get-stuck).
8. **merge** — the run works in its own git worktree on `req/R-0012`. It rebases on main, re-runs verify for every op when code the ops share changed (core, and `site/`'s `.ts` outside `site/ops/`: `site.ts`, helpers, model, `domain.ts`), and fast-forwards main: one commit, `R-0012 build item:comments`.

### Models and the sandbox: `workflows.json`

`workflows.json` at the checkout's root names each agent's harness and model (`planner`, `builder`, `checker`, `troubleshooter`, each as awf takes a runtime, an alias included) and whether agents run in a sandbox. An agent it leaves out keeps its default, from `core/workflows/config.ts`, the one place the defaults are named; this checkout's file only turns the sandbox on. A run reads the file once, when it starts.

With `"sandbox": true` the team shares one srt sandbox per run:

- **Writes** only its worktree, a CLI home of the request's own (`.state/sandboxes/R-0012`: sessions, traces, dry runs, failures) and a short socket directory (`/tmp/site-R-0012-…`).
- **Reads** its context's saved sign-in where it is (`WEBCLI_CONTEXTS_DIR`), a repair's the failure bundles of its op (`.state/failures/<op>/`), and awf's source for the type-check. Not the checkout, other worktrees, `~` or anything else in `.state`.
- **Reaches** no network but its model's, and the harnesses' own web search is off: it would reach past the allowlist. The browser stays on the host, since Chromium doesn't start under srt: a host browser server, one per run, ending with it, listens on a socket in that directory, and the CLI connects to it (`WEBCLI_BROWSER`). Its session daemons bind their sockets there too.
- **Checks** with `ci:sandbox`, which is `ci:fast` without the workflow tests: `awf test` can't run under srt, and neither could e2e tests, which need a port for their mock site. The workflow still runs the full checks on the host and hands their failures over as output.
- **More**, when `"sandbox"` is an object instead of `true`: `{"network": ["docs.playwright.dev"], "read": ["../shared"], "write": [...]}` adds domains and paths (from the checkout's root) to the above. Agents read the account's sign-in and what it can see, so a domain added is somewhere they could send both.
- The worktree gets `node_modules` of its own, from bun's cache: bun resolving through a link to the checkout's would need the checkout readable.
- Claude in a sandbox signs in with `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`), from the environment the worker starts from or the checkout's `.env` (gitignored); codex copies its login in.

What isn't sandboxed yet: verify and the checks run the agents' code on the host. That is the next boundary, for models trusted less.

Nobody edits the main checkout by hand; people and agents change the tool in worktrees, so a fast-forward never meets a dirty tree, and the next call runs the merged code.

Each step is an awf stage, so a stopped run continues from the stage that stopped (`request:retry` or `request:answer`), and the run's record shows what each agent did and what it cost.

## Repair workflow

Repairs start themselves. When an op fails and triage blames the op, the runner saves a failure bundle and files a repair request, and the worker picks it up like any other. The caller gets exit 5 and the request id; with `--wait`, the original call runs again once the repair is merged.

The failure bundle sits in `.state/failures/<op>/<time>/`:

- the error, the failed step's name, the inputs and the context
- a screenshot and an accessibility snapshot at the moment it failed
- the page URL and the session's recent network calls
- the op's last ten `history.jsonl` lines, which show whether it ever worked

`core/workflows/repair.ts` skips intake, since the request came from the tool itself, and puts a diagnosis in front of the build workflow's loop. The same two agents do the work:

1. **diagnose** — the builder agent opens its own browser session, reproduces the failure with `site page` on inputs shaped like the failed one, and writes what changed in `notes.md`. A failed direct way is reproduced by running the op without `--browser` and comparing the calls the browser way makes now with those in the notes. A failure it cannot reproduce ends the request `failed` as flaky, with the bundle.
2. **patch** — the builder makes the smallest change to `op.ts` or a helper that fixes it, adds an example through the failed step, and tries the op as a caller would, as in write.
3. **verify, review, revise, merge** — as in the build workflow, with every example for the context re-run, so a fix for one case cannot break another.

An op whose repair ended `failed` is marked `broken` in `site ops`, and calls to it exit 5 pointing at that request until it is retried, or a build, change or repair of the op is done since (verify ran it before it merged). A repair that ended flaky never marks it.

## When agents get stuck

Agents solve problems by default; a person is asked only when they cannot.

Rounds go on while they make progress, not for a fixed count. A round makes progress when its check gets further than the last one's (verify, then the fast checks, the review, the full checks) or stops at the same place with fewer problems (failed examples, blocking findings). After the full checks fail, reaching the review again counts, since it is a fresh look at changed code. The count is per attempt: a run continued after a person's answer starts its rounds again.

1. **The builder and checker** revise for as long as each round makes progress.
2. **A troubleshooter** takes over at the first round that doesn't: one generic agent, the same for every request, on the strongest model, opened fresh with the run's whole record (spec, trace, notes, failures, review findings). It may change anything the builder could, including the spec and the helpers, and goes on while its rounds make progress.
3. **A person** comes last, at the troubleshooter's first round without progress, or after eight rounds in all. The run stops `blocked` with one specific question ("this account can't see that list: which public one should the examples read?"), and `site request:answer` continues it from that stage.

A signed-out session is no agent's to fix: for a domain with `submitSignIn`, the run signs in again from `.env.<context>` when the checkout has it; otherwise it skips straight to step 3.

## Prompts

Everything the workflows tell an agent is in `core/instructions/prompts.ts`: the instructions each agent is opened with, each stage's prompt, and the problems a round hands to the next. The workflows decide when a prompt is sent and to whom; prompts.ts decides what it says. [`docs/prompts.md`](docs/prompts.md) shows every prompt filled in for a sample request, in the order a run sends them; `bun run docs:prompts` writes it, and a test fails when it is out of date.

Every stage prompt starts with the request's whole brief and ends with what a person has answered so far, since an agent may start fresh at any stage. Text goes where it holds:

| What | Where |
| --- | --- |
| How the workflow runs: stages, rounds, what to answer | `core/instructions/prompts.ts`, which never names the domain |
| How any op is written | `core/instructions/authoring.md` |
| What is particular to this app's ops, and the reference op | `authoring.md` in the domain folder |
| What the app, and each account, are like | `knowledge/` |
| One op's screens and quirks | `ops/<op>/notes.md` |

The agents are told to read the last three; only the first is in a prompt.

## Knowledge

The tool should get faster at building with every op, because what one op learns about the site is there for the next.

| Level | Where | Example |
| --- | --- | --- |
| One op | `ops/<op>/notes.md` | "search loads 30 results per page; the next page is the `More` link" |
| All of the site | `knowledge/site.md` | "an item's permalink is the link around its age" |
| One account | `knowledge/contexts/<context>.md` | its lists, its own user name |
| Code | `helpers/` | `app.list(selector, read, { limit })`, written once and used by every op |

A site that watches for automation adds a level of its own, such as x-cli's `knowledge/bot-detection.md`: what the site watches for, its rate-limit headers, what keeps a low profile.

Promotion moves knowledge up a level: a note not specific to its op goes into `site.md` too; a move written out in two ops becomes a helper; a person's answer is written where it belongs.

## Guardrails

Agents drive a real, personal account, so the limits are set in code and in the domain's rules, not only in prompts.

- **Read only, unless the site says otherwise.** With `SITE.readOnly`, no op writes, and `authoring.md` (which every agent reads, and whose test-data rules the prompts defer to) forbids anything that changes the account. Intake declines requests to write.
- **The context's account only.** The sign-in check refuses to run when the session is signed in elsewhere than the context names, as far as the domain's `signInState` can tell.
- **At a person's pace.** The helpers scroll and page with a pause a person might take, and turn a rate limit or a block into exit 4, never a retry loop or a repair. A site that limits each account sets `maxRunning: 1`.
- **Done means read from the site.** An op's output comes from what the site returned, and the checker confirms it on its own.
- **Every self-edit is a commit** on its request's branch, merged only after verify and review, so `git log` is the tool's growth history and `git revert` undoes a bad change.
- **Bounded spend.** A time limit per run, eight revise rounds at most, and `SITE.maxRunning` runs at a time.

## Sites that watch for automation

Some sites detect automation and limit or lock accounts that look like it. `SITE.careful` (`configure --careful`) turns on what x-cli needed for X: the installed Chrome, no automation switch, and one browser kept between calls; pair it with `maxRunning: 1` and `directCalls: false` when the site limits each account or flags separate clients. It costs speed and buys a lower profile. [x-cli's `x/knowledge/bot-detection.md`](https://github.com/romanlv/x-cli/blob/main/x/knowledge/bot-detection.md) is the prior research, with sources, and a starting point for a site's own notes.

## Open questions

- [ ] There are no e2e tests yet. They need a mock site (a sign-in page, a search page, a record's page) so `ci:check` can cover the runner, the browser and the helpers.
- [ ] One request at a time still opens two browsers on the account (the builder's and the checker's). A site that limits each account may mind.
- [ ] The generic sign-in check counts a loaded page with no signed-out sign as signed in when `SITE.signIn.signedIn` is empty. A slow sign-in redirect can fool it; whether `configure` should insist on a signed-in selector is open.
