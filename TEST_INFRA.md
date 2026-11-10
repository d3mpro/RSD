# Test Infrastructure: KSUMC RSD Production Platform

## Overview
The KSUMC RSD Safety & Inspection Platform test harness provides zero-external-dependency automated testing powered by the Node.js native test runner (`node:test` and `node:assert/strict`).

The test suite exercises the system's progressive web application architecture, short username authentication, role-based access control (RBAC), multi-portal routing, shift isolation policies, 4-stage safety report lifecycle, CBAHI accreditation audits, and hospital emergency operations.

---

## Test Execution

### Primary E2E Production Readiness Suite
```bash
node --test tests/e2e_production_readiness.test.js
```

### Supporting Unit & Adversarial Suites
```bash
# Role gating & navigation test
node --test tests/test_nav_role_gating.js

# Standard FACP design & building selection
node --test tests/test_standard_facp_design.js

# Cloud archive & OneDrive backup bundle
node --test tests/test_cloud_archive_hub.js

# Adversarial hardening (Tier 5)
node --test tests/test_tier5_adversarial_hardening.test.js
```

### Combined Verification Command
```bash
node --test tests/test_standard_facp_design.js tests/test_nav_role_gating.js tests/test_tier5_adversarial_hardening.test.js tests/e2e_production_readiness.test.js
```

---

## Test Suite Architecture & Tier Breakdown

The test suite in `tests/e2e_production_readiness.test.js` is structured into 4 comprehensive tiers:

### Tier 1: Feature Coverage (Requirement Verification)
Covers core feature specifications, user roster restoration, and portal accessibility:
- **Tier 1.1**: Official Credentials Document (`accounts-credentials-a4.html`) integrity, Document Code `KSUMC-RSD-ACT-01`, unified PIN `123456`, and official personnel names.
- **Tier 1.2**: Short username authentication for all 14 field inspectors (`M1` through `M14`) with official names, shifts, and `/field.html` portal binding.
- **Tier 1.3**: Short username authentication for all 3 shift supervisors (`S1`, `S2`, `S3`) with shifts and `/field.html` portal binding.
- **Tier 1.4**: Short username authentication for leadership & supervision (`H1`, `H2`, `D1`, `Q1`, `DEV`) with official names and target portals.
- **Tier 1.5**: Role protection across portals (`KSUAuth.protect`) ensuring unauthorized roles are redirected to default portals.
- **Tier 1.6**: 14 CBAHI/NFPA inspection checklists structure, modal triggers, and form registry.
- **Tier 1.7**: Production hosting configuration (`firebase.json`, `deploy-to-firebase.sh`, and `sw.js` cache invalidation).
- **Tier 1.8**: Roster synchronization & bootstrap state parity across `index.html`, `app.js`, and `ksu-system-mode.js`.
- **Tier 1.9**: Inspector & supervisor session auto-binding in `field.html`.
- **Tier 1.10**: Production environment domain auto-switch targeting `https://rsd-ksu-default-rtdb.firebaseio.com`.

### Tier 2: Boundary & Corner Cases
Covers adversarial inputs, isolation policies, and database security rules:
- **Tier 2.1**: Authentication boundary cases: non-existent usernames (`M99`, `S9`, `H9`), invalid passwords, empty inputs, whitespace trimming, case-insensitivity (`m1` vs `M1`), and alternate aliases (`alsaqri`, `95972`, `admin`).
- **Tier 2.2**: Cross-shift supervisor approval matrix (`canSupervisorApproveRound`): strict enforcement ensuring Shift 1 supervisors cannot approve Shift 2 or 3 rounds, while general leadership maintains universal authority.
- **Tier 2.3**: Firebase passwordless cloud sync rule verification (`!newData.hasChildren(['password'])` in `database.rules.json` and client-side sanitization).

### Tier 3: Cross-Feature Interactions & Workflows
Covers end-to-end multi-actor state transitions:
- **Tier 3.1**: End-to-end inspection round workflow (`M1` creates -> `S1` approves -> `Q1` accredits as `approved_cbahi`).
- **Tier 3.2**: 4-stage safety department report lifecycle (`Field` -> `H1` -> `H2` -> `D1` approved and archived).
- **Tier 3.3**: Shift handover protocol between `S1` and `S2` with radio checks, key custody, and notification dispatch.
- **Tier 3.4**: Official door opening protocol with recipient signature, room numbers, and PDF generation.
- **Tier 3.5**: Hot work permits protocol with contractor info, fire watch assignment, and closure inspection.

### Tier 4: Real-World Scenarios & Hospital Workloads
Covers live operational simulations:
- **Tier 4.1**: KKUH hospital morning shift workload simulation with multiple checklists, violation logging, compliance scoring, and CAPA corrective action resolution.
- **Tier 4.2**: Hospital emergency code broadcast simulation for Code Red (fire/smoke) and elevator entrapment.

---

## Test Isolation & Sandboxing Methodology
1. **VM Isolation**: Tests run in clean Node.js `node:vm` contexts mimicking browser global scopes (`window`, `document`, `localStorage`, `sessionStorage`, `location`).
2. **Deterministic State**: Each test initializes its own isolated state and storage map, preventing state leakage or test execution order dependencies.
3. **Zero Facades**: All assertions inspect real exported methods, DOM templates, and JSON configurations. No mocks are used for business rules.
