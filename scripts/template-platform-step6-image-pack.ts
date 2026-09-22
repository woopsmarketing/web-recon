/**
 * Step 6 (Demo Customer Content Proof) — AI image prompt pack, from ONE shot definition.
 *
 *   tsx scripts/template-platform-step6-image-pack.ts
 *
 * Writes (deterministic, no clock):
 *   docs/result/recon-template-platform-step6-demo/image-generation/01-shot-list.md
 *   docs/result/recon-template-platform-step6-demo/image-generation/02-prompts.md
 *   docs/result/recon-template-platform-step6-demo/image-generation/03-generation-manifest.json
 *   references/boost-interior/generated-approved/manifest.json   (expected files; nothing is generated here)
 *
 * This script generates NO image. `template-platform-step6-assets.ts` reads the manifest and
 * turns approved files (when they exist) or illustrated stand-ins (when they do not) into the
 * boost-interior-demo site assets.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const DOCS = path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/image-generation");
const APPROVED = path.join(repoRoot, "references/boost-interior/generated-approved");
const REF_DIR = "references/boost-interior/project-01-white-34p";

// ------------------------------------------------------------------ seats --
/** Where an image is shown → the aspect the Template crops to and the size the site asset is stored at. */
export const SEATS = {
  gallery: { aspect: "4:3", width: 1600, height: 1200, note: "cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable" },
  hero: { aspect: "16:9", width: 2400, height: 1350, note: "homepage hero slide — copy sits bottom-left over a scrim: keep the lower-left third calm; phones crop the slide to a narrow central column, so the main subject stays centred" },
  intro: { aspect: "17:20", width: 1360, height: 1600, note: "homepage intro, portrait" },
  reviews: { aspect: "10:3", width: 2000, height: 600, note: "reviews banner — generate 21:9 and centre-crop" },
  band: { aspect: "48:19", width: 2400, height: 950, note: "closing image band — generate 21:9 and centre-crop" },
  plist: { aspect: "16:5", width: 2400, height: 750, note: "portfolio title banner — the title sits on it: keep the centre low-contrast; generate 21:9 and centre-crop" },
} as const;
export type Seat = keyof typeof SEATS;

/** Stand-in illustration scene (used only while no approved image exists). */
export type Scene = "living" | "kitchen" | "entrance" | "hallway" | "bedroom" | "bathroom" | "dining" | "storage";

// ------------------------------------------------------------- style blocks --
const PHOTO_STYLE =
  "Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.";

const NEGATIVE =
  "text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour";

interface Home {
  projectId: string;
  title: string;
  /** The per-home bible: pasted into EVERY prompt of the project so each shot is the same home. */
  home: string;
  /** The same home BEFORE the work — replaces `home` in "before" shots, so a prompt never describes both states at once. */
  homeBefore?: string;
  /** Stand-in palette. */
  palette: { wall: string; floor: string; wood: string; soft: string; dark?: boolean };
}

