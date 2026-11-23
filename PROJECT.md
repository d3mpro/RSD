# Project: RSD Field Demo Sandbox & IT-Readiness Cleanup

## Architecture
The KSUMC RSD (الراصد) platform is a multi-portal web application served by `server.js` / Firebase Hosting:
1. **Authentication & Guards (`assets/js/auth-guard.js`, `index.html`)**:
   - `KSUAuth` manages user authentication, roles (`field_inspector`, `shift_supervisor`, `quality`, `head`, `admin`, `developer`), session storage, and per-portal `KSUAuth.protect(...)` guards.
2. **Field Inspector Portal (`field.html` + `assets/js/app.js`)**:
   - Mobile-first inspection portal for rounds, violations, alarms, permits, doors, CAPA, and safety reports.
3. **Sync & Data Layer**:
   - `assets/js/ksumc-data-bridge.js`: Local storage abstraction + SharePoint webhook (`syncToSharePoint`).
   - `assets/js/ksu-firebase-realtime.js`: Firebase Realtime Database bidirectional sync (`ksuFirebaseSync`).
   - `assets/js/ksu-integrations.js`: Audit trail & integration hooks.
4. **Oversight Portals**:
   - `quality.html`, `head.html`, `admin.html`, `dashboard.html`, `profile.html`.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Demo Account (`demo` / `demo`) Auth | Add `DEMO_USER` (`isDemoAccount: true`, `field_inspector`, `portal: 'field'`) in `auth-guard.js`; store session in `sessionStorage`; skip Firebase email/password auth in `index.html`; restrict `demo` to `field.html` only (`protect()` + `dashboard.html` + `profile.html`). | M1 | Survey 1 & 3 |
| 2 | Demo Storage Isolation & Sync Blocking | Isolate operational storage to `sessionStorage` (`demo_` prefix) in `ksumc-data-bridge.js` & `app.js`; block all `ksuFirebaseSync` inbound/outbound, `KSUDataBridge.syncToSharePoint`, `KSUOracleSync`, `KSUIntegrations.recordAuditTrail`, and `notifyCloudSync` when `isDemoUser()`; clear demo keys on logout/close. | M1 | Survey 1 & 3 |
| 3 | Field Portal Demo Mode UI | Display a clear, high-contrast Demo Mode banner/badge in `field.html`, update cloud status pill, hide/disable links to other portals, and skip SW background notification sync. | M1 | Survey 1 |
| 4 | Category A Safe Dead-Code Cleanup | Remove provably dead inline HTML functions (`field.html:4899-4909, 5358-5361`, `head.html:2555-2561`), hidden `#comprehensiveRoundsLogSection` (`head.html:834-931`), dead JS stubs (`app.js:16092-16094`, `ksu-nav-component.js:329-332`, `ksu-ai-client.js:38-39`), and 20 `console.log` debug leftovers. | M1 | Survey 2 |
| 5 | Automated Demo Isolation & Regression Tests | Add `tests/test_demo_account_isolation.test.js` and verify all 14 baseline passing test suites + syntax checks pass with zero regressions. | M1 | Survey 3 |
| 6 | Category B & Canceled Code Removal | Delete `accounts-credentials-a4.html`, `ksu-system-mode.js`, `ksu-share-service.js`, `sharek-pitch.html`, `executive_report.html`, `database.rules.strict.json`, `deploy-to-rsd-go-demo.*`, `deploy-test-rsd-pro.bat`; remove `QUICK_PERSONAS`/`#quick-access-section`, `openCloudArchiveHub()`, `switchUser()`, `rsd-go-demo` host/config refs, `sharek` routes/refs, hardcoded `apiKeyHeader` literal, and `Math.random()` in `syncWorkOrderToHospitalCMMS`. Keep `api.html` and `oracle-vision-agent/agent_server.js`. | M2 | CatB Survey 1-3 |
| 7 | Test Alignment & Full Verification | Update only tests/docs tied to removed features (`test_tier5_auth_shift_adversarial.test.js`, `test_demo_account_isolation.test.js`, `e2e_production_readiness.test.js`, `test_violations_isolation_and_archive.test.js`, `test_nav_role_gating.js`, `test_api_vault_and_silent_fallback.test.js`, `TEST_INFRA.md`, `TEST_READY.md`) and pass `node --check`, full test suite, Playwright portal smoke, and final forensic audit. | M2 | CatB Survey 3 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Demo Sandbox (`demo`/`demo`) + Category A Cleanup & Verification | `auth-guard.js`, `index.html`, `field.html`, `head.html`, `dashboard.html`, `quality.html`, `app.js`, `ksumc-data-bridge.js`, `ksu-firebase-realtime.js`, `ksu-integrations.js`, `ksu-nav-component.js`, `ksu-ai-client.js`, `ksu-cloud-sync.js`, `tests/test_demo_account_isolation.test.js` | none | DONE |
| M2 | Category B Cleanup, Canceled Code Removal & Full Verification | All Category B items (B1–B9, B11; keeping B10 `agent_server.js` & `api.html`), `sharek`/`rsd-go-demo`/`QUICK_PERSONAS` leftovers across HTML/JS/config/deploy scripts, coupled test/doc updates, and full verification | M1 | IN_PROGRESS |

---

## Interface Contracts
### `KSUAuth.isDemoUser(user)` (`assets/js/auth-guard.js`)
- Returns `true` iff `(user || this.getUser())?.isDemoAccount === true` or `username === 'demo'`.
- When `true`:
  - `KSUAuth.login(user)` writes `ksu_active_user` and `ksu_active_portal` to `sessionStorage` (and removes `ksu_active_user` from `localStorage`).
  - `KSUAuth.logout()` clears `sessionStorage` demo keys (`ksu_active_user`, `ksu_active_portal`, and all `demo_*` / `ksu_demo_*` keys).
  - `KSUAuth.protect(portalKey)` redirects to `field.html` for any `portalKey !== 'field'`.
  - `KSUAuth.saveUser` / `KSUAuth.updateUserProfile` are blocked and return `false`.

---

## Code Layout
- `assets/js/auth-guard.js`: Authentication, session management, role guards.
- `assets/js/ksumc-data-bridge.js`: Storage & SharePoint bridge.
- `assets/js/ksu-firebase-realtime.js`: Firebase RTDB sync engine.
- `assets/js/app.js`: Core portal state & persistence.
- `assets/js/ksu-integrations.js`: Audit trail & integrations.
- `field.html`, `index.html`, `head.html`, `quality.html`, `dashboard.html`: Portal pages.
- `tests/`: Native `node --test` + `node:vm` test suite.
