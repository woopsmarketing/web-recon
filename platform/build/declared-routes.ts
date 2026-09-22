/**
 * Prints the declared routes of a Template manifest as JSON — executed by the builder INSIDE the
 * build workspace, under the release's own tsconfig, exactly like preflight:
 *
 *   tsx --tsconfig <ws>/templates/<id>/v<major>/tsconfig.json declared-routes.ts <ws>/templates/<id>/v<major>/template.ts
 *
 * So the routes come from the pinned RELEASE's template.ts (its @platform/* imports resolve to the
 * workspace copies), never from the repository working tree. No imports here: the file is a
 * transport, the builder validates the printed shape (platform/integration/emit DeclaredRoutesSchema).
 */
import { pathToFileURL } from "node:url";

const templateFile = process.argv[2];
if (!templateFile) throw new Error("declared-routes: template manifest path required");
const mod = (await import(pathToFileURL(templateFile).href)) as { default: { routes?: unknown } };
process.stdout.write(`${JSON.stringify(mod.default.routes ?? null)}\n`);
