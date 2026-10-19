// bun run configure [<cli>] [--url <origin>] [--public] [--careful] [--prefix <PREFIX_>] [--into <dir>]
//
// Turns the template into a CLI for one site: its command, its origin, its environment prefix,
// and docs/prompts.md filled in for it. What isn't given as a flag is asked, when there is a
// terminal to ask in.
//
// After `bun create <user>/web-to-cli <dir>`, which ends by naming this step (`bun-create.start`),
// it runs in the new folder: it converts the checkout it is in, then removes itself. Bun runs a
// template's postinstall without a terminal, so it can't ask from there. With --into it copies
// the template there first and leaves this checkout as it is. What it can't know
// (the signed-in selectors, the refusals, authoring.md's rules) is left for a person, as the steps
// it prints say.
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

const TEMPLATE = join(import.meta.dir, "..");
const TEMPLATE_PACKAGE = "web-to-cli";
const TEMPLATE_NAME = "site";
const TEMPLATE_PREFIX = "WEBCLI_";
/** What a copy leaves behind: installs, state, sign-ins, history and the template's own ops. */
const SKIP = new Set(["node_modules", ".git", ".state", ".awf", "out"]);

const USAGE = `bun run configure [<cli>] [--url <origin>] [--public] [--careful] [--prefix <PREFIX_>] [--into <dir>]

  <cli>      the command people will type: lowercase letters, digits and -, such as hn
  --url      the site's origin, such as https://news.ycombinator.com
  --public   the site needs no account: context:login just opens it
  --careful  the site watches for automation: installed Chrome, no automation switch, one browser kept
  --prefix   the environment variables' prefix (<CLI>CLI_ by default)
  --into     copy the template to this folder and configure the copy (the template stays as it is)
  --yes      take the defaults for what isn't given, and ask nothing

What isn't given is asked, when there is a terminal.`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    url: { type: "string" },
    into: { type: "string" },
    public: { type: "boolean" },
    careful: { type: "boolean" },
    prefix: { type: "string" },
    yes: { type: "boolean", short: "y", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const root = values.into ? resolve(values.into) : TEMPLATE;
const path = (rel: string) => join(root, rel);

const die = (message: string): never => {
  console.error(`configure: ${message}`);
  process.exit(2);
};

// Asking needs a terminal; `--yes` and a full set of flags need none.
const interactive = !values.yes && process.stdin.isTTY === true;

const ask = (question: string, fallback: string, valid: (v: string) => string | undefined): string => {
  for (;;) {
    const answer = (prompt(`${question} [${fallback}]`) ?? "").trim() || fallback;
    const wrong = valid(answer);
    if (!wrong) return answer;
    console.log(`  ${wrong}`);
  }
};
const askYes = (question: string, fallback: boolean): boolean =>
  /^y/i.test(ask(question, fallback ? "y" : "n", (v) => (/^(y|yes|n|no)$/i.test(v) ? undefined : "y or n")));

const checkName = (v: string) =>
  !/^[a-z][a-z0-9-]{0,30}$/.test(v)
    ? `"${v}" is not a command name: lowercase letters, digits and -, starting with a letter`
    : v === TEMPLATE_NAME
      ? `pick a name other than "${TEMPLATE_NAME}", the template's own`
      : undefined;
const checkUrl = (v: string) => {
  try {
    return /^https?:$/.test(new URL(v).protocol) ? undefined : "an http or https URL, such as https://news.ycombinator.com";
  } catch {
    return `"${v}" is not a URL: give one such as https://news.ycombinator.com`;
  }
};
const checkPrefix = (v: string) => (/^[A-Z][A-Z0-9_]*_$/.test(v) ? undefined : `"${v}" should be capitals, digits and _, ending in _`);

/**
 * A value from its flag, or asked, or its default; with nothing to go on and nobody to ask, the
 * flag it needs is named.
 */
const value = (
  flag: string,
  given: string | undefined,
  question: string,
  fallback: string | undefined,
  valid: (v: string) => string | undefined,
) => {
  if (given !== undefined) {
    const wrong = valid(given);
    return wrong ? die(wrong) : given;
  }
  if (interactive) return ask(question, fallback ?? "", valid);
  if (fallback !== undefined && values.yes) return fallback;
  return die(`give ${flag} (or run it in a terminal to be asked)\n\n${USAGE}`);
};

// What is read before any copy is made comes from the template's checkout, the one this file is in.
// A checkout that is still the template: its site names none yet.
if (!readFileSync(join(TEMPLATE, "site/site.ts"), "utf8").includes(`name: "${TEMPLATE_NAME}",`))
  die("site/site.ts already names a site: this checkout is configured");

const pkgName: string = JSON.parse(readFileSync(join(TEMPLATE, "package.json"), "utf8")).name;
// Configuring the template's own checkout in place would turn it into one site's CLI.
if (!values.into && pkgName === TEMPLATE_PACKAGE && !values.force)
  die(`this is the template itself: make a copy with \`bun create <user>/web-to-cli <dir>\` or --into <dir>, or pass --force`);

// `bun create` names the package after its folder: hn-cli suggests hn.
const suggested = (values.into ? basename(root) : pkgName === TEMPLATE_PACKAGE ? basename(root) : pkgName)
  .toLowerCase()
  .replace(/-cli$/, "")
  .replace(/[^a-z0-9-]/g, "");
if (interactive) console.log("\nConfigure the CLI for its site. Enter takes the default in brackets.\n");
const cli = value("<cli>", positionals[0], "Command name", checkName(suggested) ? undefined : suggested, checkName);
const origin = new URL(value("--url", values.url, "Site URL", undefined, checkUrl)).origin;
const isPublic = values.public ?? (interactive ? !askYes("Does reading it need a signed-in account?", true) : false);
const careful = values.careful ?? (interactive ? askYes("Does the site watch for automation (social sites, X, LinkedIn)?", false) : false);
const prefix = value("--prefix", values.prefix, "Environment variable prefix", `${cli.replace(/-/g, "_").toUpperCase()}CLI_`, checkPrefix);

if (values.into) {
  if (existsSync(root) && readdirSync(root).length > 0) die(`${root} is not empty`);
  cpSync(TEMPLATE, root, {
    recursive: true,
    filter: (src) => {
      const rel = relative(TEMPLATE, src);
      if (!rel) return true;
      const top = rel.split("/")[0]!;
      if (SKIP.has(top) || /^\.env/.test(rel.split("/").at(-1)!)) return false;
      // The template's ops folder holds nothing but .gitkeep; a configured checkout copies no ops.
      return !/^site\/ops\/.+/.test(rel) || rel.endsWith(".gitkeep");
    },
  });
}

const edit = (rel: string, change: (text: string) => string) => {
  const before = readFileSync(path(rel), "utf8");
  const after = change(before);
  if (after === before) die(`${rel}: nothing to change, so it isn't the template's any more`);
  writeFileSync(path(rel), after);
};

// The site's settings.
edit("site/site.ts", (t) => {
  let out = t
    .replace(`name: "${TEMPLATE_NAME}",`, `name: ${JSON.stringify(cli)},`)
    .replace(/origin: "[^"]*",/, `origin: ${JSON.stringify(origin)},`);
  if (isPublic) out = out.replace("required: true,", "required: false,");
  if (careful) out = out.replace("careful: false,", "careful: true,").replace("maxRunning: 2,", "maxRunning: 1,");
  return out;
});

// The command.
renameSync(path(`bin/${TEMPLATE_NAME}`), path(`bin/${cli}`));
edit("package.json", (t) => {
  const pkg = JSON.parse(t);
  pkg.name = `${cli}-cli`;
  pkg.description = `A CLI that reads ${origin} for a person in a real browser and builds its own ops through awf workflows.`;
  pkg.bin = { [cli]: `./bin/${cli}` };
  pkg.scripts["docs:prompts"] = `bun core/workflows/prompts-doc.ts ${cli} site docs/prompts.md`;
  delete pkg.scripts.configure;
  delete pkg["bun-create"];
  return `${JSON.stringify(pkg, null, 2)}\n`;
});

// The environment prefix, in code and in every text that names a variable.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|md|json)$/.test(name) ? [full] : [];
  });
