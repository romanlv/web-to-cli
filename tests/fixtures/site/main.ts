// The real CLI with the test ops folder in place of site/ops. It is never a build's worktree, even
// when the checks run inside one.
import { main } from "../../../core/cli";
import { siteDomain } from "../../../site/domain";

await main(siteDomain({ dir: import.meta.dir, worktree: false }));
