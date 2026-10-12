import type { Ctx, ProjectItem } from "../../../sections/types";
import { detailData } from "./build.data";
import type { DetailData } from "./model";

/** detail.typographic — the classic detail data, re-shaped for a title-led page (build.data.ts). */
export function data(ctx: Ctx, project: ProjectItem): DetailData {
  return detailData(ctx, project);
}
