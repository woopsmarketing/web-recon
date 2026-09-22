# web-recon Product Vision & Architecture Principles

## 1. 제품의 최종 목적

web-recon은 단순한 웹사이트 복사기가 아니다.

목표는:

1. 이미 시장에서 검증된 웹사이트의 레이아웃, 디자인, 페이지 구조, 사용자 경험, 브라우저에서 관측 가능한 동작을 분석한다.
2. 원본의 기술 스택이나 소스 코드에 종속되지 않고 우리 기술 스택으로 독립적으로 재구성한다.
3. 재구성된 사이트를 사람이 이해하고 유지보수하기 좋은 코드로 정리한다.
4. 원본 SEO 상태를 분석한다.
5. 원본 SEO를 그대로 복사하지 않고 더 나은 SEO 구조로 최적화한다.
6. 이미지, 폰트, 데이터, 배포 등을 우리 인프라 안으로 가져온다.
7. 이후 테마, 브랜드, 콘텐츠, SEO, 페이지 등을 쉽게 수정하고 운영할 수 있도록 한다.
8. 여러 사이트를 하나의 공통 인프라에서 생성, 관리, QA, 배포, 업데이트할 수 있게 한다.

최종 결과는:

"검증된 디자인을 기반으로 하지만 원본 구현에는 종속되지 않는,
SEO 최적화되고 유지보수 가능한 우리 소유의 웹사이트"

이다.


## 2. 원본에서 가져올 것

원본에서 재구성할 대상:

- 레이아웃
- 디자인
- 시각적 계층
- 페이지 구조
- 반응형 결과
- 텍스트 구조
- 이미지 사용 위치
- 관측 가능한 UI 상태
- 메뉴 / 탭 / disclosure 등 관측 가능한 interaction
- 브라우저에서 실제로 확인 가능한 behavior


## 3. 최종 Production Site가 영구적으로 의존하지 않을 것

어떤 계층에서도 가져오지 않는 것:

- 원본 backend source
- 원본 DB
- 원본 관리자
- secret
- private API

최종 Production Site의 영구 의존성이 아닌 것:

- WordPress/PHP/그누보드/Vue/React 등의 원본 구현 구조
- 원본 JavaScript bundle / runtime
- 원본 CSS source
- 난잡한 원본 component 구조
- 원본 infrastructure
- 원본의 SEO 실수 (잘못된 canonical, 잘못된 heading 구조 등)
- 불필요한 외부 asset 의존성

단, 원본 HTML / CSS / public JS runtime / public runtime data snapshot은
fidelity와 관측 가능한 behavior에 필요할 때
Preservation / Reference Layer (Source-Preserved Faithful Clone)에
보존·실행될 수 있다. (§4 참고)
Production Site에 원본 runtime 의존성이 남는 경우는 명시적 production exception / debt로만 허용한다.


## 4. 핵심 아키텍처 원칙

원본에서 관측한 사실과 우리가 개선한 내용을 절대로 섞지 않는다.

구조:

Original Website
↓
Source Capture
↓
Source-Preserved Faithful Clone
↓
Observation / SiteSpec / Runtime Evidence
↓
Recon Template
↓
ProductionSpec / Slots / Theme / Content
↓
Production Compiler
↓
Production Website


### 두 개의 계층

**1. Preservation / Reference Layer**

Source Capture → Source-Preserved Faithful Clone

- fidelity와 관측 가능한 behavior에 필요할 때
  원본 HTML, 원본 CSS, 원본 public JS/runtime, public runtime data snapshot을
  보존하고 실행할 수 있다.
- QA / reference / forensic 계층이다. 최종 Production Site가 아니다.
- runtime 보존 규칙: `docs/architecture/runtime-preservation.md`

**2. Production / Ownership Layer**

Recon Template → Slots / Theme / Content / ProductionSpec → Production Website

- 독립적이고, 유지보수 가능하고, SEO 최적화된, 우리 소유의 사이트를 만든다.
- 최종적으로 다음에 영구 의존하지 않는다:
  원본 backend, 원본 DB, 원본 관리자, private API, 원본 infrastructure,
  원본 JS/CSS/runtime.
- 원본 JS/CSS/runtime에 조용히(암묵적으로) 영구 의존하지 않는다.
  production에 원본 runtime 의존성이 남아야 한다면
  명시적이고(explicit), 근거가 있으며(justified),
  production exception / debt로 추적(tracked)되어야 한다.
  "필요하다"는 이유만으로 영구히 남겨두지 않는다.


