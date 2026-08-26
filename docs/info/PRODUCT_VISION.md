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


## 3. 원본에서 그대로 가져오지 않을 것

다음은 복사의 대상이 아니다:

- WordPress/PHP/그누보드/Vue/React 등의 원본 구현 구조
- 원본 backend source
- 원본 DB
- 원본 관리자
- secret
- private API
- 원본 JavaScript bundle
- 원본 CSS source
- 난잡한 원본 component 구조
- 원본의 SEO 실수
- 잘못된 canonical
- 잘못된 heading 구조
- 불필요한 외부 asset 의존성


## 4. 핵심 아키텍처 원칙

원본에서 관측한 사실과 우리가 개선한 내용을 절대로 섞지 않는다.

구조:

Original Website
↓
Observation
↓
SiteSpec
↓
Exact Reconstruction
↓
ProductionSpec
↓
Production Compiler
↓
Production Website


### SiteSpec

SiteSpec은 원본 브라우저에서 관측한 사실이다.

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

Exact Reconstruction은 Production Site의 정답지 역할을 한다.


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


## 16. 현재 구현 완료 범위

Task 01~16:

URL
↓
Discovery
↓
Verification
↓
Page Family
↓
Desktop/Mobile Observation
↓
Interaction Detection
↓
Safe Interaction Exploration
↓
Pattern Modeling
↓
SiteSpec
↓
Next.js Reconstruction
↓
Visual/Structural/Behavior QA
↓
Root Cause Attribution
↓
Safe Correction
↓
Full E2E

까지 구현 완료.


## 17. 현재 아직 구현하지 않은 Production 영역

- ProductionSpec
- semantic component extraction
- design token extraction
- Tailwind production conversion
- theme system
- full asset materialization
- image optimization pipeline
- full font reconstruction/self-hosting
- SEO Audit Engine
- SEO Production Engine
- Source SEO vs Production SEO comparison
- deployment platform integration
- common production runtime
- site management UI
- version / preview / rollback
- editing / CMS layer


## 18. 앞으로의 개발 방식

먼저 실제 사이트 여러 개를 현재 E2E로 테스트한다.

목적:

- 실제 failure pattern 축적
- 사이트 기술 다양성 검증
- Production Compiler 설계 데이터 확보
- 반복되는 문제의 우선순위 결정

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