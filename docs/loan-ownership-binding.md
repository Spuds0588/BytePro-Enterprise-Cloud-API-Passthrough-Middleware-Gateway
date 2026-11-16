# Loan ownership binding: plan and blocker

Status: designed, not implemented. Blocked by the CloudFormation template budget.

## What Encompass changed, and what carries over

Encompass replaced a shared template-persona token with a per-key bound vendor user, and
now lets Encompass decide which loans a key can reach. BytePro has no impersonation
exchange; it authenticates a session per **role** (`POST /session` with account code plus
role credentials), and those sessions are cached per role. Every broker key therefore acts
as the same BytePro role account today, which is the same defect in a different costume.

The target is unchanged: one BytePro identity per key, so a loan id from another company
returns `404`.

## Planned shape

1. Tenant row gains `byteProUser` (the brokerage's own BytePro identity) plus a `binding`
   snapshot recorded at enrollment.
2. `src/byte.js` session cache keys change from role to that identity, and each tenant's
   session request uses its own credentials. Encompass's equivalent change was
   persona-token to per-user token.
3. Persona *path* masking stays: `TITLE_VENDOR` / `TPO_BROKER` decide which roots and
   fields come back. Binding decides which loans exist for that caller. They are separate
   controls and both are needed.
4. Document uploads go through two paths (queued under 180,000 bytes, synchronous above).
   Both call BytePro with the tenant's session, so both inherit the binding.

## Entitlement is a separate check

Binding a key to a vendor user is only half the control. The other half is deciding *which*
user a given partner may bind. In Encompass that is now an explicit step: every invite is
bound to one pre-authorized login, and a different login is refused before a key is minted,
because otherwise anyone holding an invite link can claim any user the actor can reach.
Carry the same rule here: the invite the lender issues must name the vendor login it
authorizes, and enrollment must compare against that rather than accepting a login the caller
types.

## Open vendor questions

- Can BytePro service accounts be created per company through an API, or only in the
  BytePro admin UI? Encompass answered this with `POST /encompass/v3/users`; BytePro has
  no confirmed equivalent in this repo.
- Does a BytePro session belong to a user, or to the role/account pair? Session responses
  are exercised only against `mock/bytepro.js`.
- Which `paths` root exposes the loan's owning company, so an ownership guard could be
  added without inventing a field?

## Why this is not code yet

`test/template.test.js` requires 1 KB of headroom under the 51,200-byte CloudFormation
direct-upload limit, and the inline bundle lives inside `template.yaml`:

```
template.yaml        49,979 bytes
limit                51,200 bytes
reserved headroom     1,024 bytes  (enforced by test)
free bytes                197
```

197 bytes is not a feature. The prerequisite is the S3-hosted template delivery Encompass
already uses, which takes the inline bundle out of the 51,200-byte race. That single change
unblocks this work here and in MeridianLink.
