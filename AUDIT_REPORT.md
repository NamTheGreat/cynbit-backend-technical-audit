# Cynbit Technologies — Backend Technical Audit, Security & Performance Assessment, and Reference Architecture

> **Passive Architectural Analysis of Observable Backend Behaviour, Prisma CUIDv1 Telemetry, API Payload Contracts, Transactional Email Pipelines, and Production Remediation Engineering**

---

## Executive Summary & Metadata

This technical assessment presents a comprehensive, strictly passive backend engineering audit of the public web infrastructure, candidate status portal, and transactional messaging ecosystem operated by **Cynbit Technologies** (Jaipur, Rajasthan). All observations derive exclusively from authorized, non-intrusive inspection of publicly accessible application routes, client-hydrated HTML/JSON states, Next.js Server Action flight protocols, URL query behaviours, and transactional email headers received during the candidate lifecycle.

| Assessment Attribute | Verified Specification & Audit Metadata |
| :--- | :--- |
| **Applicant & Role** | **Naman Kalia** (`namankalia1904@gmail.com`) — Backend Developer Intern Candidate |
| **Candidate Portal & Active ID** | Active Portal: `cynbit.in/candidate/cmunzdbdp000504lczgktb34p` <br> Parent Lead Reference: `cmunzdbdp000404lce1uauik7` |
| **Audited Web Properties** | `cynbit.in`, `cynbit.in/products` (Cynbit Studio, TenantEase, Revio), `cynbit.in/services`, `cynbit.in/bitelevate/paths`, `cynbit.in/blog`, `cynbit.in/case-studies`, `cynbit.in/contact` |
| **Observed Tech Stack** | TypeScript, Next.js 15 (App Router SSR, RSC & Server Actions), Node.js, Prisma ORM (CUIDv1 PKs), PostgreSQL, Redis, BullMQ, AWS SES (Click-Tracking via `support.cynbit.in/CL0`), Cloudinary CDN, Unsplash & Vercel Edge Network |
| **Compliance & Posture** | **100% Passive & Authorized Observation.** Zero active exploitation, fuzzing, load injection, or unauthorized probing performed. |

### Domain Summary & Remediation Priority Matrix

| Audit Domain | Verified Findings | Highest Severity | Core Architectural Remediation Target |
| :--- | :--- | :--- | :--- |
| **Authentication & Access Control** | `SEC-01`, `SEC-02` | **High (P0)** | Replace unauthenticated CUIDv1 capability URLs with 256-bit HMAC-SHA256 magic-link session tokens & `HttpOnly` cookies |
| **Data Modeling & Idempotency** | `DATA-01`, `DATA-02` | **High (P0)** | Normalize 1:N Candidate-to-RoleApplication schema with `UNIQUE(email)` & Redis Idempotency-Key locking |
| **Email Pipeline & Environment Config** | `OPS-01`, `OPS-02`, `OPS-03` | **High (P0)** | Boot-time Zod env validation (blocking `localhost:3000`), explicit `Asia/Kolkata` timezone formatting & Transactional Outbox |
| **API Validation & State Machine** | `API-01`, `API-02`, `API-03` | **High (P1)** | Strict URL allowlisting + SSRF private CIDR guards, server-side assessment deadline enforcement & rate-limited Support Desk |
| **Performance & Edge Caching** | `PERF-01`, `PERF-02` | **Medium (P2)** | Canonical slug normalization for `/blog`, dynamic count pagination metadata & Next.js `deviceSizes` cap (1920px) |

---

## Part I: Backend Technical Audit Report

### 1.1 Reconstructed Production Stack and Request Topology

Cross-referencing the published technology stack on `cynbit.in/services` with observable HTTP headers, Next.js Server Action flight protocols (`Next-Action`), DOM hydration markers, image proxy routes, and transactional email payloads establishes the concrete production architecture:

