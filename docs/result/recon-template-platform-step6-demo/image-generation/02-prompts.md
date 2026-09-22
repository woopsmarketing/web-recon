# Image Generation Prompts — 부스트 인테리어 Demo

Production-ready prompt pack. 이 파일은 `scripts/template-platform-step6-image-pack.ts`에서 생성된다 (직접 수정 금지).

사용 규칙:

1. 한 프로젝트의 모든 shot은 **같은 home bible 문단**을 그대로 포함한다 → 같은 집.
2. Flagship(bi-01)은 가능하면 첫 승인 컷(`bi01-living-01`)을 이후 shot의 style/structure reference로 함께 입력한다.
3. reference 파일은 **사진 영역만 crop**해서 style reference로만 입력한다 (캡션·UI 포함 금지, 1:1 재현 금지).
4. 결과물은 `generated-candidates/`에 두고, `human-review/index.html` 체크 항목을 통과한 것만 `generated-approved/<expectedFilename>`으로 옮긴다.

## site — Site-level seats (Flagship 집에서 촬영)

### site-hero-01

- projectId: `site`
- shotId: `site-hero-01`
- room: 거실
- purpose: 홈 Hero 1 — 브랜드 첫인상: 밝은 화이트 거실 전경
- referenceFiles: `references/boost-interior/project-01-white-34p/living-01.png`, `references/boost-interior/project-01-white-34p/living-02.png`
- continuityRules: K1, K2, K4, K5, K6, K14, K15, K19
- expectedAspectRatio: 16:9
- expectedFilename: `site-hero-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-hero-01, 16:9): Wide view of the living room from the corner opposite the sofa: sofa wall on the right, full-width sheer-curtained window at the back, tray ceiling with warm cove glowing, the oak-niche built-in cabinet visible at the far left edge. Keep the lower-left third of the frame calm (open floor) for overlaid copy.

FRAMING: homepage hero slide — copy sits bottom-left over a scrim: keep the lower-left third calm; phones crop the slide to a narrow central column, so the main subject stays centred.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### site-hero-02

- projectId: `site`
- shotId: `site-hero-02`
- room: 복도 수납
- purpose: 홈 Hero 2 — 수납 메시지: 오크 니치 붙박이장
- referenceFiles: `references/boost-interior/project-01-white-34p/living-01.png`, `references/boost-interior/project-01-white-34p/kitchen-02.png`, `references/boost-interior/project-01-white-34p/entrance-01.png`
- continuityRules: K1, K3, K6, K7, K19
- expectedAspectRatio: 16:9
- expectedFilename: `site-hero-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-hero-02, 16:9): Three-quarter view of the floor-to-ceiling white built-in cabinet with the warm oak niche lit by its LED strip, standing in the entry hall at the inner end of the sofa wall; the cabinet and its niche are centred in the frame, the living room and sheer window open at the right, a sliver of the three-panel middle door at the left. Lower-left third calm.

FRAMING: homepage hero slide — copy sits bottom-left over a scrim: keep the lower-left third calm; phones crop the slide to a narrow central column, so the main subject stays centred.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### site-hero-03

- projectId: `site`
- shotId: `site-hero-03`
- room: 주방
- purpose: 홈 Hero 3 — 상담 유도: 화이트 주방 축
- referenceFiles: `references/boost-interior/project-01-white-34p/kitchen-01.png`, `references/boost-interior/project-01-white-34p/living-03.png`
- continuityRules: K1, K10, K11, K12, K13, K19
- expectedAspectRatio: 16:9
- expectedFilename: `site-hero-03.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-hero-03, 16:9): One-point perspective down the kitchen axis from the living-room side: counter with fluted wall and box hood on the right, tall cabinets with greige refrigerator and oak oven niche on the left, window with white honeycomb blind at the end, white dome pendant over an empty dining spot in the left foreground. Lower-left third calm.

FRAMING: homepage hero slide — copy sits bottom-left over a scrim: keep the lower-left third calm; phones crop the slide to a narrow central column, so the main subject stays centred.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### site-intro

- projectId: `site`
- shotId: `site-intro`
- room: 현관 → 거실
- purpose: 홈 Intro — 설계 철학: 현관에서 거실로 이어지는 동선
- referenceFiles: `references/boost-interior/project-01-white-34p/entrance-03.png`, `references/boost-interior/project-01-white-34p/entrance-01.png`
- continuityRules: K6, K7, K9, K14, K19
- expectedAspectRatio: 17:20
- expectedFilename: `site-intro.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-intro, 17:20): Portrait. From inside the entrance looking through the half-open three-panel sliding door toward the living room: the ivory sofa and the glowing oak niche are visible through the clear glass; warm-grey porcelain entrance floor and dark brown marble threshold in the foreground.

FRAMING: homepage intro, portrait.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### site-reviews

- projectId: `site`
- shotId: `site-reviews`
- room: 거실 디테일
- purpose: 홈 Reviews 배너 — 생활감 있는 디테일
- referenceFiles: `references/boost-interior/project-01-white-34p/living-01.png`
- continuityRules: K2, K5, K14, K15
- expectedAspectRatio: 10:3
- expectedFilename: `site-reviews.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-reviews, 10:3): Panoramic detail: the ivory sofa against the white wall with the round halo wall light above it and the edge of the sheer curtain at the right; soft daylight, shallow and calm. Horizontal band composition, subject along the vertical centre.

FRAMING: reviews banner — generate 21:9 and centre-crop.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### site-band

- projectId: `site`
- shotId: `site-band`
- room: 거실 저녁
- purpose: 홈 Closing band — 저녁의 간접조명
- referenceFiles: `references/boost-interior/project-01-white-34p/living-02.png`, `references/boost-interior/project-01-white-34p/living-03.png`
- continuityRules: K1, K4, K5, K10, K14
- expectedAspectRatio: 48:19
- expectedFilename: `site-band.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-band, 48:19): Panoramic evening view across the living room toward the kitchen: main panel light off, warm cove light and the oak niche LED on, kitchen downlights glowing in the distance, sheer curtain dim blue dusk. Horizontal band composition.

FRAMING: closing image band — generate 21:9 and centre-crop.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### site-portfolio-hero

