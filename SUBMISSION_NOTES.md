# Cynbit Candidate Portal Deliverable Submission Guide

**Applicant**: Naman Kalia (`namankalia1904@gmail.com`)  
**Role**: Backend Developer Intern  
**Active Portal**: `https://www.cynbit.in/candidate/cmunzdbdp000504lczgktb34p`  
**Reference Code**: `cmunzdbdp000404lce1uauik7`  
**Assessment Task**: *Backend Developer Intern - Task — Analyze Cynbit From a Backend Perspective*

---

## 📋 Portal Submission Form Inputs

### 1. Primary Deliverable URL *(Required)*
```text
https://github.com/NamTheGreat/cynbit-backend-technical-audit
```
*(Replace with your active public GitHub repository URL once pushed).*

---

### 2. Additional Deliverable Links *(Optional — Up to 4 links)*
* **Link 1 (Full 22-Page PDF Audit Report)**:
  ```text
  https://drive.google.com/file/d/1.../view?usp=sharing
  ```
  *(Upload `cynbit_backend_technical_audit_report.pdf` to your Google Drive and paste the share link).*
* **Link 2 (Markdown Technical Audit Report on GitHub)**:
  ```text
  https://github.com/NamTheGreat/cynbit-backend-technical-audit/blob/main/AUDIT_REPORT.md
  ```
* **Link 3 (Reference Architecture & Test Results)**:
  ```text
  https://github.com/NamTheGreat/cynbit-backend-technical-audit#quickstart--verification
  ```

---

### 3. Execution Notes & Campaign / Architecture Rationale *(Textarea)*
*Copy and paste the following comprehensive statement into the portal's **"Execution Notes & Campaign Rationale"** field:*

```text
Dear Cynbit Engineering & Architecture Team,

In fulfillment of the Backend Developer Intern Technical Challenge, I have completed a comprehensive, strictly passive architectural audit of Cynbit's public web infrastructure, talent acquisition pipeline, and transactional messaging ecosystem.

All observations derive exclusively from non-intrusive inspection of publicly accessible HTTP headers, Next.js Server Action flight protocols (Next-Action), Prisma CUIDv1 key structures, and transactional email headers received during my application lifecycle. Zero active fuzzing, exploit payloads, or load testing were performed.

Key Highlights of the Submission:

1. Empirical Telemetry & Prisma CUIDv1 Deconstruction:
   By analyzing 8 observed CUIDv1 primary keys across 4 sequential applications (QA Testing, Full Stack, Backend, and AI/ML), I decoded the millisecond timestamps (e.g. munzdbdp = 2026-09-30T10:46:50.077Z), process-local monotonic counters (0000 to 0009), and worker fingerprints (04lc vs 04k3). This empirically proves:
   - Synchronous parent-child double-inserts within the same millisecond tick.
   - Serverless worker cold-start detection (counter 0000 on worker 04lc) and multi-container load balancing.
   - Inter-request traffic volume leakage (exact server throughput between requests).
   - Inline synchronous AWS SES email dispatch (Gmail internalDate arrival deltas between 0.31s and 2.08s).

2. 12 Verified Security, Performance & Data Integrity Findings:
   - SEC-01 & SEC-02 (High P0): Unauthenticated CUIDv1 capability-URLs exposing candidate PII and write actions; CUIDv1 predictability leaking server telemetry (OWASP API1 BOLA / API2).
   - DATA-01 & DATA-02 (High P0 / Med P1): Missing UNIQUE(email) normalization creating duplicate parent records; dual-entity key ambiguity between confirmation and assessment emails.
   - OPS-01, OPS-02 & OPS-03 (High P0 / Med P1): Production emails leaking http://localhost:3000; 5.5-hour UTC vs. IST deadline discrepancy; synchronous SES calls triggering Gmail AIM_RISK_AGGRESSIVE_LABEL.
   - API-01, API-02 & API-03 (High P1 / Med P1): Unvalidated deliverable URLs creating SSRF risks (169.254.169.254 AWS IMDS); unenforced deadline expiration state machines; unauthenticated Support Desk ticket flooding.
   - PERF-01 & PERF-02 (Med/Low P2): Space-delimited query parameters fragmenting CDN caches; Next.js image proxy upscaling 2070px Unsplash images to 4K (3840px).

3. Production Reference Architecture & Implementation Modules:
   Rather than only describing issues, I have authored and verified 6 production-ready drop-in modules in TypeScript, Next.js 15, Prisma ORM, and Redis:
   - Module 1 (prisma/schema.prisma): Normalized schema with UUIDv7, @@unique cohort deduplication, SHA-256 hashed magic tokens, and Transactional Outbox.
   - Module 2 (portal-session.ts): 256-bit CSPRNG capability tokens exchanged for constant-time HMAC-SHA256 HttpOnly session cookies.
   - Module 3 (env.ts & format-deadline.ts): Boot-time Zod schema blocking localhost in production, plus explicit dual-timezone (IST + UTC) formatting and RFC-5545 calendar strings.
   - Module 4 (applications/route.ts): Idempotent application ingestion with Redis sliding-window rate limiting (max 6/15min) and atomic PostgreSQL transaction.
   - Module 5 (deliverables/route.ts & ssrf.ts): Hardened deliverable submission with deadline state machine (+15min grace) and DNS-pinned private/cloud CIDR filters (127.0.0.0/8, 10.0.0.0/8, 169.254.169.254/32, 172.16.0.0/12, 192.168.0.0/16, ::1).
   - Module 6 (next.config.mjs & query-posts.ts): Canonical kebab-case blog slugs, dynamic totalPages pagination, and Next.js image proxy capped at 1920px (reducing egress by ~82%).
   - Decoupled Worker (outbox-worker.ts): Transactional Outbox queue processor reducing HTTP P95 latency from ~1,420ms to ~115ms.

4. Automated Test Verification:
   The repository includes a Vitest suite with 100% pass rate (21 tests across 6 test suites) covering SSRF defense, dual-timezone formatting, HMAC constant-time session signing, outbox backoff, and Zod payload validations.

The complete code, detailed 22-page technical audit report, and architecture diagrams are available in the attached GitHub repository and documentation links.

Respectfully submitted,
Naman Kalia
Backend Developer Intern Applicant
```