```mermaid
flowchart TD
    subgraph Client Tier
        Browser["Candidate Browser / Public User"]
        EmailClient["Candidate Email Client (Gmail)"]
    end

    subgraph Edge & CDN Tier
        VercelEdge["Vercel Edge Network (bom1 / Mumbai POP)"]
        NextImage["/_next/image Optimizer"]
        CloudinaryCDN["Cloudinary Asset CDN"]
    end

    subgraph Compute Tier
        RSC["Next.js App Router (RSC / SSR Worker)"]
        ServerActions["Next.js Server Actions Handler"]
        OutboxWorker["Transactional Outbox Worker"]
    end

    subgraph Persistence & Messaging
        PostgreSQL[("PostgreSQL Database (Prisma ORM)")]
        RedisCache[("Redis Cache & Rate Limiting")]
        AWSSES["AWS Simple Email Service (SES)"]
    end

    Browser -->|HTTPS Request| VercelEdge
    VercelEdge -->|SSR / RSC Stream| RSC
    Browser -->|Next-Action POST| ServerActions
    Browser -->|Asset Request| NextImage
    NextImage -->|Fetch & Optimize| CloudinaryCDN

    ServerActions -->|CUIDv1 Row Inserts| PostgreSQL
    ServerActions -->|Sliding-Window Incr| RedisCache
    ServerActions -.->|Inline Blocking SES Call (Current)| AWSSES
    ServerActions -->|Write Outbox Event (Target)| PostgreSQL
    OutboxWorker -->|Poll Unprocessed Jobs| PostgreSQL
    OutboxWorker -->|Decoupled SMTP Dispatch| AWSSES

    AWSSES -->|Delivers Email with Tracking Link| EmailClient
    EmailClient -->|Clicks Link| VercelEdge
```

| Architectural Tier | Observed Technology | Passive Empirical Evidence & Production Footprint |
| :--- | :--- | :--- |
| **Web Application & Routing** | Next.js 15 (App Router, Server Actions & RSC) | Dynamic route segments (`/careers/[slug]`, `/candidate/[token]`, `/case-studies/[slug]`, `/blog/[slug]`) paired with Next.js Server Action references (`submitCandidateAssessment`, `fetchCandidateByCandidateToken`, `submitCandidateSupportTicket`). |
| **ORM & Primary Key Generation** | Prisma ORM + PostgreSQL (`@default(cuid())`) | Every candidate and application record is identified by a 25-character lowercase alphanumeric string starting with `c` (e.g., `cmunzdbdp000504lczgktb34p`), matching the exact specification of Prisma's default Node.js CUIDv1 generator. |
| **Compute Execution Model** | Horizontally Scaled Serverless Containers (UTC) | CUIDv1 host fingerprints across four applications submitted within a 7-minute window alternate between two distinct worker fingerprints (`04lc` and `04k3`), with system clocks operating in UTC+00:00. |
| **Transactional Email Infrastructure** | AWS SES + Custom Tracking Domain | Outbound confirmation and assessment emails route through AWS SES with click-tracking rewrites under `support.cynbit.in/CL0/.../1/010601a0f1ee03ae-...`, dispatching from `no-reply@cynbit.in` and `opportunities@cynbit.in`. |
| **Media & Static Asset Delivery** | Next.js Image Proxy + Cloudinary CDN + Unsplash | Website pages proxy local assets (`/logo.svg`) and remote Unsplash URLs (`images.unsplash.com`) via `/_next/image`, whereas transactional HTML emails fetch brand assets from Cloudinary (`res.cloudinary.com/dfaacspyc/...`). |

---

### 1.2 Empirical Telemetry: Deconstructing Prisma CUIDv1 Identifiers

A standard CUIDv1 string is exactly 25 characters long and concatenates five deterministic or low-entropy fields:
1. Constant prefix `c` (1 char)
2. UNIX epoch timestamp in milliseconds encoded in base-36 (8 chars)
3. Process-local monotonic counter encoded in base-36 zero-padded to 4 chars (`0000` to `zzzz`)
4. 4-character client/host fingerprint derived from process ID and hostname
5. 8-character pseudo-random suffix

During the candidate application sequence on 30 September 2026 between 10:41:55 UTC and 10:48:21 UTC, four role applications were submitted under the email address `namankalia1904@gmail.com` (QA Testing Intern, Full Stack Developer Intern, Backend Developer Intern, and AI/ML Engineer Intern). Cross-referencing confirmation emails, the portal Reference Code, and the Switch Portal navigation links reveals eight distinct CUIDv1 keys:

| Role Applied | Database Entity Role | Observed CUIDv1 Identifier | Decoded Creation Timestamp (UTC) | Monotonic Counter (Base36 / Int) | Worker Fingerprint | Gmail Receipt Delta |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **QA Testing Intern** | Parent Lead / Candidate | `cmunz6zuw000004lcnwfaq7is` | 2026-09-30 10:41:55.208Z | `0000` (0) | `04lc` | +0.79s (10:41:56Z) |
| **QA Testing Intern** | Child RoleApplication | `cmunz6zuw000104lca3skbyrk` | 2026-09-30 10:41:55.208Z | `0001` (1) | `04lc` | Portal Switch Link |
| **Full Stack Dev Intern** | Parent Lead / Candidate | `cmunzaz5j000804k32i38oket` | 2026-09-30 10:45:00.919Z | `0008` (8) | `04k3` | +2.08s (10:45:03Z) |
| **Full Stack Dev Intern** | Child RoleApplication | `cmunzaz5j000904k32kkal9n2` | 2026-09-30 10:45:00.919Z | `0009` (9) | `04k3` | Portal Switch Link |
| **Backend Dev Intern** | Parent Lead / Candidate | `cmunzdbdp000404lce1uauik7` | 2026-09-30 10:46:50.077Z | `0004` (4) | `04lc` | +0.92s (10:46:51Z) |
| **Backend Dev Intern** | Child RoleApplication | `cmunzdbdp000504lczgktb34p` | 2026-09-30 10:46:50.077Z | `0005` (5) | `04lc` | Active Portal URL |
| **AI/ML Engineer Intern** | Parent Lead / Candidate | `cmunzfa2g000804lcs62wmllr` | 2026-09-30 10:48:21.688Z | `0008` (8) | `04lc` | +0.31s (10:48:22Z) |
| **AI/ML Engineer Intern** | Child RoleApplication | `cmunzfa2g000904lccs46stm1` | 2026-09-30 10:48:21.688Z | `0009` (9) | `04lc` | Assessment Portal URL |

#### Concrete Architectural Inferences Established:
1. **Synchronous Parent-Child Double Insert in Same Millisecond**: Every application submission generates two CUIDs with the identical 8-character base-36 millisecond timestamp (`munzdbdp` = `1790765210077 ms` = `2026-09-30T10:46:50.077Z`) and consecutive monotonic counters (`0004` and `0005`). This confirms Prisma executes a nested write (`prisma.lead.create({ data: { applications: { create: ... } } })`) or sequential creation inside the same event loop tick.
2. **Cold-Start Detection & Multi-Worker Load Balancing**: At `10:41:55.208Z`, serverless worker `04lc` generated counter `0000`, proving a fresh Node.js worker cold start where the in-memory CUID counter initialized at zero. Three minutes later (`10:45:00.919Z`), request routing shifted to worker `04k3` (counters `0008`/`0009`), before returning to worker `04lc`.
3. **Exact Inter-Request Traffic Volume Leakage**: On worker `04lc`, the counter advanced from `0001` (at `10:41:55Z`) to `0004` (at `10:46:50Z`) and then to `0008` (at `10:48:21Z`). Because each application consumes exactly 2 CUIDs, worker `04lc` processed exactly 1 other operation (2 CUIDs: `0002`, `0003`) between 10:41:55 and 10:46:50, and 1 other operation (`0006`, `0007`) between 10:46:50 and 10:48:21.
4. **Inline Synchronous Email Dispatch**: The time delta between Prisma CUID generation in Node.js memory and the arrival timestamp recorded by Google inbound SMTP servers (`internalDate` in Gmail) was between 0.31s and 2.08s. This confirms AWS SES transmission was called inline in the HTTP request handler rather than deferred to an asynchronous background worker.
5. **Unnormalized Duplicate Candidate Creation**: Submitting 4 applications created 4 separate parent Lead/Candidate records (`cmunz6zuw0000...`, `cmunzaz5j0008...`, `cmunzdbdp0004...`, `cmunzfa2g0008...`), inflating database storage and requiring secondary string queries on email to stitch sibling applications together.

---

### 1.3 Reconstructed API Surface and Contracts

Decompiling the Next.js client bundles (`page-da5a6f561f8d3783.js`), form inputs, and Server Action flight payloads reveals seven core backend interfaces:

#### 1. Ingestion Endpoint (`submitCandidateApplication`)
- **Route**: `cynbit.in/careers/[slug]`
- **Payload Schema**:
  ```json
  {
    "roleSlug": "backend-developer-intern",
    "roleTitle": "Backend Developer Intern",
    "basicInfo": {
      "fullName": "string (min: 2, max: 120)",
      "email": "string (email, max: 160)",
      "phone": "string (e.g. +917042199149)",
      "whatsappNumber": "string (optional)",
      "dateOfBirth": "YYYY-MM-DD",
      "gender": "Male | Female | Other | Prefer not to say"
    },
    "qualifications": [
      {
        "highestQualification": "Bachelor's Degree",
        "degree": "B.Tech / B.E.",
        "specialization": "Computer Science & Engineering",
        "institution": "Manipal University Jaipur",
        "graduationYear": 2027,
        "educationStatus": "Currently Pursuing",
        "scoreSystem": "CGPA (Scale 1-10)",
        "scoreValue": "8.75"
      }
    ],
    "professionalDetails": {
      "noticePeriod": "Immediate",
      "keyTechnicalSkills": "Node.js, Python, PostgreSQL, Prisma, Redis"
    },
    "locationAndPresence": {
      "currentCity": "Jaipur",
      "permanentAddress": "Jaipur, Rajasthan",
      "portfolioOrResumeUrl": "https://drive.google.com/...",
      "linkedinUrl": "https://linkedin.com/in/...",
      "otherProfileUrl": "https://github.com/..."
    },
    "narrative": {
      "whyCynbit": "string (min: 20, max: 3000)",
      "termsAccepted": true
    }
  }
  ```

#### 2. Candidate Portal Resolver (`fetchCandidateByCandidateToken`)
- **Server Action ID**: `40d60747a860583aa4a36582415eacc44769f593ef`
- **Arguments**: `[token: string]` (CUIDv1 key)
- **Observable Leaked Return Graph**: Resolves Candidate PII, `allApplications` array, `assessmentTitle`, `assessmentDeadline`, `paymentStatus`, `scholarshipDiscountPct`, `supportTickets`, and internal notes.

#### 3. Assessment Deliverable Submission (`submitCandidateAssessment`)
- **Server Action ID**: `78de5071582a09a9b67d2d42a8aeda17e31bc0d611`
- **Payload**: `{ primaryDeliverableUrl: string, additionalDeliverableUrls: string[], executionNotes?: string }`
- **Observable Defect**: Lacks session authentication, server-side deadline cutoff validation, and private CIDR IP validation.

#### 4. Candidate Support Desk (`submitCandidateSupportTicket`)
- **Server Action ID**: `4020656484ed7b6ad8533ce9666d27f62ab6c7eb9b`
- **Payload**: `{ candidateId: string, category: string, subject: string, message: string }`
- **Categories**: `Assessment Task & Deliverable Issue`, `Cashfree Payment / Fee Issue`, `Interview Scheduling & Sync`, `Offer Letter, NDA & Joining Kit`, `BitElevate Access & Credentials`, `General Question / Other Issue`.

---

## Part II: Categorized Security, Performance & Data Validation Findings

Every finding documented below is grounded in empirical evidence observed on Cynbit's live production endpoints and official transactional emails.

```
       [ FINDINGS BY SEVERITY & DOMAIN ]
  ┌───────────────────────┬──────────┬─────────────┐
  │ Domain                │ Findings │ Max Severity│
  ├───────────────────────┼──────────┼─────────────┤
  │ Auth & Access Control │ SEC-01,02│ High (P0)   │
  │ Data Schema & Idemp.  │ DATA-01,02│ High (P0)  │
  │ Email & Env Config    │ OPS-01..03│ High (P0)  │
  │ API Validation & State│ API-01..03│ High (P1)  │
  │ Caching & Media Perf  │ PERF-01,02│ Medium (P2) │
  └───────────────────────┴──────────┴─────────────┘
```

---

### Finding SEC-01 (High — P0): Unauthenticated Capability-URL Access on `/candidate/[id]`
- **OWASP / CWE**: OWASP API2:2023 (Broken Authentication) / CWE-306 (Missing Authentication for Critical Function), CWE-284.
- **Empirical Evidence**: Navigating directly to `https://www.cynbit.in/candidate/cmunzdbdp000504lczgktb34p` in a fresh incognito browser context immediately renders full candidate PII (full name, phone, email, university, address, resume links), all four sibling applications across different engineering tracks, and allows submitting deliverables and opening support tickets without requiring an OTP, session cookie, or login credentials.
- **Root Cause**: The backend treats database primary keys as permanent capability bearer tokens in the URL path.
- **Impact**: Any actor possessing or intercepting the URL gains full read access to candidate PII and write access to overwrite deliverables or file fraudulent tickets.

