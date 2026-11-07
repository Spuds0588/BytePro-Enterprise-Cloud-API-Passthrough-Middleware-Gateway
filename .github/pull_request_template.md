## What changed and why

<!-- One or two sentences. Link the issue this addresses. -->

Fixes #

## Verification

<!-- State what was actually run. Do not check a box for a run that did not happen. -->

- [ ] `npm run verify` (template sync check + full `node:test` suite)
- [ ] `npm run build` regenerated `template.yaml`
- [ ] Regression test added or updated for this bug fix
- [ ] Exercised locally with `npm run dev` and `mock/bytepro.js`
- [ ] `cfn-lint template.yaml` (optional; not installed in CI)

Command output or a short note:

```text

```

## Not validated

- [ ] Not validated against a real BytePro tenant
- [ ] Not validated against a live AWS deployment

Explain what remains unproven, and whether you need help from someone with a tenant or an AWS account:

## Safety

- [ ] No API keys, invite codes, passwords, session tokens, loan data, or borrower PII in this PR, its tests, fixtures, screenshots, or logs
- [ ] No loan documents or borrower data are stored at rest by the gateway
- [ ] Persona masking, invite checks, job ownership, and document validation were not weakened to make a check pass

## Docs

- [ ] `README.md`, `llms.txt`, `index.html`, `todo.md`, and `agents.md` updated for behavior or API changes
- [ ] `template.yaml` is generated from `infra/template.yaml`, not hand-edited
- [ ] At least 1 KB of CloudFormation headroom remains

## Reviewer notes

<!-- Anything that needs a second opinion, especially a guessed BytePro shape. -->