- projectId: `site`
- shotId: `site-portfolio-hero`
- room: 주방 벽 디테일
- purpose: 포트폴리오 타이틀 배너 — 저대비 텍스처
- referenceFiles: `references/boost-interior/project-01-white-34p/kitchen-03.png`
- continuityRules: K11, K12
- expectedAspectRatio: 16:5
- expectedFilename: `site-portfolio-hero.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (site-portfolio-hero, 16:5): Panoramic low-contrast detail of the fine vertical fluted white kitchen wall with the edge of the thin white worktop and the satin-nickel faucet far at the right third; the centre stays plain for an overlaid title.

FRAMING: portfolio title banner — the title sits on it: keep the centre low-contrast; generate 21:9 and centre-crop.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-01 — 수성 화이트 34평 아파트 리모델링 (Flagship)

### bi01-living-01

- projectId: `bi-01`
- shotId: `bi01-living-01`
- room: 거실
- purpose: Flagship cover + 거실 정면
- referenceFiles: `references/boost-interior/project-01-white-34p/living-01.png`
- continuityRules: K1, K2, K4, K5, K6, K14, K15, K16, K18, K19
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-living-01, 4:3): Living room seen from the kitchen side: ivory sofa centred on the right-hand white wall (wall pad and switches above its left end, round halo wall light), full-width sheer window at the back with greige drapes, tray ceiling with warm cove and central LED panel. At the left, in the entry hall beyond the inner end of the sofa wall, the oak-niche built-in cabinet faces the camera — place it clearly INSIDE the central square together with the sofa, not at the frame edge.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-living-02

- projectId: `bi-01`
- shotId: `bi01-living-02`
- room: 거실
- purpose: 거실 → 주방 방향: 공간 관계 증명 컷
- referenceFiles: `references/boost-interior/project-01-white-34p/living-02.png`, `references/boost-interior/project-01-white-34p/living-03.png`
- continuityRules: K1, K4, K8, K9, K10, K14, K18
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-living-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-living-02, 4:3): From the window side looking back into the home, following the fixed PLAN order: the white end panel of the kitchen counter with the kitchen axis behind it left of centre, then one white flush bedroom door at the centre, then the three-panel glass sliding middle door right of centre where the entry hall meets the sofa wall; the sofa runs along the right wall toward the camera. All three landmarks (counter end panel, bedroom door, middle door) sit inside the central square; only floor, ceiling and the near end of the sofa may reach the outer edges. Same tray ceiling overhead.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-living-03

- projectId: `bi-01`
- shotId: `bi01-living-03`
- room: 거실
- purpose: 거실 ↔ 복도 ↔ 식탁 자리
- referenceFiles: `references/boost-interior/project-01-white-34p/living-04.png`
- continuityRules: K1, K2, K3, K8, K16
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-living-03.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-living-03, 4:3): Quiet view from the living room toward the short hallway that leads to the bedrooms: plain white wall at left with one white socket plate, hallway opening in the centre with a white flush door at its end, white dome pendant over the dining spot at the right, corner of the white kitchen end panel at the right edge. No artwork on the walls.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-kitchen-01

- projectId: `bi-01`
- shotId: `bi01-kitchen-01`
- room: 주방
- purpose: 주방 축 정면
- referenceFiles: `references/boost-interior/project-01-white-34p/kitchen-01.png`
- continuityRules: K1, K10, K11, K12, K13, K18
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-kitchen-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-kitchen-01, 4:3): One-point perspective down the galley kitchen: tall white cabinets with greige glass refrigerator and oak-framed oven niche on the left, single-line counter with fluted wall, box hood and nickel faucet on the right, window with white honeycomb blind at the end, row of round downlights on the ceiling, white dome pendant at the left foreground.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-kitchen-02

- projectId: `bi-01`
- shotId: `bi01-kitchen-02`
- room: 주방
- purpose: 싱크 라인 사선 + 뒤쪽 오크 니치 (연속성 단서)
- referenceFiles: `references/boost-interior/project-01-white-34p/kitchen-02.png`
- continuityRules: K6, K7, K10, K11, K12
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-kitchen-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-kitchen-02, 4:3): Three-quarter view of the counter from the tall-cabinet side, turned slightly toward the living room: fluted white wall with NO upper cabinets, box stainless hood left of centre, faucet and undermount sink at the centre, lower cabinets with channel grips and beige dishwasher panel. Just right of centre, straight across the living room beyond the living-room end of the counter, the white built-in cabinet with its lit oak niche is clearly visible in the entry hall — inside the central square, large enough to read as the same cabinet as in the living-room shots.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-kitchen-03

- projectId: `bi-01`
- shotId: `bi01-kitchen-03`
- room: 주방
- purpose: 키큰장 디테일: 오크 프레임 오븐 니치
- referenceFiles: `references/boost-interior/project-01-white-34p/kitchen-04.png`
- continuityRules: K7, K13
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-kitchen-03.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-kitchen-03, 4:3): Closer three-quarter view of the tall cabinet wall: oak-framed niche with an unbranded built-in oven, matte white tall doors, built-in refrigerator with greige glass panels, the window with white honeycomb blind at the right. No logos or stickers on the appliances.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-entrance-01

- projectId: `bi-01`
- shotId: `bi01-entrance-01`
- room: 현관
- purpose: 현관 안쪽에서 본 3연동 중문 정면
- referenceFiles: `references/boost-interior/project-01-white-34p/entrance-02.png`
- continuityRules: K9, K18
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-entrance-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-entrance-01, 4:3): Centred view from the front door toward the closed three-panel sliding door: warm-grey porcelain entrance floor, dark brown marble threshold with white veining, glossy ivory full-height shoe cabinet on the left wall, full-height mirror on the right wall, one round recessed light. The living room is softly visible through the clear glass. Empty floor, no shoes. Keep the door inside the central square of the frame.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-entrance-02

- projectId: `bi-01`
- shotId: `bi01-entrance-02`
- room: 현관
- purpose: 실내 쪽 중문 + 오크 니치 붙박이장
- referenceFiles: `references/boost-interior/project-01-white-34p/entrance-01.png`
- continuityRules: K1, K6, K7, K9
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-entrance-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-entrance-02, 4:3): From inside the home: the three-panel sliding door at the left in slight perspective, and next to it the floor-to-ceiling white built-in cabinet with the lit oak niche; ivory stone-look floor. Nothing stored in the entrance behind the glass.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-hallway-01

- projectId: `bi-01`
- shotId: `bi01-hallway-01`
- room: 복도 수납
- purpose: 방으로 가는 복도 + 풀하이트 수납
- referenceFiles: `references/boost-interior/project-01-white-34p/living-04.png`, `references/boost-interior/project-01-white-34p/living-01.png`
- continuityRules: K1, K3, K6, K8
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-hallway-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-hallway-01, 4:3): Short hallway toward the bedrooms: one side is a run of floor-to-ceiling matte white handleless storage doors, the other a plain white wall; two white flush doors with satin-nickel levers at the end; three round downlights in a row.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-bedroom-01

- projectId: `bi-01`
- shotId: `bi01-bedroom-01`
- room: 안방
- purpose: 안방
- referenceFiles: `references/boost-interior/project-01-white-34p/bedroom-01.png`
- continuityRules: K1, K2, K3, K15, K16
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-bedroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-bedroom-01, 4:3): Master bedroom: low platform bed with plain white bedding against the right wall, greige pleated blackout drape covering the window at the back, single flush square LED ceiling light, empty white wall at the left. No television, no artwork.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-bedroom-02

- projectId: `bi-01`
- shotId: `bi01-bedroom-02`
- room: 작은방
- purpose: 작은방 (본 바닥으로 통일)
- referenceFiles: `references/boost-interior/project-01-white-34p/bedroom-02.png`
- continuityRules: K1, K2, K8, K16
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-bedroom-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-bedroom-02, 4:3): Small bedroom seen through its open white flush door (satin-nickel lever in the right foreground): ivory-beige combi blind on the window at the back, a plain white desk with one chair, the SAME ivory stone-look floor as the rest of the home. No appliances.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-bathroom-01

- projectId: `bi-01`
- shotId: `bi01-bathroom-01`
- room: 욕실
- purpose: 욕실 전경
- referenceFiles: `references/boost-interior/project-01-white-34p/bathroom-01.png`
- continuityRules: K17, K18
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-bathroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-bathroom-01, 4:3): Bathroom seen diagonally from just inside the door toward the basin corner (not a straight-on doorway view): warm beige matte 300 x 600 porcelain wall tiles stacked horizontally, mid-grey matte 300 mm floor tiles, long mirrored sliding cabinet with a stainless open shelf beneath, light terrazzo ledge, white wall-hung basin, white one-piece toilet, white bathtub with a slide-bar shower at the back, two round recessed lights. Realistic Korean apartment bathroom size. Keep basin and mirror inside the central square.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi01-bathroom-02

- projectId: `bi-01`
- shotId: `bi01-bathroom-02`
- room: 욕실
- purpose: 세면대·거울장 정면
- referenceFiles: `references/boost-interior/project-01-white-34p/bathroom-01.png`
- continuityRules: K17
- expectedAspectRatio: 4:3
- expectedFilename: `bi01-bathroom-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a renovated 34-pyeong-class Korean apartment, white minimal. FLOOR: pale ivory / warm-grey stone-look large-format rectangular modules (about 600 x 1200 mm) in half-offset running bond, long edge running toward the living-room window, matte, continuous through living room, kitchen, hallway and bedrooms with no thresholds. WALLS: plain matte neutral white, no pattern; flat white skirting about 70 mm; slim white door frames. CEILING: flat white with small 75 mm round recessed downlights; ONLY the living room has one rectangular recessed tray ceiling with a warm 3000K cove light and a flush rectangular LED panel in its centre. BUILT-INS: floor-to-ceiling matte white flat-panel handleless cabinets, split into upper and lower doors, with ONE horizontal open niche at mid height lined in warm light oak and washed by a warm LED strip. DOORS: white flush doors, satin-nickel lever handles. ENTRY MIDDLE DOOR: white-framed three-panel interlocking sliding door, three tall clear glass panes, narrow stiles, solid bottom rail about 250 mm, recessed satin-nickel flush pull. KITCHEN: single-line counter with NO upper cabinets against a full-height wall of fine vertical fluted white panels; one wall-mounted box-shaped stainless range hood; thin white engineered-stone worktop; undermount stainless sink; satin-nickel square high-arc faucet; flush induction hob; matte white flat lower cabinets with stainless-coloured channel grips; integrated beige-panel dishwasher. Opposite the counter: tall white cabinets with a built-in greige glass-door refrigerator and a built-in oven framed in the same warm light oak. A window with a white honeycomb blind closes the kitchen axis. Toward the living room the counter ends in a plain white end panel. LIVING ROOM: one ivory / oatmeal fabric sofa on slim black metal legs; full-width white sheer curtain with greige blackout drapes at both ends. ELECTRICAL: plain white square switch plates. PLAN (fixed, never rearranged): the living room is a rectangle with the full-width window on one short side and the sofa against one long wall. At the inner end of the sofa wall a short entry hall opens; in it the oak-niche built-in cabinet faces the living room and the three-panel middle door stands at right angles beside it, leading to the entrance. Along the inner short side, seen from the window, the fixed order from left to right is: corridor kitchen behind the white end panel of its counter (running away to its own window) -> one white flush bedroom door -> entry hall with the middle door and the oak-niche cabinet, next to the sofa wall. Seen from inside the kitchen, the oak-niche cabinet is the thing visible straight across the living room beyond the living-room end of the counter.