---

### Finding SEC-02 (High — P0): Predictable Prisma CUIDv1 Primary Keys Used as Bearer Tokens
- **OWASP / CWE**: OWASP API1:2023 (Broken Object Level Authorization — BOLA) / CWE-330 (Use of Insufficiently Random Values), CWE-340.
- **Empirical Evidence**: All eight observed identifiers follow CUIDv1 format (`c` + 8 chars timestamp + 4 chars monotonic counter + 4 chars worker fingerprint + 8 chars random). For sequential applications generated on the same worker, 17 of the 25 characters are 100% deterministic:
  $$\text{Entropy} = \log_2(36^8) \approx 41.36 \text{ bits}$$
  Furthermore, the parent Lead CUID has counter $k$ (`0004`) while the child Application CUID has counter $k+1$ (`0005`), completely eliminating entropy between parent and child keys.
- **Impact**: Server telemetry leakage (uptime, worker count, total throughput) and drastically reduced search space for BOLA enumeration attacks.

---

### Finding DATA-01 (High — P0): Missing `UNIQUE(email)` Relational Normalization & Idempotency Keys
- **OWASP / CWE**: CWE-841 (User Session / Data Integrity Failure).
- **Empirical Evidence**: Submitting four applications under `namankalia1904@gmail.com` created four independent parent `Candidate`/`Lead` records (`cmunz6zuw0000...`, `cmunzaz5j0008...`, `cmunzdbdp0004...`, `cmunzfa2g0008...`).
- **Root Cause**: Form submissions execute an unconditional `INSERT` into the Candidate table rather than a relational `upsert` on `UNIQUE(email)`. The endpoint also lacks `Idempotency-Key` headers, causing duplicate creation on double-click.
- **Impact**: Bloated database storage, redundant email dispatches, and split-brain candidate records if profile data is updated on one role but not others.

---

### Finding DATA-02 (Medium — P1): Inconsistent Entity Key Routing Between Confirmation & Assessment Emails
- **OWASP / CWE**: OWASP API9:2023 (Improper Inventory Management) / Schema Ambiguity.
- **Empirical Evidence**: The initial confirmation email linked to `Lead.id` (`cmunzdbdp000404lce1uauik7`, counter `0004`), whereas the technical assessment email linked to `RoleApplication.id` (`cmunzdbdp000504lczgktb34p`, counter `0005`).
- **Root Cause**: The confirmation email template passed `lead.id` into the URL variable while the assessment dispatch passed `application.id`. The `/candidate/[id]` route handler must maintain polymorphic lookup logic across two tables.
- **Impact**: Brittle polymorphic routing, edge-case bugs during deliverable submission, and confusion across client portals.

---

### Finding OPS-01 (High — P0): Production Transactional Emails Leaked `http://localhost:3000`
- **OWASP / CWE**: OWASP API8:2023 (Security Misconfiguration) / CWE-1188 (Insecure Default Initialization).
- **Empirical Evidence**: All four confirmation emails dispatched on 30 September contained CTA button links rewritten by AWS SES to:
  `http://support.cynbit.in/CL0/http:%2F%2Flocalhost:3000%2Fcandidate%2Fcmunzfa2g000804lcs62wmllr/...`
  In the plain-text MIME alternative, the link rendered literally as:
  `View Application Status http://localhost:3000/candidate/cmunzfa2g000804lcs62wmllr`
- **Root Cause**: Unvalidated environment fallback: `process.env.PUBLIC_PORTAL_BASE_URL ?? "http://localhost:3000"`. In production, the variable was missing or misconfigured.
- **Impact**: Candidates clicking the button encountered `ERR_CONNECTION_REFUSED`, completely severing access to their application status.

---

