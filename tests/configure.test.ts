// The template's configure step, run --into a scratch folder: never on this checkout. configure
// removes this file from what it makes, with itself.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, tempHome } from "./helpers";

const CONFIGURE = join(ROOT, "scripts", "configure.ts");

/** A git identity of its own, so the commit configure makes doesn't depend on the machine's. */
const GIT_ID = {
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.invalid",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.invalid",
};

const configure = (args: string[], cwd = ROOT) => {
  const r = Bun.spawnSync(["bun", join(cwd, "scripts", "configure.ts"), ...args], {
    cwd,
    env: { ...process.env, ...GIT_ID },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() };
};

const textFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".git") return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? textFiles(full) : /\.(ts|md|json)$/.test(name) ? [full] : [];
  });

describe.skipIf(!existsSync(CONFIGURE))("configure", () => {
  const { home, cleanup } = tempHome();
  const out = join(home, "hn-cli");
  const read = (rel: string) => readFileSync(join(out, rel), "utf8");
  let made: { code: number; out: string };

  beforeAll(() => {
    made = configure(["hn", "--url", "https://news.ycombinator.com/news", "--public", "--yes", "--into", out]);
  });
  afterAll(cleanup);

  test("it makes a CLI for the site, named for it", () => {
    expect(made.out).toContain("hn: a CLI for https://news.ycombinator.com");
    expect(made.code).toBe(0);
    expect(existsSync(join(out, "bin", "hn"))).toBe(true);
    expect(existsSync(join(out, "bin", "site"))).toBe(false);
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.name).toBe("hn-cli");
    expect(pkg.bin).toEqual({ hn: "./bin/hn" });
    expect(pkg.scripts.configure).toBeUndefined();
    expect(pkg["bun-create"]).toBeUndefined();
    const site = read("site/site.ts");
    expect(site).toContain('name: "hn",');
    expect(site).toContain('origin: "https://news.ycombinator.com",');
    expect(site).toContain("required: false,");
  });

  test("nothing of the template's is left: its prefix, its configuring, its sign-ins and state", () => {
    for (const file of textFiles(out))
      expect({ file, prefix: readFileSync(file, "utf8").includes("WEBCLI_") }).toEqual({ file, prefix: false });
    expect(existsSync(join(out, "scripts"))).toBe(false);
    expect(existsSync(join(out, "tests", "configure.test.ts"))).toBe(false);
    expect(existsSync(join(out, ".state"))).toBe(false);
    expect(existsSync(join(out, ".git"))).toBe(true);
    for (const doc of ["README.md", "AGENTS.md", "docs/new-site.md"]) {
      expect(read(doc)).not.toContain("<!-- template");
      expect(read(doc)).not.toContain("bin/site");
      expect(read(doc)).not.toContain("bun run configure <cli>");
    }
    expect(read("README.md")).toStartWith("# hn\n");
    expect(read("AGENTS.md")).toStartWith("# hn\n");
    // Prose that names the template's prefix would now name the CLI's, and be wrong.
    expect(read("DESIGN.md")).not.toContain("HNCLI_` environment prefix");
    expect(read("docs/prompts.md")).toContain("ops for `hn`");
  });

  test("it is committed on main, where builds branch from", () => {
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", ...args], { cwd: out })
        .stdout.toString()
        .trim();
    expect(git("branch", "--show-current")).toBe("main");
    expect(git("log", "--format=%s")).toBe("Configure hn for https://news.ycombinator.com");
    expect(git("status", "--short")).toBe("");
  });

  test("the CLI it makes passes its own checks and runs", () => {
    for (const script of ["lint", "type-check"]) {
      const r = Bun.spawnSync(["bun", "run", script], { cwd: out, stdout: "pipe", stderr: "pipe" });
      expect({ script, code: r.exitCode, out: r.stdout.toString() + r.stderr.toString() }).toMatchObject({ script, code: 0 });
    }
    const help = Bun.spawnSync([join(out, "bin", "hn"), "help"], { env: { ...process.env, HNCLI_HOME: join(home, "state") } });
    expect(help.exitCode).toBe(0);
    expect(help.stdout.toString()).toContain("hn");
  });

  test("a wrong answer is refused before anything is copied", () => {
    const into = join(home, "bad");
    expect(configure(["Not A Name", "--url", "https://example.org", "--yes", "--into", into]).code).toBe(2);
    expect(configure(["ok", "--url", "ftp://example.org", "--yes", "--into", into]).code).toBe(2);
    expect(existsSync(into)).toBe(false);
    expect(configure(["ok", "--url", "https://example.org", "--yes", "--into", join(ROOT, "tests", "inside")]).code).toBe(2);
    expect(existsSync(join(ROOT, "tests", "inside"))).toBe(false);
  });
});

describe.skipIf(!existsSync(CONFIGURE))("configure in place", () => {
  const { home, cleanup } = tempHome();
  // What `bun create` leaves: the template under the folder's name, committed, installed; here on
  // master, as a plain `git init` may name it.
  const copy = join(home, "x-cli");
  const read = (rel: string) => readFileSync(join(copy, rel), "utf8");
  const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: copy, env: { ...process.env, ...GIT_ID } });
  let made: { code: number; out: string };

  beforeAll(() => {
    cpSync(ROOT, copy, {
      recursive: true,
      filter: (src) => !/\/(node_modules|\.git|\.state|\.awf|out|\.claude\/worktrees|\.env[^/]*)$/.test(src),
    });
    const pkg = JSON.parse(read("package.json"));
    pkg.name = "x-cli";
    delete pkg["bun-create"];
    writeFileSync(join(copy, "package.json"), JSON.stringify(pkg, null, 2));
    symlinkSync(join(ROOT, "node_modules"), join(copy, "node_modules"));
    git("init", "-q", "-b", "master");
    git("add", "-A");
    git("commit", "-q", "-m", "Initial commit (via bun create)");
    made = configure(["--url", "news.ycombinator.com", "--careful", "--prefix", "FOO_", "--yes"], copy);
  });
  afterAll(cleanup);

  test("it converts the checkout it is in, named after the package, and removes itself", () => {
    expect(made.out).toContain("x: a CLI for https://news.ycombinator.com");
    expect(made.code).toBe(0);
    const site = read("site/site.ts");
    expect(site).toContain('name: "x",');
    expect(site).toContain("careful: true,");
    expect(site).toContain("maxRunning: 1,");
    expect(site).toContain("required: true,");
    expect(read("core/env.ts")).toContain('ENV_PREFIX = "FOO_"');
    expect(existsSync(join(copy, "scripts"))).toBe(false);
    expect(existsSync(join(copy, "tests", "configure.test.ts"))).toBe(false);
  });

  test("its change is one commit on main, after bun's", () => {
    expect(git("branch", "--show-current").stdout.toString().trim()).toBe("main");
    expect(git("log", "--format=%s").stdout.toString().trim().split("\n")).toEqual([
      "Configure x for https://news.ycombinator.com",
      "Initial commit (via bun create)",
    ]);
    expect(git("status", "--short").stdout.toString()).toBe("");
  });
});