THIS SHOT (bi01-bathroom-02, 4:3): Frontal elevation of the basin wall: mirrored sliding cabinet, stainless shelf, terrazzo ledge, white wall-hung basin with a satin-nickel single-lever faucet; the same beige wall tile and grey floor tile.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-02 — 신혼부부를 위한 24평 화이트 내추럴 리모델링

### bi02-living-01

- projectId: `bi-02`
- shotId: `bi02-living-01`
- room: 거실
- purpose: cover + 거실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi02-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a compact 24-pyeong-class Korean apartment for a newly married couple, white + natural. FLOOR: light natural oak wide-plank flooring, matte, planks running toward the living-room window. WALLS: warm white matte, flat white skirting. CEILING: flat white, small round recessed downlights, no tray ceiling. JOINERY: matte white flat cabinets combined with light natural oak open shelves and oak worktop edges; small round oak knobs. DOORS: white flush doors with matte black lever handles. CURTAINS: natural linen-coloured sheer. FURNITURE: light oak round dining table for two to four, one small oatmeal fabric sofa. Warm 3500K lighting, soft daylight.

THIS SHOT (bi02-living-01, 4:3): Compact living room: small oatmeal sofa on the left wall, linen sheer across the window at the back, low oak sideboard on the right, light oak plank floor.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi02-dining-01