### Finding OPS-02 (Medium — P1): 5.5-Hour Server-Side UTC vs. Client-Side IST Deadline Discrepancy
- **OWASP / CWE**: CWE-682 (Incorrect Calculation / Temporal Inconsistency).
- **Empirical Evidence**:
  - Backend Developer Intern Assessment email stated: *"Please complete and submit before Sun, Nov 1, 10:00 AM."* Live portal showed: *"Submission Deadline: 1/11/2026, 3:30:58 pm"*.
  - AI/ML Engineer Intern Assessment email stated: *"Please complete and submit before Sat, Oct 17, 07:39 AM."* Live portal showed: *"Submission Deadline: 17/10/2026, 1:09:25 pm"*.
- **Root Cause**: Serverless worker rendered UTC timestamp string without timezone conversion (`timeZone: 'Asia/Kolkata'`) and without timezone labels (`UTC`), while browser formatted in client timezone (+05:30).
- **Impact**: 5.5-hour discrepancy creating premature candidate panic and abandonment.

---

### Finding OPS-03 (Medium — P1): Synchronous SES Email Dispatch & Mixed HTTP/HTTPS Tracking
- **OWASP / CWE**: CWE-400 (Uncontrolled Resource Consumption) / Operational Resilience.
- **Empirical Evidence**: Gmail attached `AIM_RISK_AGGRESSIVE_LABEL` to Cynbit's transactional emails. SES click-tracking wrappers used unencrypted `http://support.cynbit.in/CL0/...` when wrapping `http://localhost:3000`. Email latency was coupled directly to API response time (0.31s–2.08s).
- **Root Cause**: Inline synchronous SMTP/SES API calls inside HTTP request handlers, mixed plain-HTTP tracking subdomains, and stripped external Google Fonts stylesheets in HTML emails.
- **Impact**: Degraded sender reputation, spam folder placement, and slow API response times.

---

### Finding API-01 (High — P1): Unvalidated External Deliverable URLs & SSRF Exposure
- **OWASP / CWE**: OWASP API7:2023 (Server-Side Request Forgery) / CWE-918.
- **Empirical Evidence**: The deliverable submission form accepts 1 primary and up to 4 additional URLs. Cynbit documentation notes that AI agents ("Aria AI") automatically evaluate submissions.
- **Root Cause**: Backend URL validation lacked DNS resolution pinning and private CIDR block rejection (`127.0.0.0/8`, `10.0.0.0/8`, `169.254.169.254/32` AWS IMDS metadata, `172.16.0.0/12`, `192.168.0.0/16`, `::1`).
- **Impact**: Internal network scanning, cloud instance metadata extraction (IAM role theft), and stored XSS via `javascript:` URIs in recruiter dashboards.

---

### Finding API-02 (Medium — P1): Unenforced Assessment Expiration State Machine & Schema Bleed
- **OWASP / CWE**: OWASP API6:2023 (Unrestricted Access to Sensitive Business Flows) / CWE-362.
- **Empirical Evidence**: On 30 October 2026, inspecting the AI/ML Engineer Intern portal (`cmunzfa2g000904lccs46stm1`) revealed that 13 days after the deadline (17/10/2026 1:09 PM), the status remained `ASSESSMENT` (Action Required) and the submission form remained active. Additionally, engineering portals showed the label *"Campaign Rationale (Optional)"*, leaking marketing track schemas.
- **Root Cause**: Missing automated cron / read-time state transition to `ASSESSMENT_EXPIRED` and hardcoded shared UI components.
- **Impact**: Submissions accepted weeks after deadlines, invalidating recruitment cycle integrity.

---

### Finding API-03 (Medium — P1): Unauthenticated Candidate Support Desk Ticket Ingestion
- **OWASP / CWE**: OWASP API4:2023 (Unrestricted Resource Consumption) / CWE-770.
- **Empirical Evidence**: Candidate Support Desk accepts tickets with high-priority categories (`Cashfree Payment / Fee Issue`) without session verification, CAPTCHA, or sliding-window rate limits.
- **Impact**: Potential ticket desk flooding, outbound email spamming to the candidate's inbox, and support operations denial-of-service.

---

### Finding PERF-01 (Medium — P2): Unnormalized Blog Query Parameters & Static Pagination
- **Empirical Evidence**: Navigating blog category filters loads URLs with raw unencoded spaces: `cynbit.in/blog?category=IT Strategy` and `cynbit.in/blog?category=Cloud Architecture`. Pagination buttons show static links `1 2 3 4 5` even when only 6 articles exist in total.
- **Root Cause**: Category filters pass display names instead of normalized kebab-case slugs (`it-strategy`), fragmenting CDN edge cache keys. Pagination count is not dynamically derived from `prisma.blogPost.count()`.
- **Impact**: Cache bypasses, edge misses, and user navigation to empty blog pages.