### Source-Preserved Faithful Clone

preservation이 가능한 원본에 대해서는
Source-Preserved Faithful Clone이 가장 강한 reference / fidelity baseline이다.


### SiteSpec

SiteSpec은 원본 브라우저에서 관측한 사실이다.

SiteSpec은 production 변환에 쓰이는 구조화된 evidence / analysis이다.
더 이상 유일한 fidelity 수단이 아니다.

SiteSpec에는:

- DOM 구조
- 텍스트
- 스타일
- geometry
- responsive state
- assets
- interaction evidence
- route
- provenance

등이 들어간다.

SiteSpec은 React/Tailwind/Next.js 모델이 아니다.


### Exact Reconstruction

SiteSpec을 가능한 한 정확하게 Next.js로 재구성한 QA 기준본이다.

현재 기술:

- Next.js
- React
- TypeScript
- generated exact CSS
- generic interaction runtime

Exact Reconstruction은 SiteSpec 기반 재구성 경로이며
유용한 historical / production evidence로 남는다.
단, 유일한 fidelity 경로가 아니다.
preservation이 가능한 원본에서는 Source-Preserved Faithful Clone이 더 강한 정답지(reference baseline)이다.


### ProductionSpec

ProductionSpec은 우리가 원본에서 무엇을 변경할지 나타내는 별도의 모델이다.

예:

- 브랜드 컬러
- 로고
- 폰트
- 콘텐츠
- SEO
- canonical
- metadata
- structured data
- asset replacement
- component mapping
- theme
- site-specific overrides

원본 관측 사실인 SiteSpec을 직접 수정하지 않는다.


## 5. Production Site 목표

Production Site는 사람이 유지보수 가능한 코드여야 한다.

목표 기술 구조:

- Next.js
- React
- TypeScript strict
- Semantic React Components
- Tailwind CSS
- CSS Modules
- CSS Variables / Design Tokens
- exact CSS fallback

inline style은 runtime에서 실제 동적 값이 필요한 경우 외에는 최소화한다.


## 6. Styling 원칙

Tailwind 사용 자체가 목표가 아니다.

최종 목표는:

"사람이 이해할 수 있고 수정 가능한 스타일 구조"

이다.

역할:

Tailwind
- layout
- spacing
- typography
- responsive
- 반복되는 utility

CSS Modules
- component 전용 복잡한 스타일
- pseudo-element
- animation
- 복합 selector

CSS Variables
- brand colors
- typography
- spacing
- radius
- shared design tokens

Exact CSS fallback
- Tailwind/token으로 손실 없이 표현하기 어려운 관측값

무조건 모든 값을 Tailwind utility로 강제 변환하지 않는다.


## 7. Component Architecture

최종 Production Site는 단순 DOM node 나열이 아니라 의미 있는 Component 구조를 목표로 한다.

예:

- Header
- Navigation
- Hero
- FeatureGrid
- Pricing
- FAQ
- CTA
- Footer
- Breadcrumb
- Article
- Card

반복되는 subtree는 shared component 후보가 된다.

사이트 전용 component와 플랫폼 공통 component를 구분한다.


## 8. Theme Architecture

복제 후 브랜드/디자인을 수정할 수 있어야 한다.

Theme이 관리할 후보:

- primary color
- secondary color
- background
- text color
- font
- container width
- radius
- shadow
- spacing scale
- button style
- header style
- logo

테마 변경 후에도 visual QA를 수행한다.


## 9. SEO 원칙

원본 SEO를 그대로 복사하지 않는다.

항상:

Source SEO
↓
SEO Audit
↓
Improvement Plan
↓
Production SEO
↓
SEO Delta Report

방식으로 처리한다.


### Source SEO에서 측정할 것

- title
- meta description
- canonical
- robots
- sitemap
- status code
- redirect
- indexability
- H1/H2/H3
- semantic structure
- internal links
- broken links
- image alt
- image dimensions
- structured data
- Open Graph
- Twitter metadata
- hreflang 필요 여부
- pagination
- duplicate content
- Core Web Vitals 관련 항목
- performance


### Production SEO

새 production domain 기준으로 다시 생성:

- title
- description
- canonical
- robots
- sitemap
- structured data
- Open Graph
- internal linking
- redirects
- heading structure
- semantic HTML
- image SEO
- indexability

원본 canonical을 그대로 복사하지 않는다.

없는 rating, review, business data 등을 SEO 목적으로 발명하지 않는다.