- projectId: `bi-02`
- shotId: `bi02-dining-01`
- room: 주방·다이닝
- purpose: 주방과 2인 식탁
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi02-dining-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a compact 24-pyeong-class Korean apartment for a newly married couple, white + natural. FLOOR: light natural oak wide-plank flooring, matte, planks running toward the living-room window. WALLS: warm white matte, flat white skirting. CEILING: flat white, small round recessed downlights, no tray ceiling. JOINERY: matte white flat cabinets combined with light natural oak open shelves and oak worktop edges; small round oak knobs. DOORS: white flush doors with matte black lever handles. CURTAINS: natural linen-coloured sheer. FURNITURE: light oak round dining table for two to four, one small oatmeal fabric sofa. Warm 3500K lighting, soft daylight.

THIS SHOT (bi02-dining-01, 4:3): White single-line kitchen with oak worktop edge and oak open shelf, round light oak table for two in the foreground under a small white pendant.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi02-bedroom-01

- projectId: `bi-02`
- shotId: `bi02-bedroom-01`
- room: 침실
- purpose: 침실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi02-bedroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a compact 24-pyeong-class Korean apartment for a newly married couple, white + natural. FLOOR: light natural oak wide-plank flooring, matte, planks running toward the living-room window. WALLS: warm white matte, flat white skirting. CEILING: flat white, small round recessed downlights, no tray ceiling. JOINERY: matte white flat cabinets combined with light natural oak open shelves and oak worktop edges; small round oak knobs. DOORS: white flush doors with matte black lever handles. CURTAINS: natural linen-coloured sheer. FURNITURE: light oak round dining table for two to four, one small oatmeal fabric sofa. Warm 3500K lighting, soft daylight.

THIS SHOT (bi02-bedroom-01, 4:3): Bedroom with a low oak bed and white bedding, linen curtain at the back, white built-in wardrobe with round oak knobs on the left.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi02-bathroom-01

- projectId: `bi-02`
- shotId: `bi02-bathroom-01`
- room: 욕실
- purpose: 욕실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi02-bathroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a compact 24-pyeong-class Korean apartment for a newly married couple, white + natural. FLOOR: light natural oak wide-plank flooring, matte, planks running toward the living-room window. WALLS: warm white matte, flat white skirting. CEILING: flat white, small round recessed downlights, no tray ceiling. JOINERY: matte white flat cabinets combined with light natural oak open shelves and oak worktop edges; small round oak knobs. DOORS: white flush doors with matte black lever handles. CURTAINS: natural linen-coloured sheer. FURNITURE: light oak round dining table for two to four, one small oatmeal fabric sofa. Warm 3500K lighting, soft daylight.

THIS SHOT (bi02-bathroom-01, 4:3): Small bathroom with white square wall tiles, light beige floor tiles, oak-look vanity with a white basin, round mirror, matte black fixtures.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-03 — 42평 가족형 아파트 수납 중심 리모델링

### bi03-living-01

- projectId: `bi-03`
- shotId: `bi03-living-01`
- room: 거실
- purpose: cover + 거실 벽면 수납
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi03-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 42-pyeong-class Korean family apartment planned around storage, white + greige modern. FLOOR: light greige wide-plank wood-look flooring, matte. WALLS: matte white; selected walls are full-height built-in storage. BUILT-INS: floor-to-ceiling matte greige flat-panel handleless cabinets with thin shadow gaps and a recessed white open display section with warm LED; the same cabinet language in living room, entrance, pantry and dressing room. CEILING: flat white, slim linear recessed lights plus small round downlights. DOORS: white flush doors, satin-nickel levers. FURNITURE: one large light-grey fabric sofa, a six-seat light wood dining table. Neutral 4000K lighting.

THIS SHOT (bi03-living-01, 4:3): Large living room where the wall opposite the sofa is one continuous floor-to-ceiling greige storage wall with a recessed white display section lit warm; light-grey sofa at the right, sheer window at the back.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi03-entrance-01

- projectId: `bi-03`
- shotId: `bi03-entrance-01`
- room: 현관
- purpose: 현관 벤치 수납
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi03-entrance-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 42-pyeong-class Korean family apartment planned around storage, white + greige modern. FLOOR: light greige wide-plank wood-look flooring, matte. WALLS: matte white; selected walls are full-height built-in storage. BUILT-INS: floor-to-ceiling matte greige flat-panel handleless cabinets with thin shadow gaps and a recessed white open display section with warm LED; the same cabinet language in living room, entrance, pantry and dressing room. CEILING: flat white, slim linear recessed lights plus small round downlights. DOORS: white flush doors, satin-nickel levers. FURNITURE: one large light-grey fabric sofa, a six-seat light wood dining table. Neutral 4000K lighting.

THIS SHOT (bi03-entrance-01, 4:3): Wide entrance with full-height greige shoe cabinets on both sides, a built-in bench niche with warm LED, and a slim-framed clear glass sliding middle door at the back. Keep the door inside the central square.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi03-kitchen-01

- projectId: `bi-03`
- shotId: `bi03-kitchen-01`
- room: 주방·팬트리
- purpose: 주방과 팬트리
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi03-kitchen-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 42-pyeong-class Korean family apartment planned around storage, white + greige modern. FLOOR: light greige wide-plank wood-look flooring, matte. WALLS: matte white; selected walls are full-height built-in storage. BUILT-INS: floor-to-ceiling matte greige flat-panel handleless cabinets with thin shadow gaps and a recessed white open display section with warm LED; the same cabinet language in living room, entrance, pantry and dressing room. CEILING: flat white, slim linear recessed lights plus small round downlights. DOORS: white flush doors, satin-nickel levers. FURNITURE: one large light-grey fabric sofa, a six-seat light wood dining table. Neutral 4000K lighting.

THIS SHOT (bi03-kitchen-01, 4:3): Kitchen with a white island in the foreground, greige tall pantry cabinets along the left with one door open showing organised shelves, slim linear ceiling light.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi03-kids-01

- projectId: `bi-03`
- shotId: `bi03-kids-01`
- room: 아이방
- purpose: 아이방 붙박이·책상
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi03-kids-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 42-pyeong-class Korean family apartment planned around storage, white + greige modern. FLOOR: light greige wide-plank wood-look flooring, matte. WALLS: matte white; selected walls are full-height built-in storage. BUILT-INS: floor-to-ceiling matte greige flat-panel handleless cabinets with thin shadow gaps and a recessed white open display section with warm LED; the same cabinet language in living room, entrance, pantry and dressing room. CEILING: flat white, slim linear recessed lights plus small round downlights. DOORS: white flush doors, satin-nickel levers. FURNITURE: one large light-grey fabric sofa, a six-seat light wood dining table. Neutral 4000K lighting.

