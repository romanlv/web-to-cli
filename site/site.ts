// What this CLI's site is. This is the file to edit first when adapting the template:
// `bun run configure` fills in the name and the origin, and the rest is
// what you learn by opening the site once. domain.ts and helpers/ read everything from here,
// so a site that fits these settings needs no other code before its first request.

export const SITE = {
  /** The command people type, and the name the CLI's messages use. */
  name: "site",
  /** The site's origin. Contexts may add a path to it (an account, a tenant, a workspace). */
  origin: "https://example.com",
  /** Other hosts that are the same site (a mobile host, an old domain). */
  aliases: [] as string[],
  /** Where runs start when a context's URL names no page of its own. */
  startPath: "/",

  signIn: {
    /** False for a public site: `context:login` just opens it, and every page counts as signed in. */
    required: true,
    /**
     * Shown only when signed in (an avatar, an account menu, a sign-out link). Leave it empty
     * and any loaded page that shows none of the signed-out signs below counts as signed in.
     */
    signedIn: [] as string[],
    /** Shown only when signed out (a sign-in button, a password field). */
    signedOut: ['input[type="password"]', 'a[href*="login"]', 'a[href*="signin"]'],
    /** Paths of the sign-in flow: landing on one means signed out. */
    signInPath: /^\/(login|log-in|signin|sign-in|auth|account\/login|users\/sign_in)(\/|$)/i,
  },

  /** Shown once a page has drawn its main content: `app.open` waits for it. Empty, it waits for the load. */
  ready: "" as string,
  /** Text the site shows when it turns the person away rather than the op being broken. */
  refusals: [/rate limit/i, /too many requests/i, /access denied/i, /unusual traffic/i] as RegExp[],
  /** The attribute the site marks its controls with, if any: snapshots show it, and locators prefer it. */
  testIdAttribute: "data-testid" as string | undefined,

  /** Ops only read. A site you also write to (forms, posts) sets false, and authoring.md says what may change. */
  readOnly: true,
  /** Ops may make the site's own HTTP calls without a browser (the direct-calls skill). False for a site that flags them. */
  directCalls: true,
  /** For a site that watches for automation: installed Chrome, no automation switch, one browser kept between calls. */
  careful: false,
  /** Builds at once; 1 for a site that limits each account. */
  maxRunning: 2,
} as const;