const HOMES: Record<string, Home> = {
  bi01: {
    projectId: "bi-01",
    title: "수성 화이트 34평 아파트 리모델링 (Flagship)",
    home:
      "SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.",
    palette: { wall: "#f1f0ed", floor: "#dedad3", wood: "#c4935a", soft: "#d9d0c2" },
  },
  bi02: {
    projectId: "bi-02",
    title: "신혼부부를 위한 24평 화이트 내추럴 리모델링",
    home:
      "SAME HOME IN EVERY SHOT — a compact 24-pyeong-class Korean apartment for a newly married couple, white + natural. FLOOR: light natural oak wide-plank flooring, matte, planks running toward the living-room window. WALLS: warm white matte, flat white skirting. CEILING: flat white, small round recessed downlights, no tray ceiling. JOINERY: matte white flat cabinets combined with light natural oak open shelves and oak worktop edges; small round oak knobs. DOORS: white flush doors with matte black lever handles. CURTAINS: natural linen-coloured sheer. FURNITURE: light oak round dining table for two to four, one small oatmeal fabric sofa. Warm 3500K lighting, soft daylight.",
    palette: { wall: "#f4f1ea", floor: "#d8c3a0", wood: "#c9a474", soft: "#e2d8c6" },
  },
  bi03: {
    projectId: "bi-03",
    title: "42평 가족형 아파트 수납 중심 리모델링",
    home:
      "SAME HOME IN EVERY SHOT — a 42-pyeong-class Korean family apartment planned around storage, white + greige modern. FLOOR: light greige wide-plank wood-look flooring, matte. WALLS: matte white; selected walls are full-height built-in storage. BUILT-INS: floor-to-ceiling matte greige flat-panel handleless cabinets with thin shadow gaps and a recessed white open display section with warm LED; the same cabinet language in living room, entrance, pantry and dressing room. CEILING: flat white, slim linear recessed lights plus small round downlights. DOORS: white flush doors, satin-nickel levers. FURNITURE: one large light-grey fabric sofa, a six-seat light wood dining table. Neutral 4000K lighting.",
    palette: { wall: "#f0eeea", floor: "#cfc6b8", wood: "#b9ad9c", soft: "#c9c2b6" },
  },
  bi04: {
    projectId: "bi-04",
    title: "32평 주방·욕실 중심 리뉴얼",
    home:
      "SAME HOME IN EVERY SHOT — a 32-pyeong-class Korean apartment where only the kitchen and the two bathrooms were renewed. KITCHEN: L-shaped layout, matte white flat lower and upper cabinets with slim integrated grips, white square-tile backsplash with light-grey grout, white engineered-stone worktop, stainless undermount sink, matte-nickel faucet, slim stainless chimney hood; existing light wood-look floor kept. BATHROOMS: large-format light warm-grey matte porcelain wall tiles (600 x 1200) with a darker grey matte floor, white wall-hung basin on a slim white vanity, mirrored sliding cabinet, chrome fixtures, glass shower partition in the main bathroom and a white bathtub in the second bathroom, flat white ceiling with two round recessed lights. Neutral 4000K lighting.",
    homeBefore:
      "SAME HOME, BEFORE THE RENEWAL — the same 32-pyeong-class Korean apartment, same room sizes, same window and door positions, same light wood-look floor, photographed as a plain pre-construction record before any work. Every finish in view is the original, dated one. KITCHEN BEFORE: the same L-shaped layout with dated early-2000s finishes. BATHROOM BEFORE: the same fixture positions with dated finishes. Flat, ordinary ceiling light; clean and empty, not dirty, not staged.",
    palette: { wall: "#f2f1ee", floor: "#d4c7b2", wood: "#cdbfa8", soft: "#d8d6d1" },
  },
  bi05: {
    projectId: "bi-05",
    title: "29평 밝은 내추럴 아파트 리모델링",
    home:
      "SAME HOME IN EVERY SHOT — a bright 29-pyeong-class Korean apartment, natural and airy. FLOOR: pale natural oak herringbone-free straight plank flooring, matte. WALLS: soft warm white. CEILING: flat white with a slim recessed curtain box and small round downlights. JOINERY: white flat cabinets with pale oak open shelving and a pale oak window bench in the extended balcony area. DOORS: white flush doors with slim oak-coloured pull handles. CURTAINS: white sheer across the full window wall. FURNITURE: pale oak dining table, beige fabric sofa, woven pendant over the table. Warm 3500K lighting with strong soft daylight.",
    palette: { wall: "#f5f2ec", floor: "#dcc9a8", wood: "#d2b385", soft: "#e6dccb" },
  },
  bi06: {
    projectId: "bi-06",
    title: "34평 현관·거실 중심 리모델링",
    home:
      "SAME HOME IN EVERY SHOT — a 34-pyeong-class Korean apartment where the entrance and the living room were remodelled. ENTRANCE: a single wide sliding middle door with a slim white aluminium frame and one large clear glass pane, light-grey terrazzo-look porcelain entrance floor, full-height matte white shoe cabinets with a floating lower section and warm LED under-glow, a slim oak bench. LIVING ROOM: matte white walls, one feature wall of fine vertical white tambour panels behind the TV position, rectangular tray ceiling with warm cove light, light ivory stone-look floor in large square modules, ivory fabric sofa, white sheer curtains. Hallway keeps the same floor and white flush doors with satin-nickel levers. Neutral light with warm cove accents.",
    palette: { wall: "#f1f0ee", floor: "#e0ddd6", wood: "#c8a06c", soft: "#dcd6cc" },
  },
  bi07: {
    projectId: "bi-07",
    title: "19평 소형 아파트 화이트 미니멀 리모델링",
    home:
      "SAME HOME IN EVERY SHOT — a small 19-pyeong-class Korean apartment, white minimal, planned to look wider. FLOOR: very light ash-grey wood-look plank flooring, matte. WALLS: matte white. JOINERY: full-height matte white handleless built-in wardrobes and a compact single-line white kitchen with a white worktop, white upper cabinets to the ceiling and a concealed hood. CEILING: flat white, small round downlights, no pendant. DOORS: white flush doors, slim white frames. FURNITURE: a two-seat light-grey sofa, a small white round table with two chairs, a low bed with white bedding. Neutral-cool 4500K lighting, bright daylight through white roller blinds. Realistic small-room proportions.",
    palette: { wall: "#f3f3f1", floor: "#d9d8d2", wood: "#d3d0c8", soft: "#dfe0dd" },
  },
  bi08: {
    projectId: "bi-08",
    title: "51평 신축 아파트 입주 전 홈스타일링",
    home:
      "SAME HOME IN EVERY SHOT — a newly built 51-pyeong-class Korean apartment styled before move-in, calm modern greige. FLOOR: builder-grade light beige polished porcelain tiles in the living areas, wood-look flooring in the bedrooms (kept as built). WALLS: warm greige matte paint with one large-format beige stone-look porcelain feature wall in the living room. CEILING: rectangular tray ceiling with warm cove lighting and slim magnetic track lights. JOINERY: walnut-toned low media console, greige full-height cabinets. CURTAINS: double layer of white sheer and taupe drapes. FURNITURE: a modular greige sofa, a rectangular stone-top dining table for six, upholstered bed with a greige headboard wall. Warm 3000-3500K lighting. Large but realistic Korean apartment rooms, not a penthouse.",
    palette: { wall: "#e9e4dc", floor: "#d9d0c2", wood: "#8f6d4e", soft: "#c7bcad" },
  },
};

