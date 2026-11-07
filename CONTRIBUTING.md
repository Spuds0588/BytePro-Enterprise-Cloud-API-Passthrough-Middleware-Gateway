# Contributing

This gateway is **shared infrastructure, not a supported vendor product**. The maintainer has no
BytePro tenant and no AWS account for this project, so a sanitized report from your deployment is often
worth more than a patch. Every issue, reproduction, review, and pull request makes the next lender's
deployment better.

## Ways to help

- **Report a bug** with the [bug report form](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/issues/new?template=bug_report.yml).
  Include the commit you tested and a minimal reproduction.
- **Request an improvement** with the [improvement form](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/issues/new?template=feature_improvement.yml).
  Keep it small; the project follows YAGNI.
- **Send a pull request** with a regression test and updated docs: [open a PR](https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/pulls).
  Bug fixes without a test are hard to accept because they cannot be verified here.
- **Validate a real BytePro shape** — document upload, document listing, condition updates, a session
  response, or anything else. Post the sanitized structure on the relevant issue. This is the highest-value
  contribution available.
- **Report a deployment** — which AWS resources worked, what failed, and the sanitized error. Do not post
  account IDs, keys, or loan data.
- **Review** — a careful review of a payload mapping or retry path is a contribution. The maintainer is
  happy to add contributors who want to keep going; say so on your issue or PR.

## Before opening an issue

1. Search open and closed issues for the same behavior.
2. Run `npm test` and `npm run verify` on the commit you are reporting.
3. Reduce the problem to the smallest request or handler call that reproduces it.
4. Sanitize everything. Never include API keys, invite codes, passwords, session tokens, loan data,
   borrower PII, or full upstream payloads.

## Pull requests

- Branch from `main`; keep the change focused on one behavior.
- Run `npm run verify` (template sync check plus the full `node:test` suite) before pushing.
- For a bug fix, add a regression test that fails before the fix.
- If you change an endpoint, payload, persona path, or deployment resource, update `README.md`,
  `llms.txt`, `index.html`, `todo.md`, and `agents.md` in the same PR.
- `template.yaml` is generated from `infra/template.yaml`. Run `npm run build`; never hand-edit the
  generated file. `template.yaml` must stay in sync with the build and under CloudFormation's
  51,200-byte limit with at least 1 KB of headroom.
- State exactly what you ran. "Tested locally with the fake BytePro" is useful; "works" is not.
- Use the [PR template](.github/pull_request_template.md). It asks what you verified, what you could not
  validate, and whether a regression test exists.

## Local checks

```shell
npm test          # node:test suite; no network, no AWS, no state left behind
npm run build     # regenerate dist/gateway.js and template.yaml
npm run verify    # build --check + tests
```

Optional: `cfn-lint template.yaml` if you have it installed. It is not a dependency and CI does not
require it.

## Testing against a real deployment

If you have a BytePro tenant and an AWS account:

1. Deploy with `deploy.sh` or upload `template.yaml` in CloudFormation.
2. Allowlist the stack's `StaticEgressIp` with Byte Software before blaming the gateway for timeouts.
3. Verify a complete flow: portal invite → key → masked read → condition write → job poll → queued
   document upload → list → download, plus one PDF above 180,000 bytes to exercise the synchronous path.
4. Report what the real BytePro payloads look like (sanitized), especially if they differ from
   `mock/bytepro.js`.
5. Rotate the invite codes and BytePro passwords if they were ever exposed.

The maintainer cannot reproduce a live tenant or stack here. Say plainly in your PR or issue which
parts were validated against a real deployment and which were not.

## Maintainer notes

- Contributors who validate a real shape, correct a mapping, or submit a good test are invited to keep
  contributing. Ask and you will be added.
- GitHub Discussions is not enabled; issues are the support and deployment-report surface.
- Private forks are discouraged. Upstream the smallest fix so every deployment benefits.
