/**
 * Persona path allowlists. Deny by default: a path that is not listed never
 * leaves the gateway. The blocked filter is a second, independent guard so a
 * broad allowlist (e.g. `Loan`) can never leak NPI.
 */
const PERSONAS = {
  TITLE_VENDOR: [
    "Property.Street",
    "Property.City",
    "Property.State",
    "Property.Zip",
    "Property.County",
    "Property.LegalDescription",
    "Loan.BaseLoanAmount",
    "Loan.InterestRate",
    "Loan.LoanType",
    "Loan.LoanPurpose",
    "Loan.LTV",
    "Loan.CLTV",
    "Milestones.CurrentStatus",
    "Milestones.ClosingDate",
    "Fees",
    "Conditions",
    "CustomFields"
  ],
  TPO_BROKER: [
    "Property",
    "Loan",
    "Borrower.FirstName",
    "Borrower.LastName",
    "Borrower.Email",
    "Borrower.HomePhone",
    "Borrower.MailingAddress",
    "Milestones",
    "Conditions",
    "Fees",
    "CustomFields"
  ],
  AMC_VENDOR: [
    "Property.Street",
    "Property.City",
    "Property.State",
    "Property.Zip",
    "Property.County",
    "Property.LegalDescription",
    "Loan.BaseLoanAmount",
    "Loan.LoanType",
    "Loan.LoanPurpose",
    "Milestones.CurrentStatus"
  ]
};

const BLOCKED = /(ssn|socialsecurity|taxpayer|credit|dateofbirth|birthdate|income|assets|liabilities|declarations)/i;

/** Deep-copies only the keys a path list allows, stripping blocked keys at any depth. */
function pick(value, paths) {
  if (value === null || value === undefined) return undefined;
  if (!paths.length) return undefined;
  if (paths.includes("")) return sanitize(value);
  if (Array.isArray(value)) return value.map((item) => pick(item, paths)).filter((item) => item !== undefined);
  if (typeof value !== "object") return undefined;

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED.test(key)) continue;
    const whole = paths.includes(key);
    const nested = paths.filter((path) => path.startsWith(`${key}.`)).map((path) => path.slice(key.length + 1));
    if (whole) out[key] = sanitize(child);
    else if (nested.length) {
      const masked = pick(child, nested);
      if (masked !== undefined && !(masked && typeof masked === "object" && !Array.isArray(masked) && !Object.keys(masked).length)) {
        out[key] = masked;
      }
    }
  }
  return out;
}

/** Removes blocked keys recursively, for allowlisted whole subtrees. */
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !BLOCKED.test(key))
      .map(([key, child]) => [key, sanitize(child)])
  );
}

/**
 * Returns `{ data }` for a known persona, or null when the persona is unknown
 * (fail closed). `roots` is the optional `?paths=` projection.
 */
function mask(loan, persona, roots) {
  const paths = PERSONAS[persona];
  if (!paths) return null;
  const selected = roots?.length ? paths.filter((path) => roots.includes(path.split(".")[0])) : paths;
  return selected.length ? { data: pick(loan, selected) || {} } : null;
}

module.exports = { PERSONAS, mask, pick, sanitize };