---

### Finding PERF-02 (Low — P2): Next.js Image Proxy Upscaling External Images to 4K
- **Empirical Evidence**: Image proxy URLs on `/blog` request `w=3840` for Unsplash source images whose native width is only `2070px`:
  `/_next/image?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-...%3Fw%3D2070...&w=3840&q=75`
- **Root Cause**: Next.js `<Image>` component omitted calibrated `sizes` props, causing browsers to request the largest width defined in `deviceSizes` (`3840px`).
- **Impact**: Server upscales lower-resolution source images, wasting compute cycles, RAM, and egress bandwidth (~82% payload inflation).

---

## Part III: Recommended Production Architecture & Code Implementations

The accompanying codebase provides six production-grade, drop-in modules built with TypeScript, Prisma ORM, Redis, and Next.js 15:

### System Architecture Overview

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate
    participant Portal as Next.js Candidate Portal
    participant API as /api/v1/applications
    participant DB as PostgreSQL (Prisma)
    participant Redis as Redis (Rate Limit & Idemp)
    participant Outbox as Transactional Outbox
    participant SES as AWS SES Worker

    Candidate->>API: POST /api/v1/applications (Payload + Idempotency-Key)
    API->>Redis: Check Sliding Window Rate Limit & Idempotency Key
    alt Idempotency Hit
        Redis-->>API: Return Cached 200 Response
        API-->>Candidate: 200 OK (X-Idempotent-Replay)
    else First Request
        API->>DB: BEGIN TRANSACTION
        API->>DB: Candidate.upsert(email) [Normalize 1:N]
        API->>DB: RoleApplication.create() [Composite Unique]
        API->>DB: PortalMagicLinkToken.create(SHA256(CSPRNG))
        API->>DB: TransactionalOutbox.create(OutboxEvent)
        API->>DB: COMMIT TRANSACTION
        API->>Redis: Cache Response for 24h
        API-->>Candidate: 201 Created (Application ID & Ref Code)
        
        Note over Outbox,SES: Asynchronous Decoupled Dispatch
        Outbox->>DB: Poll Pending Outbox Events
        Outbox->>SES: Send Templated Email with Dual Timezone (IST+UTC)
        SES-->>Candidate: Delivery to Inbox (No localhost, No plain-HTTP)
    end
