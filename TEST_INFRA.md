# E2E Test Infra: Oracle Vision Agent (الراصد البصري الذكي)

## Test Philosophy
- Opaque-box, requirement-driven testing. No dependency on private internal implementation details.
- Validates the complete pipeline: image orientation, API communication, prompt structuring, failure transparency, field camera capture, and quality oversight.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | EXIF Orientation & Image Preprocessing | PROJECT.md §F1 | 5 | 5 | ✓ | ✓ |
| 2 | Multimodal & Text Model Fallback | PROJECT.md §F2 | 5 | 5 | ✓ | ✓ |
| 3 | Backend Verification & Error Status | PROJECT.md §F3 | 5 | 5 | ✓ | ✓ |
| 4 | Client API Routing & Discovery | PROJECT.md §F4 | 5 | 5 | ✓ | ✓ |
| 5 | Adaptive Timeout & Transparent Failure Feedback | PROJECT.md §F5 | 5 | 5 | ✓ | ✓ |
| 6 | Cloud Key Management & Validation | PROJECT.md §F6 | 5 | 5 | ✓ | ✓ |
| 7 | Live Camera Stream & Reticle Overlay | PROJECT.md §F7 | 5 | 5 | ✓ | ✓ |
| 8 | Inspection Flow Control (No 350ms premature trigger) | PROJECT.md §F8 | 5 | 5 | ✓ | ✓ |
| 9 | Field Violation Modal Deduplication | PROJECT.md §F9 | 5 | 5 | ✓ | ✓ |
| 10 | Quality Portal Integration & Duty OCR | PROJECT.md §F10 | 5 | 5 | ✓ | ✓ |
| 11 | Impeccable UI/UX & Arabic Styling | PROJECT.md §F11 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Node.js built-in test runner (`node --test tests/e2e_oracle_vision.test.js`) and standalone verification scripts.
- **Pass/Fail Semantics**: Exit code 0 on all tests pass; non-zero on failure.
- **Mock / Emulation**: Multi-scenario payloads with genuine base64 images, rotation markers, network timeout simulations, and DOM event dispatching.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Field Inspector Capturing Obstructed Fire Exit on Mobile | F1, F5, F7, F8, F9, F11 | High |
| 2 | Inspector Analyzing Chemical Spill under Slow Network Conditions | F1, F3, F4, F5, F8 | High |
| 3 | Admin Reviewing Safety Violation in Quality Portal Inbox | F9, F10, F11 | Medium |
| 4 | Offline / Cloud-Starved Mode with Transparent Notice (No Fake Heuristic) | F3, F5, F6 | High |
| 5 | Quality Officer Uploading Monthly Duty Schedule for OCR | F6, F10 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (55 total)
- Tier 2: ≥5 boundary & corner test cases per feature (55 total)
- Tier 3: Pairwise coverage of major feature interactions (≥11 test cases)
- Tier 4: ≥5 realistic end-to-end application scenarios
- Total Target: ≥126 comprehensive E2E test cases
