/** Invite portal + object-path cheat sheet. Self-contained HTML: no external assets, strict CSP. */
const REPO = "https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway";

const escape = (value) => String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const PATHS = [
  ["Property.Street", "Subject property address"],
  ["Property.LegalDescription", "Legal description (title and appraisal personas)"],
  ["Loan.BaseLoanAmount", "Base loan amount"],
  ["Loan.InterestRate", "Note rate"],
  ["Loan.LoanType", "Loan type (Conventional, FHA, VA, ...)"],
  ["Milestones.CurrentStatus", "Current loan milestone"],
  ["Milestones.ClosingDate", "Scheduled closing date"],
  ["Fees", "Fee array (FeeType, Amount, PaidTo)"],
  ["Conditions", "Condition array (Description, Status, Category)"]
];

const ROUTES = [
  ["GET", "/v1/loans/{loanId}?paths=Property,Loan,Milestones", "Masked loan object"],
  ["PATCH", "/v1/loans/{loanId}/fees", "Queue a fee update"],
  ["POST", "/v1/loans/{loanId}/conditions", "Submit condition responses"],
  ["POST", "/v1/loans/{loanId}/documents", "Upload a base64 PDF"],
  ["GET", "/v1/loans/{loanId}/documents", "List loan documents"],
  ["GET", "/v1/loans/{loanId}/documents/{documentId}", "Download one PDF"],
  ["GET", "/v1/jobs/{jobId}", "Write job status"]
];

const renderPortal = ({ role, code, error } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BytePro Gateway — Vendor Access</title>
<meta name="robots" content="noindex">
<style>
:root{color-scheme:light dark;--ink:#101828;--muted:#475467;--line:#d0d5dd;--bg:#fff;--accent:#0b4f6c}
@media (prefers-color-scheme:dark){:root{--ink:#e4e7ec;--muted:#98a2b3;--line:#344054;--bg:#0d1117;--accent:#7cc4e0}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:62rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}h1{font-size:1.75rem;margin:0 0 .35rem}h2{font-size:1.15rem;margin:2.25rem 0 .75rem}
p{color:var(--muted);max-width:48rem}code{font:.86em ui-monospace,SFMono-Regular,Menlo,monospace;background:rgba(127,127,127,.14);padding:.1rem .3rem;border-radius:4px}
table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:.5rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
form{display:grid;gap:.9rem;max-width:26rem;margin-top:1rem}label{display:grid;gap:.3rem;font-weight:600;font-size:.9rem}
input{font:inherit;padding:.6rem .7rem;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit}
button{font:inherit;font-weight:650;padding:.7rem 1rem;border:0;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer}
pre#out{white-space:pre-wrap;word-break:break-all;border:1px solid var(--line);border-radius:8px;padding:1rem;min-height:3rem;background:rgba(127,127,127,.08)}
.notice{border-left:4px solid var(--accent);padding:.6rem 1rem;background:rgba(127,127,127,.08);color:var(--ink)}
.bad{border-color:#b42318}.pill{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:.15rem .55rem;font-size:.75rem;font-weight:700}
footer{margin-top:3rem;border-top:1px solid var(--line);padding-top:1.25rem;font-size:.9rem}a{color:var(--accent)}
</style>
</head>
<body>
<main>
<h1>BytePro Enterprise Cloud Gateway</h1>
<p>Role-scoped vendor access. This gateway passes through only the loan objects your persona is allowed to see, queues writes through a FIFO pipeline, and never stores loan data.</p>
${error ? `<p class="notice bad">${escape(error)}</p>` : ""}
${
  role
    ? `<h2>Provision your ${escape(role.label)} key</h2>
<p>This invite is locked to the <span class="pill">${escape(role.persona)}</span> persona. The key is shown once; store it in your secret manager.</p>
<form id="f">
<label>Company name<input name="tenantName" required maxlength="100" autocomplete="organization"></label>
<label>Developer email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
<button type="submit">Create API key</button>
</form>
<pre id="out">Waiting for your details.</pre>`
    : `<h2>Use your invite link</h2>
<p>Your lender shares a role-specific link such as <code>/portal?role=title&amp;code=…</code>. It opens a form that binds your new key to that role server-side; there is no admin password to collect and no persona picker to abuse.</p>
<p>No link yet? Ask your lender's integration contact, or read <a href="${REPO}#readme">the deployment guide</a>.</p>`
}
<h2>Read paths</h2>
<table><thead><tr><th>JSON path</th><th>Meaning</th></tr></thead><tbody>
${PATHS.map(([path, meaning]) => `<tr><td><code>${escape(path)}</code></td><td>${escape(meaning)}</td></tr>`).join("")}
</tbody></table>
<p>BytePro uses object notation, not numeric field IDs. Anything outside your persona's allowlist is removed before the response leaves the gateway; SSN, taxpayer ID, credit score, date of birth, income, assets, and liabilities are always removed.</p>
<h2>Endpoints</h2>
<table><thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead><tbody>
${ROUTES.map(([method, path, purpose]) => `<tr><td>${method}</td><td><code>${escape(path)}</code></td><td>${escape(purpose)}</td></tr>`).join("")}
</tbody></table>
<p>Writes return <code>202</code> with a <code>jobId</code>; poll <code>/v1/jobs/{jobId}</code>. PDFs up to 180,000 bytes are queued; larger PDFs (max 5 MB) upload synchronously and return <code>200</code>.</p>
<h2>Community maintained</h2>
<p>This is an independent, community-supported template, not a BytePro product. Every deployment is also a test: please <a href="${REPO}/issues/new/choose">open an issue</a> with sanitized evidence, or <a href="${REPO}/pulls">send a pull request</a> with a regression test. Never include API keys, invite codes, loan data, or borrower PII.</p>
<footer><a href="${REPO}">Source</a> · <a href="${REPO}/blob/main/README.md">Docs</a> · <a href="${REPO}/blob/main/llms.txt">llms.txt</a> · <a href="${REPO}/blob/main/CONTRIBUTING.md">Contributing</a></footer>
</main>
<script>
var ROLE = ${JSON.stringify(role?.role || "")};
var CODE = ${JSON.stringify(code || "")};
var form = document.getElementById("f");
if (form) form.addEventListener("submit", async function (event) {
  event.preventDefault();
  var out = document.getElementById("out");
  var target = { role: ROLE, code: CODE, tenantName: event.target.tenantName.value, email: event.target.email.value };
  out.textContent = "Provisioning…";
  try {
    var response = await fetch("/portal", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) });
    var body = await response.json().catch(function () { return {}; });
    out.textContent = response.ok
      ? "API key (shown once):\\n" + body.apiKey + "\\n\\nGateway base URL: " + location.origin + "\\nPersona: " + body.persona
      : body.error || "Provisioning failed (" + response.status + ")";
    if (response.ok) form.reset();
  } catch (error) {
    out.textContent = "Provisioning failed: " + error.message;
  }
});
</script>
</body>
</html>`;

module.exports = { renderPortal };