if (prefix !== TEMPLATE_PREFIX) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    if (text.includes(TEMPLATE_PREFIX)) writeFileSync(file, text.replaceAll(TEMPLATE_PREFIX, prefix));
  }
}

// The README's template part becomes the CLI's own introduction.
edit("README.md", (t) =>
  t
    .replaceAll(`bin/${TEMPLATE_NAME} `, `bin/${cli} `)
    .replace(
      /<!-- template -->[\s\S]*<!-- \/template -->/,
      `# ${cli}\n\n\`${cli}\` reads ${origin} from the command line${isPublic ? "" : ", on your own signed-in account"}. It starts with no\ncommands: ask for one with \`bin/${cli} request "…"\`, and coding agents explore the site in a real browser,\nwrite the op, test it on the live site, review it on a second model, and merge it.\n\nIt was made from the web-to-cli template; \`docs/new-site.md\` has what is left to do.`,
    ),
);

const run = (cmd: string[]) => {
  const r = Bun.spawnSync(cmd, { cwd: root, stdout: "inherit", stderr: "inherit" });
  if (r.exitCode !== 0) die(`\`${cmd.join(" ")}\` failed in ${root}`);
};
// The configuring is the template's, not the CLI's. In place, this file goes too; bun has read it.
rmSync(path("scripts/configure.ts"), { force: true });
if (existsSync(path("scripts")) && readdirSync(path("scripts")).length === 0) rmSync(path("scripts"), { recursive: true });
// `bun create` has installed already; a copy hasn't.
if (values.into || !existsSync(path("node_modules"))) run(["bun", "install"]);
if (!existsSync(path(".git"))) run(["git", "init", "-q"]);
run(["bun", "run", "--silent", "docs:prompts"]);

console.log(`
${cli}: a CLI for ${origin}, in ${root}

Next, in ${relative(process.cwd(), root) || "this folder"}:
  1. Open ${origin} once and fill in site/site.ts: what shows only when signed in (signIn.signedIn),
     what a page shows once drawn (ready), the site's refusals and test-id attribute.
  2. Write site/authoring.md (what ops may and may not do, test data, limits) and
     site/knowledge/site.md (what you know of the site's pages and calls).
  3. bun run ci:check && git add -A && git commit -m "Configure ${cli} for ${origin}"
  4. bin/${cli} context:add me --url ${origin}
     bin/${cli} context:login me
     bin/${cli} page          # the page as the agents see it
  5. bin/${cli} request "<the first thing you want to read>"
     Review the op it builds line by line and name it in site/authoring.md as the reference.`);
