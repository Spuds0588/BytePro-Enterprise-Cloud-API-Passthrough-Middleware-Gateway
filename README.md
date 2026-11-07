# BytePro Enterprise Cloud API Passthrough & Middleware Gateway

An open-source, one-file deployable gateway for **BytePro Enterprise Cloud**. It turns BytePro's
stateful, session-authenticated API into a key-scoped JSON API for title companies, TPO brokers, and
appraisal vendors, masks loan objects per persona, and absorbs write contention through an SQS FIFO
queue. Loan document exchange and condition responses are the priority workflows.

Sister projects: [Encompass API Passthrough Gateway](https://github.com/Spuds0588/Encompass-API-Passhrough-Middleware-Gateway-)
and [MeridianLink API Passthrough Gateway](https://github.com/Spuds0588/MeridianLink-Mortgage-API-Passthrough-Middleware-Gateway).
This repository follows their runtime, security, and deployment conventions where they fit BytePro.

## Community-supported — contribute aggressively

This is an independent, community-supported template, not a BytePro product, and it is not affiliated
with Byte Software. The maintainer has **no BytePro access and no AWS account for this project**, so
every deployment is also a test. Issues and pull requests are the roadmap, not a support channel:

- **Found a bug?** [Open the bug report form](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/issues/new?template=bug_report.yml)
  with a minimal reproduction, the commit you tested, and sanitized logs. Feature ideas use the
  [improvement form](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/issues/new?template=feature_improvement.yml).
- **Opening a pull request?** Use [pull requests](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/pulls)
  and the [PR template](.github/pull_request_template.md), which requires what you actually verified, what
  you could not validate, and a regression test for bug fixes.
- **Validated a BytePro payload or a live deployment?** Report the sanitized result on the relevant issue.
  Real shapes are the most valuable contribution this project can receive.
- **Want to help long term?** The maintainer is happy to add contributors: say so on your issue or PR.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), the operating manual in [agents.md](agents.md), and
[llms.txt](llms.txt) for machine-readable context. The public overview lives at [index.html](index.html)
(GitHub Pages). Privately patched forks are discouraged: upstream the smallest fix so the next
deployment benefits. Never include API keys, invite codes, passwords, session tokens, loan data, or
borrower PII in an issue, PR, screenshot, or log.

## Features

- **Loan document exchange (Priority 1)** — a broker or title key uploads a base64 PDF through the FIFO
  pipeline, lists a loan's documents, and downloads one by ID. Uploads are capped at 180,000 bytes so the
  document fits in an SQS message; nothing is stored by the gateway.
- **Condition responses (Priority 1)** — `POST /v1/loans/{id}/conditions` accepts description/status rows
  from broker and title keys, applies them through the same retry pipeline, and returns `202` + a job ID.
  Brokers can read conditions on the loan payload.
- **Persona masking** — deny-by-default object-path allowlists per role. SSN, taxpayer ID, credit score,
  date of birth, income, assets, and liabilities are stripped at any depth before a response leaves the
  gateway. Title sees property, terms, fees, conditions, and custom fields; appraisal sees property,
  legal description, and basic loan terms.
- **Stateful session handling** — one BytePro service account per role, `POST /session`, bearer token
  cached per role in DynamoDB for at most 25 minutes, invalidated and retried once on a `401`.
- **Async writes** — fee and condition updates and document uploads are queued by loan
  (`MessageGroupId = loanId`), return `202`, retry BytePro record locks with backoff, and dead-letter
  after five attempts.
- **Role-scoped onboarding** — the lender shares a title, broker, or appraisal invite link; the vendor
  enters a company name and developer email; the gateway binds the key to that persona server-side.
  No admin token and no per-vendor admin work.
- **One-file deployment** — a single CloudFormation template under the 51,200-byte direct-upload limit
  with the Lambda bundle inlined; no S3 bucket, no zip, no build step in AWS.
- **Static egress IP** — the template provisions a VPC, NAT gateway, and Elastic IP so Byte Software
  can allowlist one address.

## Deploy (AWS CloudShell, ~3 minutes)

```shell
bash <(curl -sSL https://raw.githubusercontent.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/main/deploy.sh)
```

The script verifies your AWS session, prompts for the BytePro base URL, lender account code, and the
three role service-account credentials, generates three invite codes, fetches the committed template,
and deploys `BytePro-Mortgage-Gateway` with `CAPABILITY_IAM`. It prints:

- `GatewayUrl` — base URL for vendor calls
- `AdminPortalUrl` — the invite portal
- `HealthUrl` — open liveness check
- `StaticEgressIp` — allowlist this with Byte Software
- three ready-to-share role links, e.g. `...?role=title&code=...`

Environment overrides: `STACK_NAME`, `AWS_REGION`, `TEMPLATE_URL`, `TITLE_INVITE_CODE`,
`BROKER_INVITE_CODE`, `APPRAISAL_INVITE_CODE`.

Prefer the console? Upload `template.yaml` directly in CloudFormation and fill in the same parameters.
It stays under the 51,200-byte direct-upload limit.

### Smoke test after deploy

```shell
curl -s "$HEALTH_URL"
curl -s "$PORTAL_URL?role=broker&code=$BROKER_INVITE_CODE"
curl -s -X POST "$PORTAL_URL" -H "content-type: application/json" \
  -d "{\"role\":\"broker\",\"code\":\"$BROKER_INVITE_CODE\",\"tenantName\":\"Acme Broker\",\"email\":\"dev@acme.test\"}"
# use the returned apiKey:
curl -s "$GATEWAY_URL/v1/loans/BYTE-1002948?paths=Property,Loan,Milestones" -H "x-api-key: $KEY"
curl -s -X POST "$GATEWAY_URL/v1/loans/BYTE-1002948/conditions" -H "x-api-key: $KEY" \
  -H "content-type: application/json" -d '{"conditions":[{"description":"Provide title commitment","status":"Satisfied"}]}'
curl -s "$GATEWAY_URL/v1/jobs/$JOB_ID" -H "x-api-key: $KEY"
curl -s "$GATEWAY_URL/v1/loans/BYTE-1002948/documents" -H "x-api-key: $KEY"
```

## API

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | none | `{ "status": "ok", "system": "ByteProGateway" }` |
| `GET` | `/portal` | none | invite landing page + object-path cheat sheet |
| `GET` | `/portal?role=title&code=…` | invite code | persona-locked provisioning form |
| `POST` | `/portal` body `{ role, code, tenantName, email }` | invite code | `{ apiKey, tenantName, email, role, persona }` |
| `GET` | `/v1/loans/{id}?paths=Property,Loan,Milestones` | `x-api-key` | `{ loanId, data, _cached: false }`, masked |
| `POST` | `/v1/loans/{id}/conditions` body `{ "conditions": [{ "description": "…", "status": "Satisfied" }] }` | `x-api-key` | `202 { status, jobId, loanId, statusUrl }` (broker/title) |
| `POST` | `/v1/loans/{id}/documents` body `{ "documentType": "…", "notes": "…", "contentBase64": "<PDF>" }` | `x-api-key` | `202 { status, jobId, loanId, statusUrl }` (broker/title) |
| `GET` | `/v1/loans/{id}/documents` | `x-api-key` | `{ loanId, documents: [{ id, documentType, fileName, notes, uploadedAt }] }` (broker/title) |
| `GET` | `/v1/loans/{id}/documents/{docId}` | `x-api-key` | `{ documentId, contentType: "application/pdf", contentBase64 }` (broker/title) |
| `PATCH` | `/v1/loans/{id}/fees` body `{ "fees": [{ "feeType": "…", "amount": 1350 }] }` | `x-api-key` | `202 { status, jobId, loanId, statusUrl }` (broker/title) |
| `PATCH` | `/v1/loans/{id}` | `x-api-key` | `501` — only fee, condition, and document writes are implemented |
| `GET` | `/v1/jobs/{id}` | `x-api-key` | `{ jobId, loanId, kind, status, attempts, createdAt, updatedAt, error }` |

Job statuses: `PENDING` → `RETRYING` → `COMPLETED` / `FAILED`. Fee and condition arrays are capped at
100 items. Uploads must be base64-encoded PDFs with a valid `%PDF-` signature and at most 180,000
decoded bytes (the SQS message limit); violations return `400`, `413`, or `415` before any job is
created. Documents are never written to DynamoDB; only the queue message carries the bytes.

### Roles and personas

| Role | Persona | Invite parameter | Read | Write |
| --- | --- | --- | --- | --- |
| `title` | `TITLE_VENDOR` | `TitleInviteCode` | property, legal description, terms, fees, conditions, custom fields | fees, conditions, documents |
| `broker` | `TPO_BROKER` | `BrokerInviteCode` | full property and loan object, borrower name/email/phone/mailing address, milestones, conditions, fees | fees, conditions, documents |
| `appraisal` | `AMC_VENDOR` | `AppraisalInviteCode` | property, legal description, loan type/amount, current milestone | none |

SSN, taxpayer ID, credit score, date of birth, income, assets, and liabilities are excluded for every
persona by the blocked-field filter, even when the allowlist includes the surrounding object.

**Divergence from the sister projects:** MeridianLink restricts document exchange and condition
submission to the broker persona. BytePro's title persona is the one that uploads title commitments and
answers title conditions, so title is allowed both here. The appraisal persona stays read-only. See
`history.md` for the decision and revisit it if deployments report that title access is too broad.

## Architecture

```
Vendor ──invite link──► GET  /portal?role=title&code=… → persona-locked form
Vendor ──x-api-key────► API Gateway (usage plan)
                         ├── POST /portal                    → invite → API key + tenant mapping
                         ├── GET  /health                    → open liveness
                         ├── GET  /v1/loans/{id}             → masked BytePro JSON read
                         ├── PATCH /v1/loans/{id}/fees        → SQS FIFO → BytePro PATCH → 202
                         ├── POST /v1/loans/{id}/conditions   → SQS FIFO → BytePro PATCH → 202
                         ├── POST /v1/loans/{id}/documents    → SQS FIFO → BytePro document upload → 202
                         ├── GET  /v1/loans/{id}/documents[/{docId}] → BytePro list/download
                         └── GET  /v1/jobs/{id}               → job status (owner only)
                                                        │
                              SQS FIFO (group = loan) ──┘─► Lambda worker ──► BytePro
                                                              (5 attempts, then DLQ)
                              NAT gateway + Elastic IP = static egress for the BytePro allowlist
```

Storage: DynamoDB tenants, per-role sessions (TTL), and jobs (TTL) · Secrets Manager (one raw password
per role) · API Gateway key store. No loan documents are persisted; only the in-flight write payload
(a changed-fields object or a base64 PDF) travels in the SQS message and is deleted with it.

## Local development

Requires Node.js 20+. There are no dependencies to install and nothing is deployed.

```shell
npm run dev
# Gateway:   http://127.0.0.1:3000
# Portal:    http://127.0.0.1:3000/portal?role=title&code=local-title-invite-0123456789
# Broker:    …?role=broker&code=local-broker-invite-0123456789
# Appraisal: …?role=appraisal&code=local-appraisal-invite-0123456789
npm test          # node:test suite (in-memory, no state)
npm run build     # regenerate dist/gateway.js + template.yaml
npm run verify    # build --check + tests
```

The local stack runs the real handler against `mock/bytepro.js` and an in-memory AWS stand-in. Mock
loans: `BYTE-1002948` (normal), `BYTE-LOCKED-1` (always `423`), `BYTE-404` (missing).

## Repository layout

```
src/lambda.js         deployed Lambda (HTTP + SQS)
src/app.js            routes, invites, reads, condition/fee/document writes, job status
src/byte.js           BytePro client: session cache, loan reads, document exchange
src/mask.js           persona path allowlists + blocked-field filter
src/roles.js          role → persona, username env, password secret env
src/portal.js         invite portal + object-path cheat sheet
src/writes.js         write delivery and retry classification
src/aws-store.js      DynamoDB / SQS / Secrets Manager / API Gateway adapters
src/server.js         local HTTP adapter
dev/                  fake upstream, memory store, drain runner, local config
mock/bytepro.js       fake BytePro Enterprise Cloud API
infra/template.yaml   CloudFormation source (//__GATEWAY_CODE__ placeholder)
template.yaml         generated deployable template (committed)
scripts/build.js      bundle + minified inline + size guard + --check
deploy.sh             one-line CloudShell installer
test/                 node:test unit, e2e, bundle and template guards
```

## Status and limitations

Implemented and tested locally: session login/cache/refresh, invite onboarding, persona masking and
projection, synchronous reads, FIFO fee and condition writes with lock retries, PDF document
upload/list/download, job ownership, the HTTP runtime, the single-file template, and the exact inline
bundle the template deploys (executed in tests).

**Not deployed to AWS from this environment** (no AWS account, AWS CLI, or BytePro tenant). The template
is structurally tested and the embedded handler is executed locally, but real resource behavior,
BytePro payload shapes, and the egress allowlist remain unverified. A 2026-11-06 probe found no AWS CLI,
no `AWS_*` credentials, and no `~/.aws`, so the API deployment is blocked on account credentials. See
`history.md`.

Other known limits:

- **Upstream document and condition shapes are assumptions.** The gateway calls
  `POST/GET /loans/{id}/documents` and `PATCH /loans/{id}` with `{ data: { Conditions: [...] } }`, the
  documented REST convention. Only `mock/bytepro.js` has confirmed those shapes. If your tenant
  disagrees, open an issue with a sanitized payload — do not force it in a private fork.
- **180,000-byte upload cap** because the PDF travels inside the SQS message. Larger files need an S3
  staging hop, which is a deliberate future architecture change, not a parameter.
- **No per-loan organization scoping.** A tenant mapping fixes the persona, not which loans a key may
  touch: reads and writes accept any loan ID the shared BytePro service accounts can reach. Deploy only
  where that visibility is acceptable, or add a loan-to-organization check before exposing the gateway
  to competing partners.
- Invite codes are global per role (rotate via stack parameters; no single-use or revocation UI), one
  shared usage plan/quota for all tenants, no CORS (server-to-server expected), and no admin dashboard.
- No webhooks, no loan read cache, and no full 1003 read/write. `PATCH /v1/loans/{id}` returns `501`
  rather than guessing a BytePro loan-field payload.
- Sessions assume a 30-minute BytePro token (`expiresIn` is honored when returned). A shorter real
  lifetime is handled by the `401` retry, at the cost of an extra login.

## Docs

- `agents.md` — operating manual (YAGNI, one-line preference, cleanup, security invariants,
  community-maintenance duties).
- `CONTRIBUTING.md` — issue and pull-request workflow, sanitization rules, contributor invitations.
- `llms.txt` — compact machine-readable guide for LLMs and coding agents.
- `index.html` — static project page served from GitHub Pages (`main` / root).
- `robots.txt` and `sitemap.xml` — crawler permissions and the canonical page URL.
- `todo.md` — task tracker. `history.md` — append-only decision log.
- `BytePro Planning Doc.md` — the original design transcript this build implements.
