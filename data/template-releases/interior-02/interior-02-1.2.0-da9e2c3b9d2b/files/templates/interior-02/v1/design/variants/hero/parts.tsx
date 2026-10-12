import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { HeroImage, HeroLink } from "./model";

/**
 * Hero variants — the two pieces the three components share (browser side: they read their props
 * and nothing else).
 *
 *   <HeroPicture>  THE photograph of a hero: the page's largest element, so it is fetched first
 *                  (eager, high priority) and carries its intrinsic size — the box is the sheet's
 *                  (object-fit: cover), the attributes only keep the layout still while it loads.
 *                  The asset resolver serves one file per image; there is no srcset to offer.
 *   <ArrowLink>    a text link to a page of this site, with the arrow of the classic icon set.
 */
export function HeroPicture({ image, className }: { image: HeroImage; className: string }) {
  return <img className={className} src={image.src} width={image.width} height={image.height} alt={image.alt} loading="eager" fetchPriority="high" decoding="async" />;
}

export function ArrowLink({ link, className }: { link: HeroLink; className: string }) {
  return (
    <Link href={link.href} className={className}>
      <span>{link.label}</span>
      <Icon name="arrow-right" size={18} />
    </Link>
  );
}
