# history.md — Decision & Work Log

Append-only. Newest entries at the top. Never rewrite past entries; add a correction instead.

---

## 2026-11-07 — Verify fix shipped; Node 20/24 CI and Pages green

**Pushed.** The verify-glob fix and its regression test are in `3932b29` on `main`. `todo.md` points to the
test and that commit.

**CI.** Workflow run for `3932b29`: **Verify (Node 20) success, Verify (Node 24) success**, plus build and
deploy checks success. This is the first run that exercises `npm run verify`'s corrected command path in
addition to the existing `npm test` job.

**GitHub Pages.** Deployment for `3932b29` succeeded. Live cache-busted fetches returned `200` for the
homepage (15,373 bytes), `llms.txt` (5,451 bytes), `robots.txt` (133 bytes), and `sitemap.xml` (330 bytes);
no site content changed in this commit, so the shipped copy is unchanged and current.

**Cleanup.** `dist/` from the local build check was removed; no server process was started for this
tooling-only change.

---

## 2026-11-07 — Todo audit: no locally achievable feature left; verify command fixed

**Audit.** Every remaining unchecked line in `todo.md` is `[—]`, not `[ ]`: live BytePro document/condition
shapes, per-document organization scoping, and full 1003 writes need a real tenant or sanitized payloads;
>5 MB uploads and a live deployment need AWS; appraisal document/condition access and single-use invites
are product decisions already deferred; GitHub Discussions and contributor invitations are repository
settings; the on-prem `ByteRelay.exe` edition is a separate architecture. No feature was invented to fill
the gap, and no deferred product decision was reversed.

**Defect found by reading the developer path.** `npm test` and CI run `node --test test/*.test.js`, but
`npm run verify` still ran `node --test test/`. Node 24 treats that directory as a module and fails
(`MODULE_NOT_FOUND`), so the command every developer surface tells contributors to run was broken on the
CI matrix's newer runtime. The directory form also discovered `test/helpers.js` as a test, inflating the
reported count by one. This is a tooling contradiction, not substitute feature scope.

**Fix.** `package.json` now makes `verify` use the same glob as `npm test` and CI. A regression test reads
`package.json` and asserts both scripts keep the Node 24-compatible glob, so the old form cannot silently
come back. The corrected suite is **55 tests** (54 behavior tests plus the new guard), not the previously
reported 55-plus-helper.

**Verification.** `npm run verify` → **55 tests, 55 pass, 0 fail** on Node 20.19.2. Template remains
**49,979 bytes with 1,221 bytes of headroom**; no template or runtime behavior changed. Node 24 is proven
by CI, not by a local Node 24 binary. No AWS stack or BytePro tenant was available, so live behavior stays
unverified.

---

## 2026-11-07 — Large-document path shipped; CI and Pages verified on the pushed commit

**Pushed.** The direct-upload implementation, tests, and reconciled docs are in `1f79462` on `main`.
**CI.** Workflow run `42329864415` completed successfully: **Verify (Node 20) success, Verify (Node 24)
success**, and the `build` job success.

**GitHub Pages.** Deployment run `42329863833` completed successfully. Live fetches from the canonical
Pages URL (cache-busted by commit) returned:

| Surface | Result |
| --- | --- |
| `index.html` | `200`, 15,373 bytes; includes “5 MB” and the synchronous-upload copy |
| `llms.txt` | `200`, 5,451 bytes; includes the 180,000-byte queue / 5 MB synchronous wording |
| `robots.txt` | `200`, 133 bytes |
| `sitemap.xml` | `200`, 330 bytes |

**Cleanup.** The generated `dist/` directory was removed after the build check; no server process from the
smoke test remains, and no dependency was installed.

---

## 2026-11-07 — Documents above the SQS cap upload directly to BytePro

**Why.** `todo.md`'s highest-priority open code item was documents larger than 180,000 bytes: SQS caps a
message at 256 KB, so a base64 PDF beyond that could never be queued. The dev doc and sister projects
either rejected those files or introduced an S3 staging bucket. An S3 hop adds a bucket, lifecycle rules,
and temporary document storage, which contradicts the stateless-passthrough rule in `agents.md` §2.

