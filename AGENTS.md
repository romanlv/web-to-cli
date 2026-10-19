# web-to-cli

A template for a CLI that reads a website for the person whose account it is signed in as, by
driving a real browser, and builds its own ops through awf workflows. It is [x-cli](https://github.com/romanlv/x-cli) with
X taken out. `DESIGN.md` is how it works, `docs/new-site.md` how to adapt it, and `bin/site help`
the command reference.

- `core/` is the reusable machinery and never imports from `site/`, the domain. It is x-cli's,
  plus `Domain.noSignIn`; keep it in step with x-cli rather than letting it drift.
- `site/site.ts` holds the site's settings; `site/domain.ts` and `site/helpers/` read them. A site's
  specifics go there, never into core.
- `bun create <user>/web-to-cli <dir>` copies the template; `bun run configure` (`scripts/configure.ts`)
  then asks for the site and converts the copy. Test changes to it with `--into <scratch dir>`, or
  with `BUN_CREATE_DIR=<dir holding a copy> bun create web-to-cli <dest>`, never on this checkout.
- **Read only** unless a site's `authoring.md` says otherwise: no op, and nothing an agent does
  while exploring, submits, posts, buys, deletes or changes a setting.
- Run it as `bin/site` (bun). State lives in `.state/` (gitignored), or `WEBCLI_HOME`.
- Ops in `site/ops/` are written by the build and repair workflows, in worktrees, and merged by
  fast-forward. The template itself has none.
- `core/instructions/` is what core tells agents (`prompts.ts`, every prompt; `authoring.md`, how any
  op is written); `site/authoring.md` and `site/knowledge/` are the site's. After changing a prompt
  or `workflows.json`, run `bun run docs:prompts` and read its diff.
- `bun run ci:fast` is everything but browser e2e tests (seconds); `bun run ci:check` runs Biome,
  tsc, the bun tests and the workflow tests (`awf test core/workflows`).
- Test env: `WEBCLI_NO_WORKER=1` files requests without starting the worker; `WEBCLI_STEP_TIMEOUT_MS`
  and `WEBCLI_SIGNIN_WAIT_MS` shorten waits.
