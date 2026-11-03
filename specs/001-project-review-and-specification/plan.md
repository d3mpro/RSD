# Implementation Plan: Safety Platform Hardening & Quality Refactoring

**Branch**: `001-project-review-and-specification`  
**Spec**: [spec.md](./spec.md)  
**Status**: In Progress  
**Date**: 2026-11-02  

## 1. Executive Summary & Objective

Implement critical architectural, security, and performance enhancements for the **RSD-ALSAQRI / KSUMC** inspection and safety platform:
1. **Security & Deployment Hardening**: Update `firebase.json` ignore rules to protect internal databases, tools, specs, and scripts from accidental exposure.
2. **Database Integrity & Rule Hardening**: Refactor `database.rules.json` to enforce strict type checking, prevent root pollution, disallow unauthorized data purging, enforce field length bounds, and prohibit unhashed credential storage.
3. **PWA & Offline Performance Optimization**: Ensure all critical routes and schemas are guarded against data loss during disconnected underground rounds.
4. **Governance & Spec-Kit Alignment**: Anchor all ongoing and future enhancements within the native `.specify/` configuration.

---

## 2. Technical Architecture & Constraints

- **Stack**: Vanilla JS (ES6+), HTML5, Service Worker (PWA), Firebase Realtime Database, SQLite WAL (Oracle Linux).
- **Standards**: CBAHI (Central Board for Accreditation of Healthcare Institutions), JCI, NFPA 10/25/72/101.
- **Constraints**:
  - MUST NOT break offline-first operations for inspectors in dead zones.
  - MUST maintain backward compatibility with current field devices and supervisor portal sessions.
  - MUST preserve shift supervisor approval isolation.

---

## 3. Implementation Phases & Tasks

### Phase 1: Deployment & Hosting Security (`firebase.json`)
- [x] Add protection patterns for local SQLite databases (`**/*.db`, `**/*.sqlite*`).
- [x] Protect internal development specs, tools, and templates (`specs/**`, `.specify/**`, `test-*.js`).
- [x] Prevent leakage of internal architecture notes (`ARCHITECTURE.md`, `CHANGELOG.md`, `skills-lock.json`).

### Phase 2: Firebase Realtime Database Hardening (`database.rules.json`)
- [x] Restrict root level to known valid application nodes only.
- [x] Enforce `newData.exists()` across all operational tables to prevent mass-deletion attacks.
- [x] Add string-length boundaries to prevent payload injection and DoS.
- [x] Enforce mandatory schema validation on:
  - `rounds` (id, timestamp, status, inspector)
  - `users` & `ksumc_users` (prohibit plain `password` field)
  - `safety_violations` & `shift_incidents` (severity, location, reporter)
  - `capa_records` (dueDate, severity, status)
  - `system_status` & `notifications`
- [x] Optimize `.indexOn` for all query paths across portals.

### Phase 3: Verification & Integrity Testing
- [x] Validate JSON syntax of `firebase.json` and `database.rules.json`.
- [x] Verify local server routing (`server.js`).
- [x] Ensure no regression in field and dashboard portals.