// ------------------------------------------------------------------ shots --
export interface Shot {
  /** asset id == filename stem */
  id: string;
  home: keyof typeof HOMES;
  room: string;
  scene: Scene;
  seat: Seat;
  purpose: string;
  referenceFiles: string[];
  continuityRules: string[];
  composition: string;
  /** a "before" photo: the same view before the work (dated finishes) */
  before?: boolean;
  /** the approved AFTER image this shot must be derived from (same camera) */
  pairedWith?: string;
}

const K = (...ids: string[]) => ids; // Visual Bible MUST-KEEP ids
const S = (s: Omit<Shot, "referenceFiles" | "continuityRules"> & { refs?: string[]; keep?: string[] }): Shot => ({
  id: s.id,
  home: s.home,
  room: s.room,
  scene: s.scene,
  seat: s.seat,
  purpose: s.purpose,
  referenceFiles: (s.refs ?? []).map((f) => `${REF_DIR}/${f}`),
  continuityRules: s.keep ?? [],
  composition: s.composition,
  ...(s.before ? { before: true } : {}),
  ...(s.pairedWith ? { pairedWith: s.pairedWith } : {}),
});

export const SHOTS: Shot[] = [
  // ---- site-level seats (all photographed in the flagship home) ----
  S({ id: "site-hero-01", home: "bi01", room: "거실", scene: "living", seat: "hero", purpose: "홈 Hero 1 — 브랜드 첫인상: 밝은 화이트 거실 전경", refs: ["living-01.png", "living-02.png"], keep: K("K1", "K2", "K4", "K5", "K6", "K14", "K15", "K19"), composition: "Wide view of the living room from the corner opposite the sofa: sofa wall on the right, full-width sheer-curtained window at the back, tray ceiling with warm cove glowing, the oak-niche built-in cabinet visible at the far left edge. Keep the lower-left third of the frame calm (open floor) for overlaid copy." }),
  S({ id: "site-hero-02", home: "bi01", room: "복도 수납", scene: "storage", seat: "hero", purpose: "홈 Hero 2 — 수납 메시지: 오크 니치 붙박이장", refs: ["living-01.png", "kitchen-02.png", "entrance-01.png"], keep: K("K1", "K3", "K6", "K7", "K19"), composition: "Three-quarter view of the floor-to-ceiling white built-in cabinet with the warm oak niche lit by its LED strip, standing in the entry hall at the inner end of the sofa wall; the cabinet and its niche are centred in the frame, the living room and sheer window open at the right, a sliver of the three-panel middle door at the left. Lower-left third calm." }),
  S({ id: "site-hero-03", home: "bi01", room: "주방", scene: "kitchen", seat: "hero", purpose: "홈 Hero 3 — 상담 유도: 화이트 주방 축", refs: ["kitchen-01.png", "living-03.png"], keep: K("K1", "K10", "K11", "K12", "K13", "K19"), composition: "One-point perspective down the kitchen axis from the living-room side: counter with fluted wall and box hood on the right, tall cabinets with greige refrigerator and oak oven niche on the left, window with white honeycomb blind at the end, white dome pendant over an empty dining spot in the left foreground. Lower-left third calm." }),
  S({ id: "site-intro", home: "bi01", room: "현관 → 거실", scene: "entrance", seat: "intro", purpose: "홈 Intro — 설계 철학: 현관에서 거실로 이어지는 동선", refs: ["entrance-03.png", "entrance-01.png"], keep: K("K6", "K7", "K9", "K14", "K19"), composition: "Portrait. From inside the entrance looking through the half-open three-panel sliding door toward the living room: the ivory sofa and the glowing oak niche are visible through the clear glass; warm-grey porcelain entrance floor and dark brown marble threshold in the foreground." }),
  S({ id: "site-reviews", home: "bi01", room: "거실 디테일", scene: "living", seat: "reviews", purpose: "홈 Reviews 배너 — 생활감 있는 디테일", refs: ["living-01.png"], keep: K("K2", "K5", "K14", "K15"), composition: "Panoramic detail: the ivory sofa against the white wall with the round halo wall light above it and the edge of the sheer curtain at the right; soft daylight, shallow and calm. Horizontal band composition, subject along the vertical centre." }),
  S({ id: "site-band", home: "bi01", room: "거실 저녁", scene: "living", seat: "band", purpose: "홈 Closing band — 저녁의 간접조명", refs: ["living-02.png", "living-03.png"], keep: K("K1", "K4", "K5", "K10", "K14"), composition: "Panoramic evening view across the living room toward the kitchen: main panel light off, warm cove light and the oak niche LED on, kitchen downlights glowing in the distance, sheer curtain dim blue dusk. Horizontal band composition." }),
  S({ id: "site-portfolio-hero", home: "bi01", room: "주방 벽 디테일", scene: "kitchen", seat: "plist", purpose: "포트폴리오 타이틀 배너 — 저대비 텍스처", refs: ["kitchen-03.png"], keep: K("K11", "K12"), composition: "Panoramic low-contrast detail of the fine vertical fluted white kitchen wall with the edge of the thin white worktop and the satin-nickel faucet far at the right third; the centre stays plain for an overlaid title." }),

  // ---- bi01 flagship (13) ----
  S({ id: "bi01-living-01", home: "bi01", room: "거실", scene: "living", seat: "gallery", purpose: "Flagship cover + 거실 정면", refs: ["living-01.png"], keep: K("K1", "K2", "K4", "K5", "K6", "K14", "K15", "K16", "K18", "K19"), composition: "Living room seen from the kitchen side: ivory sofa centred on the right-hand white wall (wall pad and switches above its left end, round halo wall light), full-width sheer window at the back with greige drapes, tray ceiling with warm cove and central LED panel. At the left, in the entry hall beyond the inner end of the sofa wall, the oak-niche built-in cabinet faces the camera — place it clearly INSIDE the central square together with the sofa, not at the frame edge." }),
  S({ id: "bi01-living-02", home: "bi01", room: "거실", scene: "living", seat: "gallery", purpose: "거실 → 주방 방향: 공간 관계 증명 컷", refs: ["living-02.png", "living-03.png"], keep: K("K1", "K4", "K8", "K9", "K10", "K14", "K18"), composition: "From the window side looking back into the home, following the fixed PLAN order: the white end panel of the kitchen counter with the kitchen axis behind it left of centre, then one white flush bedroom door at the centre, then the three-panel glass sliding middle door right of centre where the entry hall meets the sofa wall; the sofa runs along the right wall toward the camera. All three landmarks (counter end panel, bedroom door, middle door) sit inside the central square; only floor, ceiling and the near end of the sofa may reach the outer edges. Same tray ceiling overhead." }),
  S({ id: "bi01-living-03", home: "bi01", room: "거실", scene: "hallway", seat: "gallery", purpose: "거실 ↔ 복도 ↔ 식탁 자리", refs: ["living-04.png"], keep: K("K1", "K2", "K3", "K8", "K16"), composition: "Quiet view from the living room toward the short hallway that leads to the bedrooms: plain white wall at left with one white socket plate, hallway opening in the centre with a white flush door at its end, white dome pendant over the dining spot at the right, corner of the white kitchen end panel at the right edge. No artwork on the walls." }),
  S({ id: "bi01-kitchen-01", home: "bi01", room: "주방", scene: "kitchen", seat: "gallery", purpose: "주방 축 정면", refs: ["kitchen-01.png"], keep: K("K1", "K10", "K11", "K12", "K13", "K18"), composition: "One-point perspective down the galley kitchen: tall white cabinets with greige glass refrigerator and oak-framed oven niche on the left, single-line counter with fluted wall, box hood and nickel faucet on the right, window with white honeycomb blind at the end, row of round downlights on the ceiling, white dome pendant at the left foreground." }),
  S({ id: "bi01-kitchen-02", home: "bi01", room: "주방", scene: "kitchen", seat: "gallery", purpose: "싱크 라인 사선 + 뒤쪽 오크 니치 (연속성 단서)", refs: ["kitchen-02.png"], keep: K("K6", "K7", "K10", "K11", "K12"), composition: "Three-quarter view of the counter from the tall-cabinet side, turned slightly toward the living room: fluted white wall with NO upper cabinets, box stainless hood left of centre, faucet and undermount sink at the centre, lower cabinets with channel grips and beige dishwasher panel. Just right of centre, straight across the living room beyond the living-room end of the counter, the white built-in cabinet with its lit oak niche is clearly visible in the entry hall — inside the central square, large enough to read as the same cabinet as in the living-room shots." }),
  S({ id: "bi01-kitchen-03", home: "bi01", room: "주방", scene: "kitchen", seat: "gallery", purpose: "키큰장 디테일: 오크 프레임 오븐 니치", refs: ["kitchen-04.png"], keep: K("K7", "K13"), composition: "Closer three-quarter view of the tall cabinet wall: oak-framed niche with an unbranded built-in oven, matte white tall doors, built-in refrigerator with greige glass panels, the window with white honeycomb blind at the right. No logos or stickers on the appliances." }),
  S({ id: "bi01-entrance-01", home: "bi01", room: "현관", scene: "entrance", seat: "gallery", purpose: "현관 안쪽에서 본 3연동 중문 정면", refs: ["entrance-02.png"], keep: K("K9", "K18"), composition: "Centred view from the front door toward the closed three-panel sliding door: warm-grey porcelain entrance floor, dark brown marble threshold with white veining, glossy ivory full-height shoe cabinet on the left wall, full-height mirror on the right wall, one round recessed light. The living room is softly visible through the clear glass. Empty floor, no shoes. Keep the door inside the central square of the frame." }),
  S({ id: "bi01-entrance-02", home: "bi01", room: "현관", scene: "storage", seat: "gallery", purpose: "실내 쪽 중문 + 오크 니치 붙박이장", refs: ["entrance-01.png"], keep: K("K1", "K6", "K7", "K9"), composition: "From inside the home: the three-panel sliding door at the left in slight perspective, and next to it the floor-to-ceiling white built-in cabinet with the lit oak niche; ivory stone-look floor. Nothing stored in the entrance behind the glass." }),
  S({ id: "bi01-hallway-01", home: "bi01", room: "복도 수납", scene: "hallway", seat: "gallery", purpose: "방으로 가는 복도 + 풀하이트 수납", refs: ["living-04.png", "living-01.png"], keep: K("K1", "K3", "K6", "K8"), composition: "Short hallway toward the bedrooms: one side is a run of floor-to-ceiling matte white handleless storage doors, the other a plain white wall; two white flush doors with satin-nickel levers at the end; three round downlights in a row." }),
  S({ id: "bi01-bedroom-01", home: "bi01", room: "안방", scene: "bedroom", seat: "gallery", purpose: "안방", refs: ["bedroom-01.png"], keep: K("K1", "K2", "K3", "K15", "K16"), composition: "Master bedroom: low platform bed with plain white bedding against the right wall, greige pleated blackout drape covering the window at the back, single flush square LED ceiling light, empty white wall at the left. No television, no artwork." }),
  S({ id: "bi01-bedroom-02", home: "bi01", room: "작은방", scene: "bedroom", seat: "gallery", purpose: "작은방 (본 바닥으로 통일)", refs: ["bedroom-02.png"], keep: K("K1", "K2", "K8", "K16"), composition: "Small bedroom seen through its open white flush door (satin-nickel lever in the right foreground): ivory-beige combi blind on the window at the back, a plain white desk with one chair, the SAME ivory stone-look floor as the rest of the home. No appliances." }),
  S({ id: "bi01-bathroom-01", home: "bi01", room: "욕실", scene: "bathroom", seat: "gallery", purpose: "욕실 전경", refs: ["bathroom-01.png"], keep: K("K17", "K18"), composition: "Bathroom seen diagonally from just inside the door toward the basin corner (not a straight-on doorway view): warm beige matte 300 x 600 porcelain wall tiles stacked horizontally, mid-grey matte 300 mm floor tiles, long mirrored sliding cabinet with a stainless open shelf beneath, light terrazzo ledge, white wall-hung basin, white one-piece toilet, white bathtub with a slide-bar shower at the back, two round recessed lights. Realistic Korean apartment bathroom size. Keep basin and mirror inside the central square." }),
  S({ id: "bi01-bathroom-02", home: "bi01", room: "욕실", scene: "bathroom", seat: "gallery", purpose: "세면대·거울장 정면", refs: ["bathroom-01.png"], keep: K("K17"), composition: "Frontal elevation of the basin wall: mirrored sliding cabinet, stainless shelf, terrazzo ledge, white wall-hung basin with a satin-nickel single-lever faucet; the same beige wall tile and grey floor tile." }),

  // ---- bi02 (4) ----
  S({ id: "bi02-living-01", home: "bi02", room: "거실", scene: "living", seat: "gallery", purpose: "cover + 거실", composition: "Compact living room: small oatmeal sofa on the left wall, linen sheer across the window at the back, low oak sideboard on the right, light oak plank floor." }),
  S({ id: "bi02-dining-01", home: "bi02", room: "주방·다이닝", scene: "dining", seat: "gallery", purpose: "주방과 2인 식탁", composition: "White single-line kitchen with oak worktop edge and oak open shelf, round light oak table for two in the foreground under a small white pendant." }),
  S({ id: "bi02-bedroom-01", home: "bi02", room: "침실", scene: "bedroom", seat: "gallery", purpose: "침실", composition: "Bedroom with a low oak bed and white bedding, linen curtain at the back, white built-in wardrobe with round oak knobs on the left." }),
  S({ id: "bi02-bathroom-01", home: "bi02", room: "욕실", scene: "bathroom", seat: "gallery", purpose: "욕실", composition: "Small bathroom with white square wall tiles, light beige floor tiles, oak-look vanity with a white basin, round mirror, matte black fixtures." }),

  // ---- bi03 (5) ----
  S({ id: "bi03-living-01", home: "bi03", room: "거실", scene: "living", seat: "gallery", purpose: "cover + 거실 벽면 수납", composition: "Large living room where the wall opposite the sofa is one continuous floor-to-ceiling greige storage wall with a recessed white display section lit warm; light-grey sofa at the right, sheer window at the back." }),
  S({ id: "bi03-entrance-01", home: "bi03", room: "현관", scene: "entrance", seat: "gallery", purpose: "현관 벤치 수납", composition: "Wide entrance with full-height greige shoe cabinets on both sides, a built-in bench niche with warm LED, and a slim-framed clear glass sliding middle door at the back. Keep the door inside the central square." }),
  S({ id: "bi03-kitchen-01", home: "bi03", room: "주방·팬트리", scene: "kitchen", seat: "gallery", purpose: "주방과 팬트리", composition: "Kitchen with a white island in the foreground, greige tall pantry cabinets along the left with one door open showing organised shelves, slim linear ceiling light." }),
  S({ id: "bi03-kids-01", home: "bi03", room: "아이방", scene: "bedroom", seat: "gallery", purpose: "아이방 붙박이·책상", composition: "Child's room with a white built-in desk and greige wardrobe along one wall, single bed with plain bedding, white roller blind, tidy and unbranded." }),
  S({ id: "bi03-dress-01", home: "bi03", room: "드레스룸", scene: "storage", seat: "gallery", purpose: "드레스룸 시스템 수납", composition: "Walk-through dressing room with open white system shelving and hanging rails on both sides, greige drawer units below, round downlights, mirror at the end." }),

  // ---- bi04 (4 + 2 before) ----
  S({ id: "bi04-kitchen-01", home: "bi04", room: "주방", scene: "kitchen", seat: "gallery", purpose: "cover + 주방 After", composition: "L-shaped white kitchen seen from the dining side: white square-tile backsplash, slim chimney hood, window above the sink at the back." }),
  S({ id: "bi04-kitchen-01-before", home: "bi04", room: "주방", scene: "kitchen", seat: "gallery", before: true, pairedWith: "bi04-kitchen-01", purpose: "주방 Before (같은 시점)", composition: "SAME camera position and room geometry as bi04-kitchen-01, BEFORE the renewal: dated early-2000s Korean apartment kitchen with glossy cherry-wood film cabinets, beige speckled worktop, small yellowed wall tiles, an old under-cabinet hood, fluorescent ceiling light. Clean and empty, not dirty." }),
  S({ id: "bi04-kitchen-02", home: "bi04", room: "주방", scene: "kitchen", seat: "gallery", purpose: "싱크·수전 디테일", composition: "Closer view of the sink run: undermount stainless sink, matte-nickel faucet, white square tiles with light-grey grout, slim integrated grips on white doors." }),
  S({ id: "bi04-bathroom-01", home: "bi04", room: "욕실", scene: "bathroom", seat: "gallery", purpose: "공용 욕실 After", composition: "Main bathroom from the door: large warm-grey wall tiles, darker grey floor, slim white vanity with wall-hung basin, mirrored sliding cabinet, clear glass shower partition at the back." }),
  S({ id: "bi04-bathroom-01-before", home: "bi04", room: "욕실", scene: "bathroom", seat: "gallery", before: true, pairedWith: "bi04-bathroom-01", purpose: "공용 욕실 Before (같은 시점)", composition: "SAME camera position and room geometry as bi04-bathroom-01, BEFORE the renewal: dated Korean apartment bathroom with small glossy beige patterned wall tiles, a plastic mirrored cabinet, pedestal basin, old chrome fixtures and a shower curtain rail. Clean and empty." }),
  S({ id: "bi04-bathroom-02", home: "bi04", room: "안방 욕실", scene: "bathroom", seat: "gallery", purpose: "안방 욕실", composition: "Second bathroom: same warm-grey wall tile and dark grey floor, white bathtub with chrome slide-bar shower, small wall-hung basin, two round recessed lights." }),

  // ---- bi05 (4) ----
  S({ id: "bi05-living-01", home: "bi05", room: "거실", scene: "living", seat: "gallery", purpose: "cover + 채광 좋은 거실", composition: "Sunlit living room: full window wall with white sheer at the back, beige sofa on the left, pale oak floor, pale oak window bench along the extended balcony edge." }),
  S({ id: "bi05-dining-01", home: "bi05", room: "다이닝·주방", scene: "dining", seat: "gallery", purpose: "다이닝과 주방", composition: "Pale oak dining table for four under a woven pendant, white kitchen with pale oak open shelf behind it." }),
  S({ id: "bi05-bedroom-01", home: "bi05", room: "침실", scene: "bedroom", seat: "gallery", purpose: "침실", composition: "Calm bedroom with a pale oak low bed, white bedding, sheer curtain and a slim oak wall shelf." }),
  S({ id: "bi05-balcony-01", home: "bi05", room: "확장 발코니", scene: "storage", seat: "gallery", purpose: "확장 발코니 벤치·수납", composition: "Extended balcony corner used as a home-cafe nook: pale oak built-in bench with storage drawers, white wall cabinets, strong soft daylight through sheer." }),

  // ---- bi06 (4) ----
  S({ id: "bi06-entrance-01", home: "bi06", room: "현관", scene: "entrance", seat: "gallery", purpose: "cover + 현관과 원슬라이딩 중문", composition: "Entrance seen from the front door: single wide slim-framed white sliding glass door at the back, floating white shoe cabinets with warm under-glow on the left, slim oak bench on the right, light terrazzo-look floor. Keep the door inside the central square." }),
  S({ id: "bi06-living-01", home: "bi06", room: "거실", scene: "living", seat: "gallery", purpose: "거실 템바 아트월 + 간접조명", composition: "Living room with the vertical white tambour feature wall at the left, ivory sofa at the right, tray ceiling with warm cove light, sheer window at the back, large square ivory floor modules." }),
  S({ id: "bi06-living-02", home: "bi06", room: "거실", scene: "living", seat: "gallery", purpose: "거실에서 현관 방향", composition: "From the window side toward the entrance: the slim-framed sliding glass door visible at the back left, tambour wall on the right, cove light on." }),
  S({ id: "bi06-hallway-01", home: "bi06", room: "복도", scene: "hallway", seat: "gallery", purpose: "복도", composition: "Hallway with the same ivory floor, white flush doors with satin-nickel levers and a row of three round downlights." }),

  // ---- bi07 (4) ----
  S({ id: "bi07-living-01", home: "bi07", room: "거실·다이닝", scene: "living", seat: "gallery", purpose: "cover + 소형 거실", composition: "Small living-dining room: two-seat light-grey sofa on the left, small white round table with two chairs at the right, white roller blind at the back, ash-grey plank floor. Realistic small proportions." }),
  S({ id: "bi07-kitchen-01", home: "bi07", room: "주방", scene: "kitchen", seat: "gallery", purpose: "일자 주방", composition: "Compact single-line white kitchen with upper cabinets to the ceiling, concealed hood, white worktop, slim under-cabinet light." }),
  S({ id: "bi07-bedroom-01", home: "bi07", room: "침실", scene: "bedroom", seat: "gallery", purpose: "침실 붙박이장", composition: "Small bedroom with a full wall of white handleless built-in wardrobes at the left, low bed with white bedding, white roller blind." }),
  S({ id: "bi07-bathroom-01", home: "bi07", room: "욕실", scene: "bathroom", seat: "gallery", purpose: "욕실", composition: "Compact bathroom with matte white 300 x 600 wall tiles, light grey floor, white vanity, mirrored cabinet, chrome fixtures, clear glass shower screen." }),

  // ---- bi08 (4) ----
  S({ id: "bi08-living-01", home: "bi08", room: "거실", scene: "living", seat: "gallery", purpose: "cover + 거실 아트월", composition: "Spacious but realistic living room: beige stone-look porcelain feature wall with a low walnut console at the left, modular greige sofa at the right, double-layer curtains at the back, tray ceiling with warm cove and slim track lights." }),
  S({ id: "bi08-dining-01", home: "bi08", room: "다이닝", scene: "dining", seat: "gallery", purpose: "다이닝", composition: "Stone-top dining table for six under a slim linear pendant, greige full-height cabinets behind, polished beige floor tiles." }),
  S({ id: "bi08-bedroom-01", home: "bi08", room: "안방", scene: "bedroom", seat: "gallery", purpose: "안방 헤드월", composition: "Master bedroom with a greige upholstered headboard wall, warm concealed lighting above it, taupe drapes, wood-look floor." }),
  S({ id: "bi08-study-01", home: "bi08", room: "서재", scene: "storage", seat: "gallery", purpose: "서재 붙박이 책장", composition: "Study with a full-wall greige bookcase with a few neutral objects, walnut desk, sheer curtain, warm track light." }),
];

