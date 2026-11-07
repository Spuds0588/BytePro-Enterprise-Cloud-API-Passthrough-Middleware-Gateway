# todo.md — Task Tracker

Single source of truth for work in progress. Append to `history.md` when an item changes state.
Legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[—]` deliberately deferred (YAGNI / blocked)

## Priority 1 — Loan file documents & condition responses

Highest-value workflow for title and broker partners; prioritised above every other phase.

- [x] Condition submission: `POST /v1/loans/{id}/conditions` accepted from `TPO_BROKER` and `TITLE_VENDOR`, queued through FIFO, `202` + job ID
- [x] Conditions readable on the loan payload for `TPO_BROKER` (masked allowlist) and sent upstream as `Conditions[]`
- [x] Loan document upload: `POST /v1/loans/{id}/documents` (base64 PDF, ≤180,000 bytes through FIFO, 180,001–5,000,000 bytes synchronous, `%PDF-` signature check) for broker and title keys
- [x] Loan document list: `GET /v1/loans/{id}/documents` (ID, type, file name, notes, uploaded date)
- [x] Loan document download: `GET /v1/loans/{id}/documents/{docId}` returns `contentBase64`
- [x] Uploads up to 180,000 bytes run through the same FIFO retry/DLQ pipeline as fee and condition writes; larger uploads call BytePro directly with a 20-second timeout and create no job record
- [—] Live BytePro document/condition shapes (blocked: no BytePro tenant; upstream routes are the documented REST convention, exercised only against `mock/bytepro.js`)
- [x] Documents up to 5,000,000 bytes: uploads above the SQS limit use a synchronous direct BytePro call and return `200 { status: "COMPLETED", sync: true, documentId }` (proved by `test/gateway.test.js` — “documents above the SQS limit upload synchronously…” and “a direct upload surfaces BytePro locks…”; shipped in `1f79462`)
- [—] Documents above 5,000,000 bytes (blocked: API Gateway's base64 request ceiling; an S3 staging hop remains the next architecture change)
- [—] Per-document organization scoping (blocked: no BytePro field ties a document to the caller's organization; see the security note in `README.md`)
- [—] Appraisal (AMC) document or condition access (deferred: appraisal persona is read-only by design; open an issue with a real workflow)

## Phase 1 — Core Infrastructure

- [x] Zero-dependency Node runtime, API-Gateway-shaped events (`src/app.js`, `src/server.js`, `src/lambda.js`)
- [x] Async storage interface with AWS adapter (`src/aws-store.js`) and in-memory dev adapter (`dev/memory-store.js`)
- [x] FIFO write pipeline: SQS event source in AWS, drain runner locally (`src/writes.js`, `dev/local-runner.js`)
- [x] Structured JSON logging standard (`src/log.js`)

## Phase 2 — Session Vault & Auth Engine

- [x] BytePro session login (`POST /session`) with account code plus role service accounts (`src/byte.js`)
- [x] DynamoDB session cache per role with TTL and a `401` invalidate-and-retry-once path
- [x] Role credentials split into per-role Secrets Manager secrets (raw password value, no JSON escaping trap)
- [x] BytePro error surface: `423` locked loan, `404`, `429`, upstream `5xx` → gateway `502`/`504`

## Phase 3 — Synchronous Read Passthrough

- [x] `GET /v1/loans/{id}?paths=Property,Loan,Milestones` with `apiKeyId` → tenant + role resolution
- [x] Persona path masking (deny by default) with deep blocked-field filter
- [x] `Cache-Control: private, max-age=15`
- [—] Server-side loan read cache (rejected: a cached loan copy would make the gateway a data store)

## Phase 4 — FIFO Write Pipeline

- [x] `PATCH /v1/loans/{id}/fees` → `202 ACCEPTED` + `jobId` + `statusUrl`
- [x] Per-loan FIFO ordering (`MessageGroupId = loanId`), Lambda concurrency cap 5, DLQ after 5 receives
- [x] Retry classification: `423`/`429`/`5xx`/transport retried; permanent rejections `FAILED`
- [x] `GET /v1/jobs/{jobId}` with tenant ownership (foreign jobs → `404`)
- [x] Job TTL, no write payload persisted in the job record
- [x] `PATCH /v1/loans/{id}` returns `501` instead of pretending to accept a 1003 loan update
- [x] Persona write authorization: appraisal keys are refused before a job is created
- [—] Full 1003 read/write (blocked: needs sanitized BytePro payload samples; guessing shapes would create a fictional contract)
- [—] Webhooks (out of scope for v1 by the dev doc; BytePro has no modern webhook engine)

## Phase 5 — Self-Serve Onboarding (sister-project parity)

- [x] Role-scoped invite codes (`title`/`broker`/`appraisal`), timing-safe compare, fails closed
- [x] `GET /portal?role=…&code=…` persona-locked form; invalid or mismatched invites rejected
- [x] `POST /portal` provisions a scoped key and stores only `apiKeyId`
- [x] Hardened portal: strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, inline CSS (no CDN)
- [x] Object-path cheat sheet in the portal (no cryptic field-ID dictionary to maintain)
- [—] Single-use invite codes / revocation UI / admin dashboard (deferred; codes are rotatable per role)

## Phase 6 — Packaging, Distribution & Verification

- [x] `scripts/build.js`: bundle `src/` → readable `dist/gateway.js`, minify the inlined copy (no dependency), 51,200-byte guard, `--check`
- [x] `infra/template.yaml`: VPC + NAT + static EIP, DynamoDB tenants/sessions/jobs, SQS FIFO + DLQ, Secrets Manager, API Gateway usage plan, inline Lambda
- [x] `deploy.sh` one-line CloudShell installer (prompts for BytePro URL/account/role credentials, generates invite codes, prints invite links + egress IP)
- [x] Tests: session cache/refresh, invite provisioning, masking, reads/projection, fee/condition writes, queued and synchronous large-document upload/list/download, validation failures, retry classification, job ownership, HTTP e2e, template guards, executed inline bundle, static/community guards
- [x] `npm run verify` green in this environment (55 tests; CI Verify jobs green on Node 20 and 24 at `1f79462`)
- [x] Community surfaces: `CONTRIBUTING.md`, `llms.txt`, GitHub Pages `index.html`, issue forms, PR template
- [x] Community direction codified in `agents.md` §0 and repeated on every developer-facing surface
- [x] GitHub Pages enabled on `main` / root; live page (200, canonical + JSON-LD), `llms.txt` (200), `robots.txt` (200), and `sitemap.xml` (200) fetched 2026-11-07
- [x] MVP committed and pushed: `420d252`; Node 24 test-command fix `6259620`; CI green on both Node versions
- [x] Static homepage verified at the HTTP level only (no browser render or Lighthouse audit)
- [—] Live AWS deployment + BytePro calls (blocked: no AWS account, AWS CLI, or BytePro access; probed 2026-11-07 — `aws` not installed, no `AWS_*` credentials, no `~/.aws`, no stack recorded)
- [—] GitHub Discussions (maintainer action; issue forms are the support surface today)
- [—] Contributor invitations and a triage rotation (maintainer action)
- [—] On-prem BytePro `ByteRelay.exe` agent edition (separate architecture: outbound-only SQS poller; deliberately not part of this cloud template)
