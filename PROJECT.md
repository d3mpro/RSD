# Project: RSD Smart Visual Observer Modal Button Removal & Redesign

## Architecture
- **Application type**: Zero-build static HTML/JS/CSS web application (`field.html`, `quality.html`, `head.html`, `dashboard.html`) using Tailwind Play CDN (`https://cdn.tailwindcss.com`), `Cairo` Arabic RTL font, `Material Symbols Outlined` icons, and `assets/css/core-theme.css` KSUMC design tokens.
- **Target modal**: Smart Visual Observer ("الراصد البصري الذكي للسلامة الميدانية") rendered by `assets/js/ksu-ai-client.js` (`#ksu-ai-vision-modal`), specifically the `renderVisionResults` action bar (`lines 3631–3671`) and modal footer (`lines 2968–2974`).
- **Verification**: Node.js `v22.23.5` native `node --check` and `node --test` (plus `tools/` guided-vision scripts).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Remove 3 circled buttons | Remove `#btn-vision-instant-violation` (`إنشاء بلاغ مخالفة فوري`), `#btn-vision-start-round` (`بدء جولة جديدة لهذا الموقع`), and `#btn-vision-dispatch-wo` (`إصدار وتوجيه طلب صيانة آلي`) from `assets/js/ksu-ai-client.js:3640-3647,3653-3656` | M1 | Survey 1, 2, 3 |
| 2 | Consistent button redesign | Redesign remaining action bar buttons (`اعتماد ورفع المخالفة`, `بث تنبيه لغرفة العمليات`, `طباعة كارت الفحص`, `open_in_new`, and conditional `#btn-apply-vision-round`) into a clean, symmetric full-width RTL two-tier layout using KSUMC Royal Blue (`#082B49`–`#004B87`), Alert Rose (`rose-600`), white/slate secondary buttons, and Material Symbols without redundant Unicode emojis; polish footer `إغلاق` (`2968-2974`) | M1 | Survey 1, 2 |
| 3 | Coupled test alignment | Update obsolete button-label assertions in `tools/test_standalone_dispatch.js:121-131` while preserving helper functions (`openViolationFromAI`, `startRoundFromAI`) and all kept action handlers | M1 | Survey 1, 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Remove Circled Buttons & Redesign Action Bar | Single-cycle implementation & verification of `assets/js/ksu-ai-client.js` and `tools/test_standalone_dispatch.js` | none | DONE |

## Interface Contracts
### `renderVisionResults` Action Bar (`assets/js/ksu-ai-client.js`)
- Must preserve onclick handlers and behaviors for kept controls:
  - `applyVisionToActiveRound()` (`#btn-apply-vision-round`, when `isRoundActive === true`)
  - `approveAndUploadVisualViolation()` (`اعتماد ورفع المخالفة`)
  - `broadcastVisualHazardAlert()` (`بث تنبيه لغرفة العمليات`)
  - `printVisualInspectionCard()` (`طباعة كارت الفحص`)
  - `openVisualInspectionCardWindow()` (`open_in_new`)
  - Footer `إغلاق`: `document.getElementById('ksu-ai-vision-modal').remove()`
- Must preserve `window.openViolationFromAI` and `window.startRoundFromAI` helper functions for existing `tools/verify_all_guided_vision.js` and `tools/test_standalone_dispatch.js` unit coverage.

## Code Layout
- `assets/js/ksu-ai-client.js` — Smart Visual Observer modal & `renderVisionResults` action bar (`lines 2968–2974`, `3631–3671`)
- `assets/css/core-theme.css` — KSUMC theme variables & button tokens (read-only reference)
- `field.html`, `quality.html`, `head.html`, `dashboard.html` — Portal HTML shells loading `ksu-ai-client.js` and Tailwind Play CDN
- `tools/test_standalone_dispatch.js` — Guided-vision dispatch tests (coupled assertions at `lines 121–131`)
- `tools/verify_all_guided_vision.js` — Guided-vision verification suite
- `tests/*.js` — Native `node --test` suites