// --------------------------------------------------------------- emitters --
export interface ManifestEntry {
  projectId: string;
  shotId: string;
  room: string;
  purpose: string;
  referenceFiles: string[];
  continuityRules: string[];
  prompt: string;
  negativeConstraints: string;
  expectedAspectRatio: string;
  expectedFilename: string;
  seat: Seat;
  siteAsset: { id: string; width: number; height: number };
  standIn: { scene: Scene; before: boolean; palette: Home["palette"] };
  /** before shots only: generate as an image-to-image edit of this APPROVED shot, never as a blind text-to-image call */
  pairedWith?: string;
  generationMethod: "text-to-image" | "image-to-image-from-approved-pair";
}

export function buildManifest(): ManifestEntry[] {
  const ids = new Set<string>();
  return SHOTS.map((s) => {
    if (ids.has(s.id)) throw new Error(`duplicate shot id ${s.id}`);
    ids.add(s.id);
    const home = HOMES[s.home]!;
    const seat = SEATS[s.seat];
    return {
      projectId: s.id.startsWith("site-") ? "site" : home.projectId,
      shotId: s.id,
      room: s.room,
      purpose: s.purpose,
      referenceFiles: s.referenceFiles,
      continuityRules: s.continuityRules,
      prompt: `${PHOTO_STYLE}\n\n${s.before ? home.homeBefore ?? home.home : home.home}\n\nTHIS SHOT (${s.id}, ${seat.aspect}): ${s.composition}\n\nFRAMING: ${seat.note}.`,
      negativeConstraints: NEGATIVE,
      expectedAspectRatio: seat.aspect,
      expectedFilename: `${s.id}.jpg`,
      seat: s.seat,
      siteAsset: { id: s.id, width: seat.width, height: seat.height },
      standIn: { scene: s.scene, before: s.before === true, palette: home.palette },
      ...(s.pairedWith ? { pairedWith: s.pairedWith } : {}),
      generationMethod: s.pairedWith ? ("image-to-image-from-approved-pair" as const) : ("text-to-image" as const),
    };
  });
}

