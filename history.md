# history.md — Decision & Work Log

Append-only. Newest entries at the top. Never rewrite past entries; add a correction instead.

---

## 2026-11-07 — Local verification: 52/52 tests and a live HTTP smoke run

**Why.** The MVP needed evidence before it could be committed. All checks below ran on this machine,
which has no BytePro tenant and no AWS account; nothing here is a live deployment claim.

**Automated.** `npm run verify` (template sync check + `node --test test/`) → **52 tests, 52 pass, 0 fail**.
Coverage includes session login/cache/invalidate-and-retry, invite provisioning and role locking, persona
masking and blocked NPI fields, `?paths=` projection, read error mapping (404/423/502/504), FIFO fee and
condition writes with retry classification, PDF upload/list/download and every validation failure
(`400`/`413`/`415`), job ownership, the HTTP adapter e2e flow, template resource/size guards, and execution
of the exact minified inline bundle from `template.yaml`. Template: **49,933 bytes, 1,267 bytes under
CloudFormation's 51,200-byte limit** (guard requires ≥1,024).

**Live local run.** `PORT=3999 node dev/server.js` against `mock/bytepro.js`, then real HTTP calls:

| Check | Result |
| --- | --- |
| `GET /health` | `200 {"status":"ok","system":"ByteProGateway"}` |
| `POST /portal` (title invite) | `200`, key issued, persona `TITLE_VENDOR` |
| `GET /v1/loans/BYTE-1002948?paths=Property,Loan,Borrower,Fees` | `200`, Dallas property, 1 fee, **no borrower object** for title |
| `POST …/conditions` | `202 ACCEPTED` + job ID |
| `GET /v1/jobs/{id}` | `COMPLETED`, `attempts: 1`, `error: null` |
| `POST …/documents` | `202 ACCEPTED` + job ID |
| `GET …/documents` | `200`, one `Title Commitment` document listed |

Cleanup: the recorded PID was killed, `ps -p` confirmed the process was gone, and no watchers or daemons
were left running. This proves the handler, session cache, masking, queue delivery, and document path in a
real HTTP process — not AWS resource behavior, API Gateway API keys, DynamoDB, SQS, or BytePro.

**Known failure found and fixed during verification.** The default `?paths=` set excluded `Borrower`, so a
broker read silently omitted borrower identity (the mock filters upstream by the requested roots). The
default now includes `Borrower,Conditions,Fees,CustomFields`; masking still prunes it for title and
appraisal. The mock also indexed loan IDs one path segment too deep, which made every upstream read 404
until corrected. Both were test-caught, not production-caught.

**Not verified.** No BytePro tenant call, no AWS deployment, no API Gateway key provisioning, no SQS,
DynamoDB, Secrets Manager, or NAT egress behavior. Upstream document and condition routes remain the
documented REST convention exercised only against the local fake.

---

## 2026-11-06 — MVP build: BytePro Enterprise Cloud gateway

**Why.** The repository held only the planning transcript, a one-line README, and a license. This entry
records the first working build: the whole gateway, local fake, tests, deployment template, and
community surfaces. Documents and condition responses were prioritised above every other phase per
the current request.

**Source of truth.** `BytePro Planning Doc.md` (AI Studio export, 13 messages). Several section bodies
are collapsed to headings, so where it is silent the implementation follows its stated principles:
serverless, one-file deployment, zero loan data at rest, invite-scoped keys, FIFO writes, YAGNI.

**Decisions**

- **BytePro semantics, not a copy of the sister repos.** BytePro uses object notation
  (`Property.Street`, `Loan.BaseLoanAmount`), so the gateway masks object paths instead of translating
  MISMO XML or numeric field IDs. There is no field dictionary to maintain and no `/v1/fields` proxy.
- **Stateful session auth.** `POST /session` with account code plus a role service account, bearer token
  cached per role in DynamoDB for at most 25 minutes, refreshed once on a `401`. One Secrets Manager
  secret per role holding only the raw password, so a password containing quotes cannot break a JSON
  secret template.
- **Documents and conditions are Priority 1.** Broker and title keys can upload/list/download loan PDFs
  and submit condition responses; appraisal keys cannot. Uploads travel in the SQS message (180,000-byte
  cap) like the sister projects, so there is no S3 bucket and no document at rest.
- **Divergence from MeridianLink recorded.** MeridianLink restricts documents and condition submission to
  the broker persona. BytePro's title persona is the one that uploads title commitments and answers title
  conditions, so title is allowed both. The appraisal persona stays read-only. This is a deliberate
  product decision, not an accident; revisit if deployments report that title access is too broad.
- **No 1003 write shape.** `PATCH /v1/loans/{id}` returns `501`. Inventing a BytePro loan-field payload
  would produce a tested-but-fictional contract.
- **One inline CloudFormation file.** `scripts/build.js` (same zero-dependency bundler and tokenizer
  minifier as the sister projects) inlines the Lambda bundle into `template.yaml` and enforces the
  51,200-byte direct-upload limit.

**Environment probe (2026-11-06).** `command -v aws` → not installed; no `AWS_*` variables; no
`~/.aws`; the repository records no `execute-api` URL. There is no AWS account, AWS CLI, or BytePro
tenant here, so the AWS stack and live BytePro API cannot be exercised from this machine. Local fakes
prove routing, auth, masking, sessions, FIFO delivery, and validation only.

**Changed.** `src/`, `mock/bytepro.js`, `dev/`, `infra/template.yaml`, `scripts/build.js`, `deploy.sh`,
`agents.md`, `todo.md`, `README.md`, `CONTRIBUTING.md`, `llms.txt`, `index.html`, `robots.txt`,
`sitemap.xml`, `.github/` templates and CI, and `test/`.

**Verification.** Recorded in the next dated entry above this one.