THIS SHOT (bi03-kids-01, 4:3): Child's room with a white built-in desk and greige wardrobe along one wall, single bed with plain bedding, white roller blind, tidy and unbranded.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi03-dress-01

- projectId: `bi-03`
- shotId: `bi03-dress-01`
- room: 드레스룸
- purpose: 드레스룸 시스템 수납
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi03-dress-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 42-pyeong-class Korean family apartment planned around storage, white + greige modern. FLOOR: light greige wide-plank wood-look flooring, matte. WALLS: matte white; selected walls are full-height built-in storage. BUILT-INS: floor-to-ceiling matte greige flat-panel handleless cabinets with thin shadow gaps and a recessed white open display section with warm LED; the same cabinet language in living room, entrance, pantry and dressing room. CEILING: flat white, slim linear recessed lights plus small round downlights. DOORS: white flush doors, satin-nickel levers. FURNITURE: one large light-grey fabric sofa, a six-seat light wood dining table. Neutral 4000K lighting.

THIS SHOT (bi03-dress-01, 4:3): Walk-through dressing room with open white system shelving and hanging rails on both sides, greige drawer units below, round downlights, mirror at the end.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-04 — 32평 주방·욕실 중심 리뉴얼

### bi04-kitchen-01

- projectId: `bi-04`
- shotId: `bi04-kitchen-01`
- room: 주방
- purpose: cover + 주방 After
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi04-kitchen-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 32-pyeong-class Korean apartment where only the kitchen and the two bathrooms were renewed. KITCHEN: L-shaped layout, matte white flat lower and upper cabinets with slim integrated grips, white square-tile backsplash with light-grey grout, white engineered-stone worktop, stainless undermount sink, matte-nickel faucet, slim stainless chimney hood; existing light wood-look floor kept. BATHROOMS: large-format light warm-grey matte porcelain wall tiles (600 x 1200) with a darker grey matte floor, white wall-hung basin on a slim white vanity, mirrored sliding cabinet, chrome fixtures, glass shower partition in the main bathroom and a white bathtub in the second bathroom, flat white ceiling with two round recessed lights. Neutral 4000K lighting.

THIS SHOT (bi04-kitchen-01, 4:3): L-shaped white kitchen seen from the dining side: white square-tile backsplash, slim chimney hood, window above the sink at the back.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi04-kitchen-01-before

- projectId: `bi-04`
- shotId: `bi04-kitchen-01-before`
- room: 주방
- purpose: 주방 Before (같은 시점)
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi04-kitchen-01-before.jpg`
- generationMethod: **image-to-image edit of the APPROVED `bi04-kitchen-01`** (same camera, same geometry, only the finishes change). Do not generate this shot from text alone — two independent text generations will not hold the viewpoint.

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME, BEFORE THE RENEWAL — the same 32-pyeong-class Korean apartment, same room sizes, same window and door positions, same light wood-look floor, photographed as a plain pre-construction record before any work. Every finish in view is the original, dated one. KITCHEN BEFORE: the same L-shaped layout with dated early-2000s finishes. BATHROOM BEFORE: the same fixture positions with dated finishes. Flat, ordinary ceiling light; clean and empty, not dirty, not staged.

THIS SHOT (bi04-kitchen-01-before, 4:3): SAME camera position and room geometry as bi04-kitchen-01, BEFORE the renewal: dated early-2000s Korean apartment kitchen with glossy cherry-wood film cabinets, beige speckled worktop, small yellowed wall tiles, an old under-cabinet hood, fluorescent ceiling light. Clean and empty, not dirty.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi04-kitchen-02

- projectId: `bi-04`
- shotId: `bi04-kitchen-02`
- room: 주방
- purpose: 싱크·수전 디테일
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi04-kitchen-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 32-pyeong-class Korean apartment where only the kitchen and the two bathrooms were renewed. KITCHEN: L-shaped layout, matte white flat lower and upper cabinets with slim integrated grips, white square-tile backsplash with light-grey grout, white engineered-stone worktop, stainless undermount sink, matte-nickel faucet, slim stainless chimney hood; existing light wood-look floor kept. BATHROOMS: large-format light warm-grey matte porcelain wall tiles (600 x 1200) with a darker grey matte floor, white wall-hung basin on a slim white vanity, mirrored sliding cabinet, chrome fixtures, glass shower partition in the main bathroom and a white bathtub in the second bathroom, flat white ceiling with two round recessed lights. Neutral 4000K lighting.

THIS SHOT (bi04-kitchen-02, 4:3): Closer view of the sink run: undermount stainless sink, matte-nickel faucet, white square tiles with light-grey grout, slim integrated grips on white doors.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi04-bathroom-01

- projectId: `bi-04`
- shotId: `bi04-bathroom-01`
- room: 욕실
- purpose: 공용 욕실 After
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi04-bathroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 32-pyeong-class Korean apartment where only the kitchen and the two bathrooms were renewed. KITCHEN: L-shaped layout, matte white flat lower and upper cabinets with slim integrated grips, white square-tile backsplash with light-grey grout, white engineered-stone worktop, stainless undermount sink, matte-nickel faucet, slim stainless chimney hood; existing light wood-look floor kept. BATHROOMS: large-format light warm-grey matte porcelain wall tiles (600 x 1200) with a darker grey matte floor, white wall-hung basin on a slim white vanity, mirrored sliding cabinet, chrome fixtures, glass shower partition in the main bathroom and a white bathtub in the second bathroom, flat white ceiling with two round recessed lights. Neutral 4000K lighting.

THIS SHOT (bi04-bathroom-01, 4:3): Main bathroom from the door: large warm-grey wall tiles, darker grey floor, slim white vanity with wall-hung basin, mirrored sliding cabinet, clear glass shower partition at the back.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi04-bathroom-01-before

- projectId: `bi-04`
- shotId: `bi04-bathroom-01-before`
- room: 욕실
- purpose: 공용 욕실 Before (같은 시점)
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi04-bathroom-01-before.jpg`
- generationMethod: **image-to-image edit of the APPROVED `bi04-bathroom-01`** (same camera, same geometry, only the finishes change). Do not generate this shot from text alone — two independent text generations will not hold the viewpoint.

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME, BEFORE THE RENEWAL — the same 32-pyeong-class Korean apartment, same room sizes, same window and door positions, same light wood-look floor, photographed as a plain pre-construction record before any work. Every finish in view is the original, dated one. KITCHEN BEFORE: the same L-shaped layout with dated early-2000s finishes. BATHROOM BEFORE: the same fixture positions with dated finishes. Flat, ordinary ceiling light; clean and empty, not dirty, not staged.