async function main() {
  const entries = buildManifest();
  await mkdir(DOCS, { recursive: true });
  await mkdir(APPROVED, { recursive: true });

  const groups = new Map<string, ManifestEntry[]>();
  for (const e of entries) groups.set(e.projectId, [...(groups.get(e.projectId) ?? []), e]);
  const titleOf = (pid: string) => (pid === "site" ? "Site-level seats (Flagship 집에서 촬영)" : Object.values(HOMES).find((h) => h.projectId === pid)!.title);

  // 01 shot list
  const shotList = [
    "# Shot List — 부스트 인테리어 Demo",
    "",
    `총 ${entries.length} shots · Flagship(bi-01) ${groups.get("bi-01")!.length} · site-level ${groups.get("site")!.length} · 기타 프로젝트 ${entries.length - groups.get("bi-01")!.length - groups.get("site")!.length}`,
    "",
    "- `shotId` = site asset id = 파일명 stem. 승인본은 `references/boost-interior/generated-approved/<shotId>.jpg|png|webp`.",
    "- 모든 gallery 컷은 Template이 4:3 / 1:1 / 29:19로 crop한다 → **피사체를 중앙 정사각 안에** 둔다 (세로 컷 금지).",
    "- continuity 열의 K번호는 `00-visual-bible.md`의 MUST KEEP CONSISTENT 항목이다.",
    "",
    "## Seats",
    "",
    "| seat | aspect | 저장 크기 | 메모 |",
    "|---|---|---|---|",
    ...Object.entries(SEATS).map(([k, v]) => `| ${k} | ${v.aspect} | ${v.width}×${v.height} | ${v.note} |`),
    "",
  ];
  for (const [pid, list] of groups) {
    shotList.push(`## ${pid} — ${titleOf(pid)}`, "", "| shotId | room | seat | purpose | reference | continuity |", "|---|---|---|---|---|---|");
    for (const e of list) {
      shotList.push(`| \`${e.shotId}\` | ${e.room} | ${e.seat} ${e.expectedAspectRatio} | ${e.purpose} | ${e.referenceFiles.map((f) => path.basename(f)).join(", ") || "— (home bible only)"} | ${e.continuityRules.join(" ") || "home bible"} |`);
    }
    shotList.push("");
  }
  await writeFile(path.join(DOCS, "01-shot-list.md"), `${shotList.join("\n")}\n`);

  // 02 prompts
  const prompts = [
    "# Image Generation Prompts — 부스트 인테리어 Demo",
    "",
    "Production-ready prompt pack. 이 파일은 `scripts/template-platform-step6-image-pack.ts`에서 생성된다 (직접 수정 금지).",
    "",
    "사용 규칙:",
    "",
    "1. 한 프로젝트의 모든 shot은 **같은 home bible 문단**을 그대로 포함한다 → 같은 집.",
    "2. Flagship(bi-01)은 가능하면 첫 승인 컷(`bi01-living-01`)을 이후 shot의 style/structure reference로 함께 입력한다.",
    "3. reference 파일은 **사진 영역만 crop**해서 style reference로만 입력한다 (캡션·UI 포함 금지, 1:1 재현 금지).",
    "4. 결과물은 `generated-candidates/`에 두고, `human-review/index.html` 체크 항목을 통과한 것만 `generated-approved/<expectedFilename>`으로 옮긴다.",
    "",
  ];
  for (const [pid, list] of groups) {
    prompts.push(`## ${pid} — ${titleOf(pid)}`, "");
    for (const e of list) {
      prompts.push(
        `### ${e.shotId}`,
        "",
        `- projectId: \`${e.projectId}\``,
        `- shotId: \`${e.shotId}\``,
        `- room: ${e.room}`,
        `- purpose: ${e.purpose}`,
        `- referenceFiles: ${e.referenceFiles.length ? e.referenceFiles.map((f) => `\`${f}\``).join(", ") : "none (home bible only)"}`,
        `- continuityRules: ${e.continuityRules.length ? e.continuityRules.join(", ") : "home bible"}`,
        `- expectedAspectRatio: ${e.expectedAspectRatio}`,
        `- expectedFilename: \`${e.expectedFilename}\``,
        ...(e.pairedWith ? [`- generationMethod: **image-to-image edit of the APPROVED \`${e.pairedWith}\`** (same camera, same geometry, only the finishes change). Do not generate this shot from text alone — two independent text generations will not hold the viewpoint.`] : []),
        "",
        "prompt:",
        "",
        "```text",
        e.prompt,
        "```",
        "",
        "negativeConstraints:",
        "",
        "```text",
        e.negativeConstraints,
        "```",
        "",
      );
    }
  }
  await writeFile(path.join(DOCS, "02-prompts.md"), `${prompts.join("\n")}\n`);

  // 03 manifest
  await writeFile(
    path.join(DOCS, "03-generation-manifest.json"),
    `${JSON.stringify({ schema: "step6-image-generation-manifest@1", siteId: "boost-interior-demo", referenceDir: REF_DIR, approvedDir: "references/boost-interior/generated-approved", candidatesDir: "references/boost-interior/generated-candidates", acceptedExtensions: ["jpg", "png", "webp"], shots: entries }, null, 2)}\n`,
  );
  // expected approved files (status is derived from the directory, never stored)
  await writeFile(
    path.join(APPROVED, "manifest.json"),
    `${JSON.stringify({ schema: "step6-generated-approved@1", note: "Staging folder for APPROVED generated images only. A file here = approved for the boost-interior-demo site. Run scripts/template-platform-step6-assets.ts to ingest.", expected: entries.map((e) => ({ shotId: e.shotId, expectedFilename: e.expectedFilename, aspect: e.expectedAspectRatio })) }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ shots: entries.length, flagship: groups.get("bi-01")!.length, site: groups.get("site")!.length }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(repoRoot, "scripts/template-platform-step6-image-pack.ts")) await main();
