import type { Ctx, ProjectItem } from "../../../sections/types";
import { detailData } from "./build.data";
import type { DetailData } from "./model";

/** detail.gallery — the classic detail data, re-shaped for a page of photographs (build.data.ts). */
export function data(ctx: Ctx, project: ProjectItem): DetailData {
  return detailData(ctx, project);
}