THIS SHOT (bi04-bathroom-01-before, 4:3): SAME camera position and room geometry as bi04-bathroom-01, BEFORE the renewal: dated Korean apartment bathroom with small glossy beige patterned wall tiles, a plastic mirrored cabinet, pedestal basin, old chrome fixtures and a shower curtain rail. Clean and empty.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi04-bathroom-02

- projectId: `bi-04`
- shotId: `bi04-bathroom-02`
- room: 안방 욕실
- purpose: 안방 욕실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi04-bathroom-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 32-pyeong-class Korean apartment where only the kitchen and the two bathrooms were renewed. KITCHEN: L-shaped layout, matte white flat lower and upper cabinets with slim integrated grips, white square-tile backsplash with light-grey grout, white engineered-stone worktop, stainless undermount sink, matte-nickel faucet, slim stainless chimney hood; existing light wood-look floor kept. BATHROOMS: large-format light warm-grey matte porcelain wall tiles (600 x 1200) with a darker grey matte floor, white wall-hung basin on a slim white vanity, mirrored sliding cabinet, chrome fixtures, glass shower partition in the main bathroom and a white bathtub in the second bathroom, flat white ceiling with two round recessed lights. Neutral 4000K lighting.

THIS SHOT (bi04-bathroom-02, 4:3): Second bathroom: same warm-grey wall tile and dark grey floor, white bathtub with chrome slide-bar shower, small wall-hung basin, two round recessed lights.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-05 — 29평 밝은 내추럴 아파트 리모델링

### bi05-living-01

- projectId: `bi-05`
- shotId: `bi05-living-01`
- room: 거실
- purpose: cover + 채광 좋은 거실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi05-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a bright 29-pyeong-class Korean apartment, natural and airy. FLOOR: pale natural oak herringbone-free straight plank flooring, matte. WALLS: soft warm white. CEILING: flat white with a slim recessed curtain box and small round downlights. JOINERY: white flat cabinets with pale oak open shelving and a pale oak window bench in the extended balcony area. DOORS: white flush doors with slim oak-coloured pull handles. CURTAINS: white sheer across the full window wall. FURNITURE: pale oak dining table, beige fabric sofa, woven pendant over the table. Warm 3500K lighting with strong soft daylight.

THIS SHOT (bi05-living-01, 4:3): Sunlit living room: full window wall with white sheer at the back, beige sofa on the left, pale oak floor, pale oak window bench along the extended balcony edge.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi05-dining-01

- projectId: `bi-05`
- shotId: `bi05-dining-01`
- room: 다이닝·주방
- purpose: 다이닝과 주방
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi05-dining-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a bright 29-pyeong-class Korean apartment, natural and airy. FLOOR: pale natural oak herringbone-free straight plank flooring, matte. WALLS: soft warm white. CEILING: flat white with a slim recessed curtain box and small round downlights. JOINERY: white flat cabinets with pale oak open shelving and a pale oak window bench in the extended balcony area. DOORS: white flush doors with slim oak-coloured pull handles. CURTAINS: white sheer across the full window wall. FURNITURE: pale oak dining table, beige fabric sofa, woven pendant over the table. Warm 3500K lighting with strong soft daylight.

THIS SHOT (bi05-dining-01, 4:3): Pale oak dining table for four under a woven pendant, white kitchen with pale oak open shelf behind it.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi05-bedroom-01

- projectId: `bi-05`
- shotId: `bi05-bedroom-01`
- room: 침실
- purpose: 침실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi05-bedroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a bright 29-pyeong-class Korean apartment, natural and airy. FLOOR: pale natural oak herringbone-free straight plank flooring, matte. WALLS: soft warm white. CEILING: flat white with a slim recessed curtain box and small round downlights. JOINERY: white flat cabinets with pale oak open shelving and a pale oak window bench in the extended balcony area. DOORS: white flush doors with slim oak-coloured pull handles. CURTAINS: white sheer across the full window wall. FURNITURE: pale oak dining table, beige fabric sofa, woven pendant over the table. Warm 3500K lighting with strong soft daylight.

THIS SHOT (bi05-bedroom-01, 4:3): Calm bedroom with a pale oak low bed, white bedding, sheer curtain and a slim oak wall shelf.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi05-balcony-01

- projectId: `bi-05`
- shotId: `bi05-balcony-01`
- room: 확장 발코니
- purpose: 확장 발코니 벤치·수납
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi05-balcony-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a bright 29-pyeong-class Korean apartment, natural and airy. FLOOR: pale natural oak herringbone-free straight plank flooring, matte. WALLS: soft warm white. CEILING: flat white with a slim recessed curtain box and small round downlights. JOINERY: white flat cabinets with pale oak open shelving and a pale oak window bench in the extended balcony area. DOORS: white flush doors with slim oak-coloured pull handles. CURTAINS: white sheer across the full window wall. FURNITURE: pale oak dining table, beige fabric sofa, woven pendant over the table. Warm 3500K lighting with strong soft daylight.

THIS SHOT (bi05-balcony-01, 4:3): Extended balcony corner used as a home-cafe nook: pale oak built-in bench with storage drawers, white wall cabinets, strong soft daylight through sheer.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-06 — 34평 현관·거실 중심 리모델링

### bi06-entrance-01

- projectId: `bi-06`
- shotId: `bi06-entrance-01`
- room: 현관
- purpose: cover + 현관과 원슬라이딩 중문
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi06-entrance-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 34-pyeong-class Korean apartment where the entrance and the living room were remodelled. ENTRANCE: a single wide sliding middle door with a slim white aluminium frame and one large clear glass pane, light-grey terrazzo-look porcelain entrance floor, full-height matte white shoe cabinets with a floating lower section and warm LED under-glow, a slim oak bench. LIVING ROOM: matte white walls, one feature wall of fine vertical white tambour panels behind the TV position, rectangular tray ceiling with warm cove light, light ivory stone-look floor in large square modules, ivory fabric sofa, white sheer curtains. Hallway keeps the same floor and white flush doors with satin-nickel levers. Neutral light with warm cove accents.

