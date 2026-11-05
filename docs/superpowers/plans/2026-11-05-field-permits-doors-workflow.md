# Field Permits, Doors Workflow & Portal Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove permit and door deletion buttons permanently from the field portal, redesign the hot work permit card to strictly match platform forms identity (including an official certified card modal), update the workflow for permits and door requests so they require zero approvals and are auto-approved into their respective archives upon inspector/supervisor issuance, and remove the "رفع التقارير" bento card from the field portal.

**Architecture:** Client-side HTML & JavaScript modifications across `field.html`, `assets/js/app.js`, and `assets/js/ksu-official-card.js`. Removal of deletion triggers from UI renders, updating lifecycle state defaults for permits and doors to `archived_approved`, upgrading the permit card DOM to use structured metadata chips, brand-compliant KSU palettes, and modal certification viewers.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, Tailwind CSS, Material Symbols Outlined, SVG QR generation.

**Spec:** Direct user requests with UI visual screenshots:
1. Permanently remove permit delete button in field portal.
2. Redesign permit card to match platform forms identity.
3. Permanently remove door opening request delete button in field portal.
4. Auto-approve and archive permits & door requests without pending quality / supervisor review.
5. Remove the "رفع التقارير" (Reports & PDF) bento card from `field.html`.

## Global Constraints

- No external dependency installation.
- Maintain documentation integrity and existing comments.
- Absolute RTL support and Arabic phrasing matching KSUMC official standards.
- Brand colors `#004B87` (Primary Blue), Amber-600/700 (Hot Work), Emerald-600/700 (Compliant/Approved).

## Review Focus

1. Deletion buttons must be completely absent from rendered HTML for permits and door requests.
2. Newly created permits must have status `ساري ومعتمد` and `qualityStatus: 'archived_approved'`.
3. Newly created door requests must have status `معتمد ومنفذ` and `qualityStatus: 'archived_approved'`.
4. The Bento grid in `field.html` must no longer display the "رفع التقارير" card.
5. The permit card must display clean metadata chips (contractor, location, fire watch, issuer, validity) without ugly raw string pipes, plus the "عرض كرت التصريح المعتمد 🛡️" action.

---

### Task 1: Remove "رفع التقارير" Bento Card from Field Portal

**Files:**
- Modify: `field.html:416-428`

**Interfaces:**
- Consumes: `field.html` Bento grid markup.
- Produces: Clean Bento grid without Card 8 ("رفع التقارير").

- [ ] **Step 1: Locate and remove Card 8 (رفع التقارير) from `field.html`**
Delete the container div for `switchMobileTab('reports')`:
```html
<!-- Card 8: Reports & PDF -->
<div onclick="switchMobileTab('reports')" class="ksu-bento-card border-indigo-200 ...">
  ...
</div>
```

- [ ] **Step 2: Verify HTML syntax and layout**
Verify the surrounding Bento cards in `field.html` remain intact and balanced.

---

### Task 2: Remove Delete Buttons & Update Workflows for Permits and Doors

**Files:**
- Modify: `assets/js/app.js:12510-12560` (renderPermitsList)
- Modify: `assets/js/app.js:12745-12775` (submitHotWorkPermit)
- Modify: `assets/js/app.js:13164-13202` (renderDoorsList)
- Modify: `assets/js/app.js:13303-13343` (saveNewDoorRequest)
- Modify: `assets/js/app.js:25440-25545` (renderQualityDoorsAndPermitsInbox)

**Interfaces:**
- Consumes: `state.permits`, `state.doors`, `savePermits()`, `saveDoors()`.
- Produces: Safe UI without delete actions; auto-approved status on creation.

- [ ] **Step 1: Update `renderDoorsList` in `assets/js/app.js`**
Remove `<button onclick="deleteDoorRequest('${d.id}')..."` completely from the card template. Ensure the status badge displays `معتمد ومنفذ` or `محفوظ في الأرشيف`.

- [ ] **Step 2: Update `saveNewDoorRequest` in `assets/js/app.js`**
Set:
- `status: 'معتمد ومنفذ'`
- `qualityStatus: 'archived_approved'`
- `routedTo: 'ARCHIVE'`
- `routedToTitle: 'أرشيف طلبات فتح الأبواب المعتمدة'`
- Toast: `تم توثيق طلب فتح الباب واعتماده فورياً وحفظه في أرشيف فتح الأبواب ✓`

- [ ] **Step 3: Update `submitHotWorkPermit` in `assets/js/app.js`**
Set:
- `status: 'ساري ومعتمد'`
- `qualityStatus: 'archived_approved'`
- `routedTo: 'ARCHIVE'`
- `routedToTitle: 'أرشيف التصاريح المعتمدة'`
- Toast: `تم إصدار تصريح العمل الساخن واعتماده فورياً وحفظه في أرشيف التصاريح المعتمدة ✓`

- [ ] **Step 4: Update `renderQualityDoorsAndPermitsInbox` in `assets/js/app.js`**
Ensure that archived doors and permits appear as approved & archived records rather than pending actionable inbox items.

---

### Task 3: Redesign Permit Card to Match Platform Forms Identity & Add Official Card Modal

**Files:**
- Modify: `assets/js/app.js:12505-12550` (renderPermitsList)
- Modify: `assets/js/ksu-official-card.js` (add `openOfficialPermitCardModal` and generator)

**Interfaces:**
- Consumes: `p` (permit object in `state.permits`).
- Produces: `renderPermitsList` template with structured metadata chips, official status badge, and trigger for `openOfficialPermitCardModal`.

- [ ] **Step 1: Implement `openOfficialPermitCardModal` in `assets/js/ksu-official-card.js`**
Add helper to generate and display the official certificate card for hot work permits matching the official KSU inspection cards (KSU logo, QR code, permit metadata table, checklist items summary, inspector & applicant signatures, official approval stamp).

- [ ] **Step 2: Redesign the card layout in `renderPermitsList` in `assets/js/app.js`**
Replace the unstyled text lines with:
- Warm amber/primary styled container with `border-r-4 border-r-amber-500 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs hover:shadow-md`.
- Header: Flame icon in amber rounded container, Work type, ID badge (`HWP-2026-xxx`), official green status badge (`معتمد ومسجل في الأرشيف ✓`), and digital signature badge.
- Structured metadata grid with Material Symbols:
  * Applicant/Contractor chip (`engineering`)
  * Location chip (`location_on`)
  * Fire Watch chip (`local_fire_department`)
  * Issuer/Inspector chip (`verified_user`)
  * Validity period chip (`schedule`)
- Action buttons:
  * `عرض كرت التصريح المعتمد 🛡️` (`openOfficialPermitCardModal('${p.id}')`)
  * `طباعة التصريح (PDF)` (`printHotWorkPermit('${p.id}')`)
  * `رمز التحقق QR` (`scanQRPermit('${p.id}')`)
  * ZERO delete button!

---

### Task 4: Verification and Quality Check

**Files:**
- Inspect: `field.html`, `assets/js/app.js`, `assets/js/ksu-official-card.js`

- [ ] **Step 1: Run browser syntax / node linting check on modified files**
- [ ] **Step 2: Verify git diff to ensure all 5 user requirements are strictly satisfied**
