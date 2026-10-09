/**
 * Prints `portfolioShell` of a Template's runtime/shell.ts as JSON — executed by the builder INSIDE
 * the build workspace, like build/declared-routes.ts:
 *
 *   tsx --tsconfig <ws>/templates/<id>/v<major>/tsconfig.json shell-plan.ts <ws>/templates/<id>/v<major>/runtime/shell.ts
 *
 * So the declaration comes from the pinned RELEASE, never from the repository working tree. No
 * imports here: the file is a transport, the builder validates the printed shape
 * (contract.ts PortfolioShellDeclSchema).
 */
import { pathToFileURL } from "node:url";

const shellFile = process.argv[2];
if (!shellFile) throw new Error("shell-plan: runtime/shell.ts path required");
const mod = (await import(pathToFileURL(shellFile).href)) as { portfolioShell?: unknown };
process.stdout.write(`${JSON.stringify(mod.portfolioShell ?? null)}\n`);