THIS SHOT (bi06-entrance-01, 4:3): Entrance seen from the front door: single wide slim-framed white sliding glass door at the back, floating white shoe cabinets with warm under-glow on the left, slim oak bench on the right, light terrazzo-look floor. Keep the door inside the central square.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi06-living-01

- projectId: `bi-06`
- shotId: `bi06-living-01`
- room: 거실
- purpose: 거실 템바 아트월 + 간접조명
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi06-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 34-pyeong-class Korean apartment where the entrance and the living room were remodelled. ENTRANCE: a single wide sliding middle door with a slim white aluminium frame and one large clear glass pane, light-grey terrazzo-look porcelain entrance floor, full-height matte white shoe cabinets with a floating lower section and warm LED under-glow, a slim oak bench. LIVING ROOM: matte white walls, one feature wall of fine vertical white tambour panels behind the TV position, rectangular tray ceiling with warm cove light, light ivory stone-look floor in large square modules, ivory fabric sofa, white sheer curtains. Hallway keeps the same floor and white flush doors with satin-nickel levers. Neutral light with warm cove accents.

THIS SHOT (bi06-living-01, 4:3): Living room with the vertical white tambour feature wall at the left, ivory sofa at the right, tray ceiling with warm cove light, sheer window at the back, large square ivory floor modules.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi06-living-02

- projectId: `bi-06`
- shotId: `bi06-living-02`
- room: 거실
- purpose: 거실에서 현관 방향
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi06-living-02.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 34-pyeong-class Korean apartment where the entrance and the living room were remodelled. ENTRANCE: a single wide sliding middle door with a slim white aluminium frame and one large clear glass pane, light-grey terrazzo-look porcelain entrance floor, full-height matte white shoe cabinets with a floating lower section and warm LED under-glow, a slim oak bench. LIVING ROOM: matte white walls, one feature wall of fine vertical white tambour panels behind the TV position, rectangular tray ceiling with warm cove light, light ivory stone-look floor in large square modules, ivory fabric sofa, white sheer curtains. Hallway keeps the same floor and white flush doors with satin-nickel levers. Neutral light with warm cove accents.

THIS SHOT (bi06-living-02, 4:3): From the window side toward the entrance: the slim-framed sliding glass door visible at the back left, tambour wall on the right, cove light on.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi06-hallway-01

- projectId: `bi-06`
- shotId: `bi06-hallway-01`
- room: 복도
- purpose: 복도
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi06-hallway-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a 34-pyeong-class Korean apartment where the entrance and the living room were remodelled. ENTRANCE: a single wide sliding middle door with a slim white aluminium frame and one large clear glass pane, light-grey terrazzo-look porcelain entrance floor, full-height matte white shoe cabinets with a floating lower section and warm LED under-glow, a slim oak bench. LIVING ROOM: matte white walls, one feature wall of fine vertical white tambour panels behind the TV position, rectangular tray ceiling with warm cove light, light ivory stone-look floor in large square modules, ivory fabric sofa, white sheer curtains. Hallway keeps the same floor and white flush doors with satin-nickel levers. Neutral light with warm cove accents.

THIS SHOT (bi06-hallway-01, 4:3): Hallway with the same ivory floor, white flush doors with satin-nickel levers and a row of three round downlights.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-07 — 19평 소형 아파트 화이트 미니멀 리모델링

### bi07-living-01

- projectId: `bi-07`
- shotId: `bi07-living-01`
- room: 거실·다이닝
- purpose: cover + 소형 거실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi07-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a small 19-pyeong-class Korean apartment, white minimal, planned to look wider. FLOOR: very light ash-grey wood-look plank flooring, matte. WALLS: matte white. JOINERY: full-height matte white handleless built-in wardrobes and a compact single-line white kitchen with a white worktop, white upper cabinets to the ceiling and a concealed hood. CEILING: flat white, small round downlights, no pendant. DOORS: white flush doors, slim white frames. FURNITURE: a two-seat light-grey sofa, a small white round table with two chairs, a low bed with white bedding. Neutral-cool 4500K lighting, bright daylight through white roller blinds. Realistic small-room proportions.

THIS SHOT (bi07-living-01, 4:3): Small living-dining room: two-seat light-grey sofa on the left, small white round table with two chairs at the right, white roller blind at the back, ash-grey plank floor. Realistic small proportions.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi07-kitchen-01

- projectId: `bi-07`
- shotId: `bi07-kitchen-01`
- room: 주방
- purpose: 일자 주방
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi07-kitchen-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a small 19-pyeong-class Korean apartment, white minimal, planned to look wider. FLOOR: very light ash-grey wood-look plank flooring, matte. WALLS: matte white. JOINERY: full-height matte white handleless built-in wardrobes and a compact single-line white kitchen with a white worktop, white upper cabinets to the ceiling and a concealed hood. CEILING: flat white, small round downlights, no pendant. DOORS: white flush doors, slim white frames. FURNITURE: a two-seat light-grey sofa, a small white round table with two chairs, a low bed with white bedding. Neutral-cool 4500K lighting, bright daylight through white roller blinds. Realistic small-room proportions.

THIS SHOT (bi07-kitchen-01, 4:3): Compact single-line white kitchen with upper cabinets to the ceiling, concealed hood, white worktop, slim under-cabinet light.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi07-bedroom-01

- projectId: `bi-07`
- shotId: `bi07-bedroom-01`
- room: 침실
- purpose: 침실 붙박이장
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi07-bedroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a small 19-pyeong-class Korean apartment, white minimal, planned to look wider. FLOOR: very light ash-grey wood-look plank flooring, matte. WALLS: matte white. JOINERY: full-height matte white handleless built-in wardrobes and a compact single-line white kitchen with a white worktop, white upper cabinets to the ceiling and a concealed hood. CEILING: flat white, small round downlights, no pendant. DOORS: white flush doors, slim white frames. FURNITURE: a two-seat light-grey sofa, a small white round table with two chairs, a low bed with white bedding. Neutral-cool 4500K lighting, bright daylight through white roller blinds. Realistic small-room proportions.

THIS SHOT (bi07-bedroom-01, 4:3): Small bedroom with a full wall of white handleless built-in wardrobes at the left, low bed with white bedding, white roller blind.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi07-bathroom-01