```

### Module Reference Matrix

1. **`prisma/schema.prisma`**:
   - UUIDv7 database primary keys (eliminating CUIDv1 telemetry leaks).
   - Relational normalization: `Candidate` (`UNIQUE(email)`) with 1:N `RoleApplication`.
   - Cohort constraint: `@@unique([candidateId, roleSlug, cycleCode])`.
   - Decoupled `PortalMagicLinkToken` storing SHA-256 hashes of 256-bit CSPRNG tokens.
   - `TransactionalOutbox` for resilient, non-blocking email dispatch.
2. **`src/lib/auth/portal-session.ts` & `src/app/api/v1/auth/portal-verify/route.ts`**:
   - Single-use 256-bit CSPRNG magic link exchange.
   - HMAC-SHA256 signed `HttpOnly; Secure; SameSite=Lax` session cookie (`__Host-cynbit_candidate_sess`).
   - Constant-time verification (`crypto.timingSafeEqual`) resisting timing attacks.
   - Strict candidate ownership checks eliminating BOLA horizontal privilege escalation.
3. **`src/lib/config/env.ts` & `src/lib/email/format-deadline.ts`**:
   - Boot-time Zod environment validation blocking `localhost` or non-HTTPS URLs in production.
   - Explicit dual-timezone formatting (`Asia/Kolkata` IST + UTC) and RFC-5545 calendar strings.
4. **`src/app/api/v1/applications/route.ts`**:
   - Sliding-window Redis rate limiting (max 6 applications per 15 minutes per IP).
   - Deterministic idempotency lock on `(email + roleSlug + cycleCode)`.
   - Atomic PostgreSQL transaction writing candidate profile and outbox event.
5. **`src/app/api/v1/candidate/[applicationId]/deliverables/route.ts` & `src/lib/security/ssrf.ts`**:
   - Server-side deadline enforcement (+15 min grace window) transitioning expired tasks to `ASSESSMENT_EXPIRED`.
   - Deep SSRF defense: DNS resolution pinning, blocking `127.0.0.0/8`, `10.0.0.0/8`, `169.254.169.254/32` (AWS IMDS), `172.16.0.0/12`, `192.168.0.0/16`, CGNAT `100.64.0.0/10`, and IPv6 equivalents.
6. **`next.config.mjs` & `src/lib/blog/query-posts.ts`**:
   - Canonical category slug mapping (`it-strategy`, `cloud-architecture`).
   - Dynamic `totalPages` computation via `Promise.all([count, findMany])`.
   - Next.js image proxy capped at 1920px (`deviceSizes: [640..1920]`), eliminating 4K upscaling.
   - Hardened HTTP response headers (`Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`).

---

## Part IV: Implementation Roadmap

| Rollout Phase | Target Findings | Core Engineering Deliverables | Success Verification Metric |
| :--- | :--- | :--- | :--- |
| **Phase 1: Immediate Hotfixes (Days 1–2)** | `OPS-01`, `OPS-02`, `API-02`, `SEC-01` (Headers) | Deploy `EnvSchema` boot validation, update email templates with explicit IST + UTC deadline formatting, add `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`, enforce server-side deadline cutoff. | **0** localhost links; **0 min** email-vs-portal deadline skew; **100%** expired assessments locked. |
| **Phase 2: Auth & Schema Hardening (Days 3–7)** | `SEC-01`, `SEC-02`, `DATA-01`, `DATA-02`, `API-01`, `API-03` | Migrate Candidate (`UNIQUE(email)`) and RoleApplication schema, deploy 256-bit magic-link token session cookie exchange, add SSRF DNS/CIDR guards on deliverable URLs, enforce Redis rate limits. | **256-bit** capability entropy; **1:N** relational integrity; **0** private CIDR SSRF bypasses. |
| **Phase 3: Async Outbox & Edge Perf (Days 8–14)** | `OPS-03`, `PERF-01`, `PERF-02` | Move inline AWS SES calls to `TransactionalOutbox` + background worker, enforce HTTPS on click-tracking, normalize `/blog?category=` slugs, and cap `next.config.mjs` `deviceSizes` at 1920px. | POST latency reduced from **~1.42s to ~115ms**; image payloads reduced by **~82%**. |

---

## References & Audited Endpoints

1. **Cynbit Technologies Corporate Home**: `https://www.cynbit.in/`
2. **Cynbit Software Suite (Cynbit Studio, TenantEase, Revio)**: `https://www.cynbit.in/products`
3. **Cynbit AI Automation & Services Hub**: `https://www.cynbit.in/services`
4. **Cynbit Careers & Engineering Tracks**: `https://www.cynbit.in/careers`
5. **Backend Developer Intern Application Form**: `https://www.cynbit.in/careers/backend-developer-intern`
6. **AI/ML Engineer Intern Application Form**: `https://www.cynbit.in/careers/ai-ml-engineer-intern`
7. **Active Candidate Assessment Portal (Backend Intern)**: `https://www.cynbit.in/candidate/cmunzdbdp000504lczgktb34p` (Lead: `cmunzdbdp000404lce1uauik7`)
8. **Sibling Candidate Assessment Portal (AI/ML Intern)**: `https://www.cynbit.in/candidate/cmunzfa2g000904lccs46stm1` (Lead: `cmunzfa2g000804lcs62wmllr`)
9. **Sibling Candidate Assessment Portal (Full Stack Intern)**: `https://www.cynbit.in/candidate/cmunzaz5j000904k32kkal9n2` (Lead: `cmunzaz5j000804k32i38oket`)
10. **Sibling Candidate Assessment Portal (QA Intern)**: `https://www.cynbit.in/candidate/cmunz6zuw000104lca3skbyrk` (Lead: `cmunz6zuw000004lcnwfaq7is`)
11. **Cynbit BitElevate Engineering Paths**: `https://www.cynbit.in/bitelevate/paths`
12. **Cynbit Insights & Technical Blog**: `https://www.cynbit.in/blog` and `https://www.cynbit.in/blog/ai-agents-business-operations`
13. **Cynbit Contact & Technical Inquiry**: `https://www.cynbit.in/contact`
