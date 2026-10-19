// The template's domain: what it makes of a URL and a page from SITE's settings. Each test checks
// what holds whatever the settings say, or names the setting it needs; a site's own tests go beside it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Browser, Page } from "playwright";
import { launch } from "../core/browser";
import { RefusedError } from "../core/errors";
import { signInState, siteDomain } from "../site/domain";
import { isSignInUrl, onSite, siteHelpers } from "../site/helpers";
import { SITE } from "../site/site";

describe("site", () => {
  test("a URL is on the site when its host is the origin's or an alias", () => {
    expect(onSite(new URL("/a/b?c=1", SITE.origin).toString())).toBe(true);
    expect(onSite("https://elsewhere.invalid/")).toBe(false);
    expect(onSite("about:blank")).toBe(false);
    expect(onSite("not a url")).toBe(false);
    const host = new URL(SITE.origin).hostname;
    const twin = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    expect(onSite(`https://${twin}/`)).toBe(true);
  });

  test("the sign-in flow is told by its path, not by a word anywhere in the URL", () => {
    expect(isSignInUrl(new URL("/login", SITE.origin).toString())).toBe(true);
    expect(isSignInUrl(new URL("/users/sign_in?next=/", SITE.origin).toString())).toBe(true);
    expect(isSignInUrl(new URL("/login-tips", SITE.origin).toString())).toBe(false);
    expect(isSignInUrl(new URL("/item?next=/login", SITE.origin).toString())).toBe(false);
  });

  test("runs start from a context's own path, or the start page for a bare origin", () => {
    const appUrl = siteDomain().appUrl!;
    expect(appUrl(SITE.origin, `${SITE.origin}/team/acme`)).toBe(`${SITE.origin}/team/acme`);
    expect(appUrl(SITE.origin, SITE.origin)).toBe(new URL(SITE.startPath, SITE.origin).toString());
  });
});

describe("site pages", () => {
  let browser: Browser;
  let page: Page;
  /** The page the site serves at each path, and its status. */
  let served: Record<string, { status?: number; title?: string; body: string }> = {};
  const show = async (path: string, reply: { status?: number; title?: string; body: string }) => {
    served = { [path]: reply };
    await page.goto(new URL(path, SITE.origin).toString());
  };
  const tooMany = SITE.refusals.some((re) => re.test("Too many requests"));

  beforeAll(async () => {
    browser = await launch(false);
    page = await browser.newPage();
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      const hit = onSite(url.toString()) ? served[url.pathname] : undefined;
      if (!hit) return route.fulfill({ status: 200, contentType: "text/html", body: "<title>elsewhere</title><p>another site</p>" });
      return route.fulfill({
        status: hit.status ?? 200,
        contentType: "text/html",
        body: `<title>${hit.title ?? "page"}</title><main>${hit.body}</main>`,
      });
    });
  });
  afterAll(() => browser.close());

  test("a page leaving the site is never signed in", async () => {
    await page.goto("https://sso.elsewhere.invalid/authorize");
    expect(await signInState(page, SITE.origin)).toBe(SITE.signIn.required ? "signed-out" : "unknown");
  });

  test.if(SITE.signIn.required && isSignInUrl(new URL("/login", SITE.origin).toString()))("the sign-in flow is signed out", async () => {
    await show("/login", { body: "<p>sign in</p>" });
    expect(await signInState(page, SITE.origin)).toBe("signed-out");
  });

  test.if(SITE.signIn.required && SITE.signIn.signedOut.includes('input[type="password"]'))(
    "a page asking for a password is signed out",
    async () => {
      await show("/", { body: '<form><input type="password"></form>' });
      expect(await signInState(page, SITE.origin)).toBe("signed-out");
    },
  );

  test.if(!SITE.signIn.required || SITE.signIn.signedIn.length === 0)(
    "a loaded page of the site with no sign-in is signed in",
    async () => {
      await show("/", { body: "<p>the front page</p>" });
      expect(await signInState(page, SITE.origin)).toBe("signed-in");
    },
  );

  test.if(tooMany)("a short page saying no is a refusal; a long page that mentions one is content", async () => {
    await show("/", { body: "<h1>Too many requests</h1><p>try again later</p>" });
    expect(await siteHelpers(page).errors()).toContain("Too many requests");
    await show("/", { title: "Too many requests", body: "x".repeat(5_000) });
    expect(await siteHelpers(page).errors()).toContain("Too many requests");
    await show("/", { body: `<article><h2>Too many requests: designing a rate limiter</h2><p>${"words ".repeat(1_000)}</p></article>` });
    expect(await siteHelpers(page).errors()).toEqual([]);
  });

  test("app.open turns a 429, or a refusal page, into RefusedError", async () => {
    served = { "/busy": { status: 429, body: "<p>slow down</p>" } };
    await expect(siteHelpers(page).open("/busy")).rejects.toBeInstanceOf(RefusedError);
    if (tooMany) {
      served = { "/no": { body: "<h1>Too many requests</h1>" } };
      await expect(siteHelpers(page).open("/no")).rejects.toBeInstanceOf(RefusedError);
    }
  });
});
