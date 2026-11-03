# Feature Specification: Project Review & Safety Platform Specification (RSD-ALSAQRI / KSUMC)

**Feature Branch**: `001-project-review-and-specification`  
**Created**: 2026-11-02  
**Status**: Draft  
**Input**: User description: "استخدم مهاره specify وقم بمراجعة مشروعي"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Field Inspection & Offline Operation (Priority: P1)

As a Safety & Fire Inspector conducting field rounds across King Saud University Medical City (KSUMC) buildings, basements, and plant rooms, I need to scan QR codes for safety assets (extinguishers, fire hose cabinets, FM200 systems, fire doors), execute standard safety checklists, record infractions with photographic proof, and have all records saved locally and synced automatically once connection is restored.

**Why this priority**:
This is the core operational function of the platform. Without field inspection recording and offline resilience in dead zones (basements, plant rooms), the system cannot fulfill its primary mission.

**Independent Test**:
Can be fully tested by launching the field portal (`field.html`), disconnecting the network (simulating an underground plant room), scanning an asset QR code, filling out a NFPA/CBAHI inspection checklist with an attached photo, reconnecting network, and verifying data sync to the central datastore.

**Acceptance Scenarios**:
1. **Given** an inspector is in an underground area without internet connectivity, **When** they scan a safety asset and submit an inspection round, **Then** the application caches the record in local storage / IndexedDB without errors and alerts the user that data will sync when online.
2. **Given** cached offline rounds exist on the device, **When** internet connectivity is re-established, **Then** the system automatically synchronizes the pending rounds to the central database without duplicating entries.
3. **Given** an invalid or unassigned asset barcode is scanned, **When** the camera parses the code, **Then** the application displays an immediate validation warning and prompts for manual asset identification or registration.

---

### User Story 2 - Shift Supervisor Verification & Approval Isolation (Priority: P2)

As a Shift Supervisor, I need to review rounds and safety incidents submitted by inspectors during my specific shift, endorse or request corrections on them, and sign off before escalation, ensuring supervisory segregation where supervisors only approve rounds belonging to their assigned shift.

**Why this priority**:
Ensures operational accountability and compliance with hospital accreditation requirements (CBAHI / JCI) requiring managerial oversight per shift.

**Independent Test**:
Can be fully tested by logging in as Supervisor Shift A, checking the pending approvals list, validating that only Shift A items can be signed off, while items from Shift B or C remain view-only or require department head elevation.

**Acceptance Scenarios**:
1. **Given** an inspector submits a round during Morning Shift (A), **When** the Morning Shift Supervisor accesses the portal, **Then** the round appears in their active approval queue with options to "Approve" or "Flag for Review".
2. **Given** an Evening Shift Supervisor attempts to approve a Morning Shift round, **When** they click approve, **Then** the system enforces shift isolation policy and prevents unauthorized approval, notifying them that only the designated shift supervisor or Department Head can approve it.

---

### User Story 3 - Safety Leadership & Quality Analytics (Priority: P3)

As the Head of Safety Department or Quality Auditor, I need real-time executive dashboards summarizing overall compliance rates across buildings, active safety alarms, open Corrective and Preventive Actions (CAPA), smoking violations, and exportable audit-ready reports matching CBAHI and JCI standards.

**Why this priority**:
Enables data-driven decision-making, executive reporting to university leadership, and immediate response to hospital accreditation audits.

**Independent Test**:
Can be tested by viewing `dashboard.html`, `head.html`, or `executive_report.html`, verifying real-time KPI updates (total assets inspected, overdue inspections, open CAPAs), and generating an executive PDF/print summary.

**Acceptance Scenarios**:
1. **Given** safety rounds and violations have been submitted across multiple hospital facilities, **When** the Head of Safety views the executive dashboard, **Then** all KPIs (compliance percentage, open violations, inspection coverage by facility) update in real-time.
2. **Given** an external auditor requests compliance evidence for NFPA fire doors, **When** filtering by standard and building, **Then** the system generates an audit trail with inspection history, timestamps, inspector identities, and photo evidence.

---

### User Story 4 - Administration & Master Asset Management (Priority: P4)

As a System Administrator, I need to manage users, assign shift schedules, register new safety assets (extinguishers, FM200 cylinders, doors, alarm zones), and configure notification thresholds.