## 10. 두 가지 품질을 분리한다

### Fidelity Quality

원본과 얼마나 같은가?

- layout
- visual
- style
- responsive
- behavior


### Production Quality

실제로 운영하기 얼마나 좋은가?

- SEO
- performance
- accessibility
- maintainability
- component quality
- asset independence
- font independence
- security
- deployment quality

최종 목표:

High Fidelity
+
High Production Quality


## 11. Asset Architecture

최종 Production Site는 가능한 한 원본 CDN에 의존하지 않는다.

권장:

Source Asset
↓
Safe Asset Fetcher
↓
Validation
↓
R2
↓
Optimization
↓
Production Site

이미지:

- content hash
- MIME validation
- size limit
- SSRF protection
- width / height
- responsive variants
- WebP / AVIF 필요 시 생성
- lazy / eager 결정

R2를 canonical asset storage 후보로 한다.


## 12. Font Architecture

Production Site에서는 가능한 한 font를 self-host한다.

필요한 정보:

- font-family
- font-weight
- font-style
- source
- format
- preload 필요 여부

폰트 filename만 보고 family/weight를 추측하지 않는다.

폰트 변경으로 layout이 바뀌면 QA한다.


## 13. Infrastructure 목표

현재 장기 후보:

Cloudflare
- DNS
- CDN
- Workers
- R2
- Image optimization

Supabase
- PostgreSQL
- Auth
- project/site/run/deployment metadata

Browser Workers
- Node.js
- Playwright
- Chromium
- Docker/Linux

Heavy reconstruction workload는 일반 production request worker와 분리한다.


## 14. 공통 플랫폼 Infrastructure

장기적으로 여러 사이트에서 공통 사용:

- OptimizedImage
- Font Loader
- SEO Metadata
- Canonical
- Sitemap
- Robots
- Structured Data
- Analytics
- Error Boundary
- Internal Link
- External Link
- Deployment config
- Monitoring

사이트 전용 component와 분리한다.


## 15. Generated Code Ownership

자동 생성 코드와 사람이 수정한 코드를 구분한다.

재생성할 때 사람의 수정을 덮어쓰면 안 된다.

장기 방향:

generated/
components/
content/
seo/
theme/
overrides/

등 ownership boundary를 명확히 한다.

향후 update는:

Old SiteSpec
New SiteSpec
Current Production

3-way diff 기반으로 처리하는 것을 목표로 한다.


## 16. 현재 구현 상태

이 문서는 지속되는 vision을 기술한다. 진행 중인 milestone 상태는 여기에 유지하지 않는다.

- 현재 상태 / 다음 phase: `docs/status/source-preservation-v2.md`
- 과거 작업과 evidence: `docs/result/README.md`


## 17. 아직 구현하지 않은 영역

구현 여부는 §16의 status / result 문서를 기준으로 한다.
이 문서에 구현 완료·미완료 목록을 따로 유지하지 않는다.


## 18. 앞으로의 개발 방식

먼저 첫 번째 Apartmentary end-to-end proof를 완성한다:

Source Capture
↓
Faithful Clone
↓
Runtime / Data
↓
Recon Template
↓
Slots
↓
Customer / Production transformation

그 다음 실제 필요가 생길 때 새 원본 사이트를 테스트하고,
evidence가 요구할 때만 새 bootstrap adapter를 추가한다.

두 번째 기술 스택 proof는 deferred이며,
Recon Template / Slots의 선행 조건이 아니다.
그 전까지 범용 framework 지원을 주장하지 않는다.

새로운 문제 발견 시:

Real Site Failure
↓
Root Cause
↓
Fixture
↓
Deterministic Improvement
↓
Regression Corpus

원칙으로 개선한다.


## 19. 최종 제품 정의

web-recon의 최종 제품은:

"검증된 웹사이트의 디자인과 사용자 경험을 브라우저에서 분석하여
원본 기술에 종속되지 않는 깨끗한 Next.js 사이트로 재구성하고,
SEO, 성능, 자산, 코드 품질을 개선한 뒤,
우리 공통 인프라에서 수정·배포·운영할 수 있게 하는 플랫폼"

이다.

최종 산출물은 깨끗하고 유지보수 가능하며 원본에 독립적인 Production Site이다.
그 과정의 중간 산출물로 원본을 보존한 Source-Preserved Faithful Clone(reference clone)이
존재할 수 있다. 이 clone은 QA / reference / forensic 용도이며 최종 Production Site가 아니다.