**Decision.** Keep small PDFs (≤180,000 decoded bytes) on the existing FIFO path, and send anything larger
directly to BytePro in the request, up to 5,000,000 bytes. No new AWS resource, no document at rest, no
new dependency. Direct uploads get a 20-second upstream timeout instead of the 8-second read timeout and
return `200 { status: "COMPLETED", sync: true, documentId }`; queued uploads still return `202` + job ID.
A direct upload has no FIFO ordering or automatic lock retry, so an upstream `423` is returned to the caller
to retry. Files above 5 MB are rejected with `413` and remain a deliberate S3-architecture item.

**Implementation.** `src/app.js` now parses against the 5 MB direct cap, branches on the 180,000-byte
queue threshold, maps upstream status through the existing `upstreamError`, and logs byte counts and the
loan ID only. `src/byte.js` accepts an optional per-call timeout so the upload can exceed the default
8 seconds. `mock/bytepro.js` needed no change because it already accepts arbitrary base64 PDFs and
enforces the locked-loan `423`. Tests cover the direct success path (200, no queue message or job, exact
base64 at the fake), the lock response, the 5 MB rejection, and a direct timeout (`504`).

**Docs reconciled.** README features/API/architecture/storage/limits, `llms.txt`, `index.html` (JSON-LD,
card, API table, limits, FAQ), the portal copy, `agents.md` §2/§4, and `CONTRIBUTING.md` deployment steps
now describe both paths. The CloudFormation YAML was compacted (flow-style IAM/SQS/DynamoDB/API Gateway
lists, removed Output descriptions and the top-level Description) to absorb the additional handler code.

**Local verification.** `npm run verify` → **55 tests, 55 pass, 0 fail**. Template: **49,979 bytes,
1,221 bytes under the 50,176-byte guard ceiling**. Live local run with `PORT=3999 node dev/server.js`:
a 200,005-byte PDF returned `200 COMPLETED`, `sync: true`, a document ID, no job ID, and the document list
showed one entry. The server was stopped with its recorded PID.

**Not verified.** No live BytePro tenant or AWS deployment exists here, so the real document-upload
response shape and API Gateway's actual base64 request ceiling remain unconfirmed. A 5 MB body encodes to
roughly 6.7 MB; if a deployed gateway rejects it below 5 MB, lower the constant and record the real limit.

---

## 2026-11-07 — Published to main; Pages live; CI green on Node 20 and Node 24

**Pushed.** MVP committed at `420d252` (41 files, 4,822 insertions) and pushed to `origin/main`.

**CI caught a portability bug.** The first CI run failed on Node 24 only: `node --test test/` resolved the
directory as a module (`MODULE_NOT_FOUND`) instead of discovering tests. Local Node 20 accepted it. Fixed in
`6259620` by running `node --test test/*.test.js`; the same command was verified locally and then on both CI
jobs. **Verify (Node 20): success. Verify (Node 24): success.** The visible test count moved from 52 to 51
because the glob no longer counts `test/helpers.js` as a test file; no test was removed.

**GitHub Pages.** Pages was already enabled with the `legacy` builder on `main` / root; no repository setting
needed changing. The `pages build and deployment` run for `6259620` completed successfully. Live fetches from
`https://spuds0588.github.io/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/`:

| Surface | Result |
| --- | --- |
| `index.html` | `200 text/html`, 15,198 bytes, one `<h1>`, canonical link, JSON-LD block, issue/PR links |
| `llms.txt` | `200 text/plain` |
| `robots.txt` | `200`, sitemap directive present |
| `sitemap.xml` | `200` |

The SEO/AEO homepage is therefore live and verified at the HTTP level. It is a static page; no browser render
or Lighthouse audit was performed.

**Still not verified.** No AWS stack was deployed and no BytePro call was made. API Gateway key provisioning,
DynamoDB, SQS, Secrets Manager, NAT egress, the real document/condition payloads, and the CloudFormation
resource behavior remain unproven outside local tests. `todo.md` records the exact blocked items.

**Cleanup.** `dist/` is generated and gitignored; removed after the build check. The local dev server was
started with a recorded PID and stopped with `kill`; `ps -p` confirmed it was gone. No watcher, container, or
dependency install was left behind.

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
