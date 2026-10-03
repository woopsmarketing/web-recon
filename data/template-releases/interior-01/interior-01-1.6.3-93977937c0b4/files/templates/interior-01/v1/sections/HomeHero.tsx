import { HeroCarousel } from "../components/HeroCarousel";
import type { HomeHeroData } from "./homeHeroData";

export { homeHero, type HomeHeroData } from "./homeHeroData";

export function HomeHero({ data }: { data: HomeHeroData }) {
  return <HeroCarousel {...data} />;
}
