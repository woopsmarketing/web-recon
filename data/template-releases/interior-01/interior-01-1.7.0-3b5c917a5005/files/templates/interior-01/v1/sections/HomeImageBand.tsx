import type { Ctx } from "./types";

export interface HomeImageBandData {
  image: { src: string; width: number; height: number; alt: string };
}

/** home.image-band — one full-width closing image (media slot). No media → no section. */
export function homeImageBand(ctx: Ctx): HomeImageBandData | undefined {
  const media = ctx.slots.media("home.image-band", "media");
  return media ? { image: { ...ctx.assets.resolve(media.asset), alt: media.alt } } : undefined;
}

export function HomeImageBand({ data }: { data: HomeImageBandData }) {
  return (
    <section className="i1-band" data-section="home.image-band">
      <img className="i1-band__img" src={data.image.src} width={data.image.width} height={data.image.height} alt={data.image.alt} loading="lazy" decoding="async" />
    </section>
  );
}