**Why this priority**:
Provides foundational governance and data lifecycle management for system onboarding and maintenance.

**Independent Test**:
Can be tested via `admin.html` by creating a new inspector profile, assigning credentials and facility permissions, and confirming the user can authenticate and access authorized views.

**Acceptance Scenarios**:
1. **Given** an admin creates a new inspector profile, **When** the user details are submitted, **Then** the record is created with role-based attributes and is immediately available for authentication.
2. **Given** a new safety asset is added, **When** its details are registered, **Then** a unique QR code identifier is generated and ready for printing and physical installation.

---

### Edge Cases

- **Simultaneous Offline Edits**: What happens when two supervisors modify the same round status while offline?
- **Network Drops During Upload**: What happens when an inspector uploads high-resolution violation images over an unstable 3G/hospital Wi-Fi connection?
- **Corrupted LocalStorage**: How does the system handle browser cache purge or private browsing storage quota limits?
- **Clock Drift**: How does the system ensure tamper-proof timestamps if client device clock is altered?

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST operate as an installable Progressive Web App (PWA) with offline caching for core user journeys.
- **FR-002**: System MUST provide QR code camera scanning and manual barcode entry for all registered safety equipment.
- **FR-003**: System MUST support offline data capture and automated queue-based background synchronization upon network reconnection.
- **FR-004**: System MUST enforce role-based access control (Field Inspector, Shift Supervisor, Head of Safety, Quality Auditor, Administrator).
- **FR-005**: System MUST enforce shift-level approval isolation, ensuring supervisors can only approve rounds within their assigned shift.
- **FR-006**: System MUST maintain immutable audit logs for all safety violations, critical incident reports, and approval actions.
- **FR-007**: System MUST provide real-time updates across all connected portals (Inspector, Supervisor, Management, Quality).
- **FR-008**: System MUST support Corrective and Preventive Action (CAPA) tracking with severity, deadlines, and assigned remediators.
- **FR-009**: System MUST support dual execution profiles (Demonstration / Production environment switching).
- **FR-010**: System MUST enforce secure database write and read access controls authenticated by verified user identities.

### Key Entities

- **User**: Represents personnel within KSUMC Safety Department (ID, Employee Number, Full Name, Role, Shift, Assigned Facilities, Active Status).
- **Safety Asset**: Physical safety equipment (Asset Tag / QR Code, Equipment Type [Extinguisher, FHC, FM200, Fire Door, Alarm Zone], Facility, Building, Floor, Room, Maintenance Due Date, Status).
- **Inspection Round**: Field inspection session (Round ID, Inspector ID, Shift, Date, Timestamp, Asset Type, Checkpoints Checked, Pass/Fail Items, Defect Notes, Photos, Approval Status, Approved By).
- **Incident / Violation**: Recorded safety breach (Incident ID, Type [Smoking, Blocked Exit, Hazardous Storage, Faulty Equipment], Severity [Low, Medium, High, Critical], Location, Reporter, Media Attachments, Remediation Deadline).
- **CAPA Record**: Remediation task linked to violations or round defects (CAPA ID, Linked Incident/Round, Corrective Plan, Assigned Entity, Due Date, Closure Verification).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Inspectors can complete an asset inspection and submit findings in under 45 seconds per asset in normal operation.
- **SC-002**: 100% of offline inspections recorded without network access are synced without data loss once connection is restored.
- **SC-003**: Real-time status changes (e.g. critical alarm or incident report) propagate to supervisor and dashboard displays in under 2 seconds under standard network conditions.
- **SC-004**: System supports simultaneous usage across 200+ active field inspectors and supervisors across KSUMC facilities without UI latency or request timeouts.
- **SC-005**: 0% unauthorized approvals across different shifts (strict enforcement of shift isolation policy).
- **SC-006**: 95% or higher test and inspection compliance coverage for JCI/CBAHI accreditation audits.

---

## Assumptions

- Field inspectors are equipped with camera-enabled mobile or tablet devices supporting modern web standards (Chrome / Safari / Edge).
- The platform operates primarily within KSUMC hospital campus networks with fallback to cellular data.
- Assets are physically labeled with weather-resistant, scan-compatible QR codes.
- Historical data migration from legacy paper logs or SQLite databases is verified during initial commissioning.
