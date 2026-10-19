// What every op.ts imports: `defineOp` typed with the site's helpers, and the errors helpers throw.
import { defineOpFor } from "../core/ops";
import type { SiteHelpers } from "./helpers";

export const defineOp = defineOpFor<SiteHelpers>();
export { default as Type } from "typebox";
export { InputError, PreconditionError, RefusedError } from "../core/errors";
