import { HeroCarousel } from "../components/HeroCarousel";
import type { HomeHeroData } from "./homeHeroData";

// markup only: the data function is homeHeroData.ts (1.5.2)
export function HomeHero({ data }: { data: HomeHeroData }) {
  return <HeroCarousel {...data} />;
}
