# Task List: Platform Hardening & Governance Improvements

**Feature Branch**: `001-project-review-and-specification`  
**Spec**: [spec.md](./spec.md)  
**Plan**: [plan.md](./plan.md)  
**Status**: Completed  
**Date**: 2026-11-02  

## Tasks

- [x] **Task 1: Spec-Kit Structure & Configuration Governance**
  - Consolidate `.specify/` configuration into workspace root.
  - Set `here: true` in `init-options.json`.
  - Maintain spec, plan, and checklist artifacts under `specs/001-project-review-and-specification/`.

- [x] **Task 2: Firebase Deployment & Hosting Security (`firebase.json`)**
  - Add ignore patterns for local SQLite databases (`**/*.db`, `**/*.sqlite*`).
  - Add ignore patterns for specifications (`specs/**`), `.specify/**`, `ARCHITECTURE.md`, `CHANGELOG.md`.
  - Validate `firebase.json` syntax.

- [x] **Task 3: Firebase Realtime Database Security Hardening (`database.rules.json`)**
  - Set root `.write: false` to disallow arbitrary collection creation and mass deletions.
  - Prevent plain credential leak (`!newData.hasChildren(['password'])`).
  - Enforce payload boundary limits (string length < 100 for identifiers) to prevent DoS injections.
  - Retain optimized indices across all operational nodes (`rounds`, `shift_incidents`, `users`, etc.).
  - Validate `database.rules.json` syntax.

- [x] **Task 4: Verification & Readiness Assessment**
  - Confirm all JSON configurations are syntactically valid.
  - Verify PWA and local routing compatibility.