- projectId: `bi-07`
- shotId: `bi07-bathroom-01`
- room: 욕실
- purpose: 욕실
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi07-bathroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a small 19-pyeong-class Korean apartment, white minimal, planned to look wider. FLOOR: very light ash-grey wood-look plank flooring, matte. WALLS: matte white. JOINERY: full-height matte white handleless built-in wardrobes and a compact single-line white kitchen with a white worktop, white upper cabinets to the ceiling and a concealed hood. CEILING: flat white, small round downlights, no pendant. DOORS: white flush doors, slim white frames. FURNITURE: a two-seat light-grey sofa, a small white round table with two chairs, a low bed with white bedding. Neutral-cool 4500K lighting, bright daylight through white roller blinds. Realistic small-room proportions.

THIS SHOT (bi07-bathroom-01, 4:3): Compact bathroom with matte white 300 x 600 wall tiles, light grey floor, white vanity, mirrored cabinet, chrome fixtures, clear glass shower screen.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

## bi-08 — 51평 신축 아파트 입주 전 홈스타일링

### bi08-living-01

- projectId: `bi-08`
- shotId: `bi08-living-01`
- room: 거실
- purpose: cover + 거실 아트월
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi08-living-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a newly built 51-pyeong-class Korean apartment styled before move-in, calm modern greige. FLOOR: builder-grade light beige polished porcelain tiles in the living areas, wood-look flooring in the bedrooms (kept as built). WALLS: warm greige matte paint with one large-format beige stone-look porcelain feature wall in the living room. CEILING: rectangular tray ceiling with warm cove lighting and slim magnetic track lights. JOINERY: walnut-toned low media console, greige full-height cabinets. CURTAINS: double layer of white sheer and taupe drapes. FURNITURE: a modular greige sofa, a rectangular stone-top dining table for six, upholstered bed with a greige headboard wall. Warm 3000-3500K lighting. Large but realistic Korean apartment rooms, not a penthouse.

THIS SHOT (bi08-living-01, 4:3): Spacious but realistic living room: beige stone-look porcelain feature wall with a low walnut console at the left, modular greige sofa at the right, double-layer curtains at the back, tray ceiling with warm cove and slim track lights.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi08-dining-01

- projectId: `bi-08`
- shotId: `bi08-dining-01`
- room: 다이닝
- purpose: 다이닝
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi08-dining-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a newly built 51-pyeong-class Korean apartment styled before move-in, calm modern greige. FLOOR: builder-grade light beige polished porcelain tiles in the living areas, wood-look flooring in the bedrooms (kept as built). WALLS: warm greige matte paint with one large-format beige stone-look porcelain feature wall in the living room. CEILING: rectangular tray ceiling with warm cove lighting and slim magnetic track lights. JOINERY: walnut-toned low media console, greige full-height cabinets. CURTAINS: double layer of white sheer and taupe drapes. FURNITURE: a modular greige sofa, a rectangular stone-top dining table for six, upholstered bed with a greige headboard wall. Warm 3000-3500K lighting. Large but realistic Korean apartment rooms, not a penthouse.

THIS SHOT (bi08-dining-01, 4:3): Stone-top dining table for six under a slim linear pendant, greige full-height cabinets behind, polished beige floor tiles.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi08-bedroom-01

- projectId: `bi-08`
- shotId: `bi08-bedroom-01`
- room: 안방
- purpose: 안방 헤드월
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi08-bedroom-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a newly built 51-pyeong-class Korean apartment styled before move-in, calm modern greige. FLOOR: builder-grade light beige polished porcelain tiles in the living areas, wood-look flooring in the bedrooms (kept as built). WALLS: warm greige matte paint with one large-format beige stone-look porcelain feature wall in the living room. CEILING: rectangular tray ceiling with warm cove lighting and slim magnetic track lights. JOINERY: walnut-toned low media console, greige full-height cabinets. CURTAINS: double layer of white sheer and taupe drapes. FURNITURE: a modular greige sofa, a rectangular stone-top dining table for six, upholstered bed with a greige headboard wall. Warm 3000-3500K lighting. Large but realistic Korean apartment rooms, not a penthouse.

THIS SHOT (bi08-bedroom-01, 4:3): Master bedroom with a greige upholstered headboard wall, warm concealed lighting above it, taupe drapes, wood-look floor.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

### bi08-study-01

- projectId: `bi-08`
- shotId: `bi08-study-01`
- room: 서재
- purpose: 서재 붙박이 책장
- referenceFiles: none (home bible only)
- continuityRules: home bible
- expectedAspectRatio: 4:3
- expectedFilename: `bi08-study-01.jpg`

prompt:

```text
Professional Korean apartment renovation portfolio photograph, photorealistic. 24mm full-frame equivalent lens (do not render a wider angle than a 20mm lens would give), camera height about 1.3 m, level camera, vertical lines corrected. Bright high-key exposure that still keeps detail in the window sheers, neutral white balance (only cove and niche lighting is warm), moderate dynamic range, clean but believable, restrained furniture, move-in-ready empty surfaces, realistic 2.35 m ceiling height and Korean apartment proportions, no people.

SAME HOME IN EVERY SHOT — a newly built 51-pyeong-class Korean apartment styled before move-in, calm modern greige. FLOOR: builder-grade light beige polished porcelain tiles in the living areas, wood-look flooring in the bedrooms (kept as built). WALLS: warm greige matte paint with one large-format beige stone-look porcelain feature wall in the living room. CEILING: rectangular tray ceiling with warm cove lighting and slim magnetic track lights. JOINERY: walnut-toned low media console, greige full-height cabinets. CURTAINS: double layer of white sheer and taupe drapes. FURNITURE: a modular greige sofa, a rectangular stone-top dining table for six, upholstered bed with a greige headboard wall. Warm 3000-3500K lighting. Large but realistic Korean apartment rooms, not a penthouse.

THIS SHOT (bi08-study-01, 4:3): Study with a full-wall greige bookcase with a few neutral objects, walnut desk, sheer curtain, warm track light.

FRAMING: cover / gallery — the Template crops to 4:3, 1:1 and 29:19: keep the subject AND every named continuity landmark inside the central square (the middle 75% of the width); treat the outer eighth at each side as expendable.
```

negativeConstraints:

```text
text, captions, watermark, logo, signage, brand marks on appliances, energy-label stickers, framed artwork, people, pets, shoes, tools, clutter, fantasy architecture, impossible geometry, luxury mansion, American suburban house, huge penthouse, showroom, hotel suite, commercial space, surreal room, exaggerated ultra-wide distortion, fisheye, hyper-staged furniture showroom, malformed furniture, impossible windows, duplicate lamps, warped cabinetry, impossible cabinet doors, random ceiling geometry, floating objects, HDR halos, heavy vignette, oversaturated colour
```

