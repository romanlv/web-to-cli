// The template's domain: what it makes of a URL from SITE's settings. A site's own tests go beside it.
import { describe, expect, test } from "bun:test";
import { siteDomain } from "../site/domain";
import { isSignInUrl, onSite } from "../site/helpers";
import { SITE } from "../site/site";

describe("site", () => {
  test("a URL is on the site when its host is the origin's or an alias", () => {
    expect(onSite(new URL("/a/b?c=1", SITE.origin).toString())).toBe(true);
    expect(onSite("https://elsewhere.invalid/")).toBe(false);
    expect(onSite("about:blank")).toBe(false);
    expect(onSite("not a url")).toBe(false);
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

  test("a public site signs in without a person", () => {
    expect(siteDomain().noSignIn).toBe(!SITE.signIn.required);
  });
});
