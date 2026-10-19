import { join } from "node:path";
import type { Page } from "playwright";
import { type Domain, defineDomain, type SignInState } from "../core/domain";
import { isSignInUrl, onSite, type SiteHelpers, siteHelpers } from "./helpers";
import { SITE } from "./site";

const visible = async (page: Page, selectors: readonly string[]): Promise<boolean> => {
  for (const s of selectors)
    if (
      await page
        .locator(s)
        .first()
        .isVisible()
        .catch(() => false)
    )
      return true;
  return false;
};

/**
 * One look at a page that has loaded the context's URL; core asks again while it is `unknown`.
 * Signed out lands on the sign-in flow, leaves the site (an SSO page) or shows a sign-in control;
 * signed in shows what `SITE.signIn.signedIn` names. A site that names nothing for signed in counts
 * a loaded page with no signed-out sign as signed in, which a slow sign-in redirect can fool: name
 * one as soon as you know it.
 */
export const signInState = async (page: Page, _contextUrl: string): Promise<SignInState> => {
  if (!SITE.signIn.required) return onSite(page.url()) ? "signed-in" : "unknown";
  if (isSignInUrl(page.url())) return "signed-out";
  if (SITE.signIn.signedIn.length && (await visible(page, SITE.signIn.signedIn))) return onSite(page.url()) ? "signed-in" : "elsewhere";
  if (!onSite(page.url())) return page.url() === "about:blank" ? "unknown" : "signed-out";
  if (await visible(page, SITE.signIn.signedOut)) return "signed-out";
  if (SITE.signIn.signedIn.length) return "unknown";
  const loaded = await page.evaluate(() => document.readyState === "complete").catch(() => false);
  return loaded ? "signed-in" : "unknown";
};

export const siteDomain = (overrides: Partial<Domain<SiteHelpers>> = {}): Domain<SiteHelpers> =>
  defineDomain({
    name: SITE.name,
    dir: import.meta.dir,
    // Spelled out, not the parent of `dir`: the tests' fixture puts `dir` elsewhere and keeps this checkout.
    root: join(import.meta.dir, ".."),
    helpers: (page) => siteHelpers(page),
    signInState,
    noSignIn: !SITE.signIn.required,
    readOnly: SITE.readOnly,
    directCalls: SITE.directCalls,
    maxRunning: SITE.maxRunning,
    testIdAttribute: SITE.testIdAttribute,
    // A careful site gets what X needed (x-cli's knowledge/bot-detection.md): the installed Chrome
    // without the automation switch, and one browser kept between calls instead of a fresh load each.
    ...(SITE.careful ? { browserChannel: "chrome", hideAutomation: true, keepBrowser: true } : {}),
    appUrl(_signedInUrl, contextUrl) {
      // A context URL with a path of its own (an account, a workspace) is where runs start; a bare
      // origin starts from SITE.startPath. The sign-in check is made against it.
      return new URL(contextUrl).pathname.length > 1 ? contextUrl : new URL(SITE.startPath, contextUrl).toString();
    },
    async refusal(page) {
      const messages = await siteHelpers(page).errors();
      return messages.length ? messages.join("; ") : undefined;
    },
    // Add `submitSignIn` for a site whose form can be filled (core/domain.ts), `keepAlive` for one
    // that signs out idle sessions, and `pageCommands` for moves agents explore with often.
    ...overrides,
  });
