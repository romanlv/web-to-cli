// Playwright moves every page of the site shares. Ops call these as `app`; an op that needs a move
// that isn't here yet adds it here once it holds for every page, not in its own op.ts.
//
// These start generic: open a page, read a list, hear a call the page makes. The first builds make
// them the site's own (its search, its pagination, its error banners), and knowledge/site.md says
// which selectors have been confirmed.
import type { Page, Response } from "playwright";
import { RefusedError } from "../../core/errors";
import { SITE } from "../site";

export const ORIGIN = SITE.origin;

const HOSTS = new Set([new URL(SITE.origin).hostname, ...SITE.aliases]);

/** Is this URL on the site, its own host or one of its aliases? */
export const onSite = (url: string): boolean => {
  try {
    return HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Is this the site's sign-in flow? Its path, not the whole URL: a page may be called `login-tips`. */
export const isSignInUrl = (url: string): boolean => {
  try {
    return SITE.signIn.signInPath.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

/** A pause a person might take, 1 to 3 s, between scrolls and pages; a site may watch for machine-regular timing. */
export const pause = (page: Page) => page.waitForTimeout(1_000 + Math.random() * 2_000);

/** Stop a read after this many scrolls, and say there is `more`. */
const MAX_SCROLLS = 10;

/** What a list read gives: its items, and whether the site had more than were read. */
export interface Listed<T> {
  items: T[];
  more: boolean;
}

export const siteHelpers = (page: Page) => {
  const helpers = {
    /** Open a path (or a URL on the site) and wait for its content; the site turning the person away is `RefusedError`. */
    async open(path: string): Promise<void> {
      const target = new URL(path, ORIGIN).toString();
      const response = await page.goto(target, { waitUntil: "domcontentloaded" });
      if (response?.status() === 429) throw new RefusedError(`${SITE.name} said too many requests (429)`);
      if (SITE.ready) await page.locator(SITE.ready).first().waitFor({ state: "visible", timeout: 30_000 });
      else await page.waitForLoadState("load").catch(() => {});
      const refused = await helpers.errors();
      if (refused.length) throw new RefusedError(refused.join("; "));
    },

    /**
     * The JSON of the first response whose URL matches, made while `act` runs (open a page, click a
     * tab). The page's own calls carry more than it shows: ids, exact counts, full text. Find them
     * with `page:requests` while exploring.
     */
    async json<T = unknown>(match: string | RegExp, act: () => Promise<unknown>, timeout = 30_000): Promise<T> {
      const test = (r: Response) => (typeof match === "string" ? r.url().includes(match) : match.test(r.url()));
      const [response] = await Promise.all([page.waitForResponse(test, { timeout }), act()]);
      if (response.status() === 429) throw new RefusedError(`${SITE.name} said too many requests (429)`);
      return (await response.json()) as T;
    },

    /**
     * Read the elements matching `selector` with `read` (which runs in the browser, so it uses
     * nothing from outside itself), scrolling at a person's pace for more until `limit`. `key`
     * tells items apart, so one seen again after a scroll counts once.
     */
    async list<T>(
      selector: string,
      read: (el: Element) => T | undefined,
      { limit = 20, scroll = true, key = (t: T) => JSON.stringify(t) }: { limit?: number; scroll?: boolean; key?: (t: T) => string } = {},
    ): Promise<Listed<T>> {
      const seen = new Map<string, T>();
      for (let scrolls = 0; ; scrolls++) {
        // One evaluate per element, so `read` goes to the page as Playwright sends any page function,
        // which a site's content security policy can't block (a `new Function` in the page it could).
        const handles = await page.locator(selector).elementHandles();
        const batch: (T | undefined)[] = [];
        for (const h of handles) {
          batch.push((await h.evaluate(read).catch(() => undefined)) as T | undefined);
          await h.dispose();
        }
        const before = seen.size;
        for (const item of batch) if (item !== undefined && !seen.has(key(item))) seen.set(key(item), item);
        if (seen.size >= limit) return { items: [...seen.values()].slice(0, limit), more: true };
        if (!scroll || scrolls >= MAX_SCROLLS) return { items: [...seen.values()], more: scroll && seen.size > before };
        const end = await helpers.scroll();
        if (end && seen.size === before) return { items: [...seen.values()], more: false };
      }
    },

    /** A person's scroll down the page, then a pause. True when the page ends inside the viewport now. */
    async scroll(): Promise<boolean> {
      await page.mouse.wheel(0, 1500);
      await pause(page);
      return page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 200);
    },

    /** The trimmed text of the first element matching `selector`, or undefined when there is none. */
    async text(selector: string): Promise<string | undefined> {
      const el = page.locator(selector).first();
      if ((await el.count()) === 0) return undefined;
      return (await el.innerText()).trim();
    },

    /** Messages on the page that mean the site turned the person away (a rate limit, a block), not that the op is broken. */
    async errors(): Promise<string[]> {
      const body = await page
        .locator("body")
        .innerText({ timeout: 2_000 })
        .catch(() => "");
      return SITE.refusals.flatMap((re) => {
        const m = body.match(re);
        if (!m) return [];
        // The line the match is on, which says more than the match alone.
        const line = body.split("\n").find((l) => re.test(l)) ?? m[0];
        return [line.trim().slice(0, 200)];
      });
    },
  };
  return helpers;
};

export type SiteHelpers = ReturnType<typeof siteHelpers>;
