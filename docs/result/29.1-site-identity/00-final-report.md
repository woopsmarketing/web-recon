# Task 29.1 FAST — Minimal Site Identity Foundation · 종합 보고서 (2026-09-13)

**결과: 구현 완료 · typecheck 0 errors · smoke 50/50 PASS · 실제 템플릿 확인 PASS.** 상세: [01-implementation.md](01-implementation.md)

## 결론 공식

```
Template + Content Pack + Theme Pack + Site Identity = Rendered Customer Site
provenance.sourceOrigin   = 템플릿의 출처 (내부 기록, 바꾸지 않음)
siteIdentity.publicOrigin = 새로 렌더한 고객 사이트 (public surface)
```

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/slotized-template/site-identity.ts` | **신규** — schema, loader, provenance, identity surface 적용 |
| `src/slotized-template/render.ts` | `siteIdentityFile` 옵션, provenance 항상 기록, identity 적용(neutrality 비교 다음) |
| `src/slotized-template/types.ts` | 경고 코드 2개, `RenderReport.provenance/siteIdentity/identitySurfaces` |
| `src/slotized-template/audit.ts` | leakage를 internal provenance(허용)와 public identity(identity가 있을 때 gate)로 분리, 오탐 수정 2건 |
| `src/slotized-template/index.ts` | export 추가 |
| `src/cli-render-template.ts` | `--identity` |
| `src/cli-template-audit.ts` | 출력/counts에 public-identity와 internal-provenance 추가 |
| `scripts/smoke-site-identity.ts` | **신규** smoke |
| `fixtures/task29.1/site-identity.example.json` | **신규** 예시 |
| `package.json` | `smoke:site-identity` |

## SiteIdentity schema

`{ schemaVersion:"1", brandName, legalName?, publicOrigin?, slug, locale }` — strict. origin은 http/https만 허용하고 path 불가. slug는 kebab 소문자. locale은 BCP 47.

## CLI

`pnpm render:template --template <manifest> --content <pack> [--theme <pack>] [--identity <site-identity.json>] [--out <dir>]`

## 다시 쓰는 identity surface

route-map `rootUrl`/`url` · 관찰된 `<html lang>` · `package.json` name · generated-config `SITE_*` (`SOURCE_ROOT_URL`은 배포 config에서 뺌) · layout `<html lang>` + metadata fallback + `metadataBase`

## 일부러 보존한 provenance

템플릿 manifest `source` · 렌더 `manifest.json`/`render-report.json`의 `provenance.sourceOrigin` 등 · `data/<sourceHost>/…` 출력 경로

## 경계

보이는 페이지 문구(route title 포함)는 Content Pack slot이 결정한다. identity는 slot 값을 바꾸지 않는다. smoke에서 pack에 넣지 않은 footer "© Source Co"는 그대로 남고, audit는 이를 content leak로 분류했다.

## 검증

- typecheck exit 0
- smoke:site-identity 50/50
- rosee default + `--assert-neutral`: NEUTRAL, `diff -rq` 차이 없음
- rosee realistic 렌더: identity 없음 → public-identity 9(보고만), identity 있음 → 0(gate 적용). 두 경우 모두 content leaks 0, PASS
- rosee identity 렌더 `next build` 성공: `<html lang="ko-KR">`, title은 Content Pack 값, application-name은 brandName

## 알려진 한계

1. canonical / OG 태그는 앱이 원래 렌더하지 않아서 만들지 않았다 (SEO 생성은 범위 밖). `metadataBase`만 준비했다.
2. slot으로 만들 수 없는 infrastructure 라벨(예: channel.io `iframe title="Channel chat"` ×10)은 바꾸지 않았다. audit의 기존 unslottable 버킷에 보고된다.
3. layout/config patch는 현재 reconstruction 생성기 텍스트를 기준점으로 한다. 생성기가 바뀌면 `unpatched` 경고가 난다 (조용히 실패하지 않음).
4. identity 없이 realistic 렌더를 하면 public identity leak는 보고만 되고 gate에는 들어가지 않는다 (Task 29 gate 호환 유지).
5. channel.io 템플릿에는 identity 렌더를 실행하지 않았다 (FAST: fixture와 rosee만).

STOP — 다음 웹사이트 테스트는 시작하지 않음.
