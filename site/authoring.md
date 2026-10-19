# Writing an op for this site

Every build and repair reads `core/instructions/authoring.md` first, for how any op is written, and
then this file, for what is particular to this site. Where the two differ, this file wins.

<!-- TODO(person): fill in each section below before filing the first request. The agents follow
it literally, and intake declines what "What it does" rules out. -->

## The reference op

There is none yet. The first op built through the build workflow becomes the reference once a
person has reviewed it line by line, and this section then names it. Until then, follow the two
authoring files and `knowledge/site.md`; the first build should be a plain read (a list, a search,
a record's page) so it sets the shape every later op copies.

## What the CLI does

It gets information out of the site for the person whose context it runs in. **It only reads.** No
op, and nothing an agent does while exploring, submits a form, posts, buys, deletes or changes a
setting. A request for an op that writes is declined at intake.

<!-- A site you also write to: say exactly what may change, and how test data is marked (below). -->

Ops are named `noun:verb` for what they read: `items:list`, `item:get`, `items:search`.

## The site's rules for ops

- **The helpers** (`app`) are `open(path)`, `list(selector, read, { limit })`, `json(match, act)`,
  `scroll()`, `text(selector)` and `errors()` (`helpers/index.ts`). A move two ops write out is a
  helper.
- **Outputs share shapes.** When two ops return the same kind of record, its type goes in one place
  (`site/model.ts`, created by the first op that needs it) and both use it.
- **Bound every read**: a `limit` with a default; a list that scrolls stops after ten scrolls with
  `more`.
- **Target** the site's test ids (`SITE.testIdAttribute`) first, then role and name, then text.
  Never generated class names.
- **Errors**: `InputError` for a value the site doesn't offer, `PreconditionError` for a record that
  isn't there, `RefusedError` for a rate limit or a block. `app.open()` already turns the site's
  refusals (`SITE.refusals`) into `RefusedError`.
- **Find with the site's own search** when it has one.
- **Direct calls**: <!-- say whether ops may make the site's own HTTP calls without a browser
  (`SITE.directCalls`), and if not, why: a site that signs its calls or fingerprints clients. -->

## Pace and limits

- One page at a time per context, at a person's pace; `app.scroll()` pauses already.
- A rate limit is `RefusedError`. Never retry in a loop.
- A captcha, a challenge or the sign-in page mid-run is the person's to clear: stop.

## Test data

The CLI only reads, so there is no test data to create: examples read records that are stable
(old, public, unlikely to be deleted), or the signed-in account's own pages.
