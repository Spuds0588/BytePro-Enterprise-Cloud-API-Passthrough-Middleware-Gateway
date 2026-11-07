const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const REPO = "https://github.com/Spuds0588/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway";
const PAGES = "https://spuds0588.github.io/BytePro-Enterprise-Cloud-API-Passthrough-Middleware-Gateway/";

const page = read("index.html");
const agents = read("agents.md");
const contributing = read("CONTRIBUTING.md");
const llms = read("llms.txt");
const readme = read("README.md");
const todo = read("todo.md");
const history = read("history.md");
const bugForm = read(".github/ISSUE_TEMPLATE/bug_report.yml");
const improvementForm = read(".github/ISSUE_TEMPLATE/feature_improvement.yml");
const issueConfig = read(".github/ISSUE_TEMPLATE/config.yml");
const prTemplate = read(".github/pull_request_template.md");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");

const flat = (text) => text.replace(/\s+/g, " ");

const formBlocks = (yaml) => `\n${yaml}`.split(/\n\s*-\s+type:\s+/).slice(1);
const formBlock = (yaml, id) => {
  const block = formBlocks(yaml).find((part) => new RegExp(`^\\s*id:\\s*${id}\\s*$`, "m").test(part));
  assert.ok(block, `issue form is missing the "${id}" field`);
  return block;
};
const requiredBlock = (yaml, id) => {
  const block = formBlock(yaml, id);
  assert.match(block, /validations:\s*\n\s*required:\s*true/, `"${id}" must have validations.required: true`);
  return block;
};
const requiredCheckboxes = (yaml, id) => {
  const block = formBlock(yaml, id);
  const options = (block.match(/^\s*-\s+label:/gm) || []).length;
  const required = (block.match(/^\s*required:\s*true$/gm) || []).length;
  assert.ok(options > 0, `"${id}" must define checkbox options`);
  assert.equal(required, options, `every "${id}" checkbox must be required: true`);
  return block;
};

test("landing page is self-contained, indexable, and machine-readable", () => {
  assert.match(page, new RegExp(`<link rel="canonical" href="${PAGES}">`));
  assert.match(page, /<link rel="alternate" type="text\/plain" href="\.\/llms\.txt"/);
  assert.ok(fs.existsSync(path.join(root, "llms.txt")), "the linked llms.txt must exist");
  assert.doesNotMatch(page, /<script[^>]+src=/i, "no external scripts");
  assert.doesNotMatch(page, /<link[^>]+stylesheet/i, "no external stylesheets");
  assert.match(page, /<meta name="description" content="[^"]{80,180}"/);

  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(page);
  assert.ok(ld, "JSON-LD block required");
  assert.deepEqual(JSON.parse(ld[1])["@graph"].map((node) => node["@type"]), ["WebSite", "SoftwareApplication", "FAQPage"]);
});

test("search and agent discovery files are published with the page", () => {
  assert.match(page, /<link rel="sitemap" type="application\/xml" href="\.\/sitemap\.xml">/);
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${PAGES}sitemap\\.xml$`, "m"));
  assert.match(sitemap, new RegExp(`<loc>${PAGES}</loc>`));
  assert.doesNotMatch(sitemap, /<loc>http:\/\//, "sitemap URLs must be https");
});

test("landing page pushes issues, pull requests, and contributor invitations", () => {
  assert.match(page, /id="community"/);
  for (const link of [`${REPO}/issues/new`, `${REPO}/pulls`, `${REPO}/blob/main/CONTRIBUTING.md`, `${REPO}/blob/main/agents.md`]) {
    assert.ok(page.includes(link), `landing page must link ${link}`);
  }
  assert.match(flat(page), /happy to add contributors/i);
  assert.match(flat(page), /Never include API keys/i);
  assert.match(flat(page), /no BytePro access and no AWS account/i);
  assert.match(flat(page), /shared responsibility/i);
  assert.doesNotMatch(flat(page), /production verified|deployed and verified/i);
});

test("landing page leads with documents and conditions for SEO and AEO", () => {
  assert.match(flat(page), /loan document upload/i);
  assert.match(flat(page), /condition responses/i);
  assert.match(page, /<h1[^>]*>BytePro Enterprise Cloud API Gateway<\/h1>/);
  assert.match(flat(page), /title commitment/i);
});

test("llms.txt is a complete, honest agent entry point", () => {
  for (const link of [REPO, `${REPO}/issues`, `${REPO}/pulls`, `${REPO}/blob/main/CONTRIBUTING.md`, `${REPO}/blob/main/agents.md`]) {
    assert.ok(llms.includes(link), `llms.txt must link ${link}`);
  }
  assert.match(llms, /## Community contract/);
  assert.match(llms, /## Instructions for coding agents/);
  assert.match(llms, /## Verification status and limitations/);
  assert.match(flat(llms), /happy to add contributors/i);
  assert.match(flat(llms), /Do not claim live BytePro or AWS verification/);
  assert.match(llms, /npm run verify/);
  assert.match(flat(llms), /documents and conditions are priority 1/i);
});

test("agents.md codifies YAGNI, one-line preference, cleanup, and community duties", () => {
  assert.match(agents, /## 0\. Community maintenance is part of the job/);
  assert.match(flat(agents), /open a GitHub issue/i);
  assert.match(flat(agents), /upstream/i);
  assert.match(flat(agents), /add contributors/i);
  assert.match(flat(agents), /YAGNI first/);
  assert.match(flat(agents), /Prefer the one-line solution/);
  assert.match(flat(agents), /limited memory/i);
  assert.match(flat(agents), /Delete, don't accumulate/);
  assert.match(flat(agents), /Never claim verification that did not happen/);
});

test("CONTRIBUTING.md explains the issue and pull-request workflow", () => {
  assert.match(contributing, /## Ways to help/);
  assert.match(contributing, /## Before opening an issue/);
  assert.match(contributing, /## Pull requests/);
  assert.match(contributing, /npm run verify/);
  assert.match(flat(contributing), /happy to add contributors/i);
  assert.match(flat(contributing), /Never include API keys/);
  assert.match(flat(contributing), /template\.yaml` must stay in sync/);
  assert.ok(flat(contributing).includes(`${REPO}/issues/new?template=bug_report.yml`));
  assert.ok(flat(contributing).includes(`${REPO}/issues/new?template=feature_improvement.yml`));
});

test("README points newcomers at every community surface and the priority workflow", () => {
  for (const target of ["CONTRIBUTING.md", "llms.txt", "index.html", "agents.md", "todo.md", "history.md"]) {
    assert.ok(readme.includes(target), `README must reference ${target}`);
  }
  assert.match(flat(readme), /happy to add contributors/i);
  assert.match(readme, /issues\/new/);
  assert.match(readme, /Community-supported — contribute aggressively/);
  assert.match(flat(readme), /loan document/i);
  assert.match(flat(readme), /condition/i);
});

test("tracking files keep the plan and the log honest", () => {
  assert.ok(todo.indexOf("## Priority 1") < todo.indexOf("## Phase 1"), "documents/conditions must stay at the top");
  assert.match(todo, /Loan document upload/);
  assert.match(todo, /Condition submission/);
  assert.match(history, /Append-only/);
  assert.match(history, /no AWS account/i);
});

test("bug report form demands a sanitized reproduction and forbids sensitive data", () => {
  assert.match(bugForm, /^name: Bug report$/m);
  assert.match(bugForm, /^title: "\[Bug\]: "$/m);
  for (const id of ["environment", "commit", "steps", "expected", "verify_result", "evidence"]) requiredBlock(bugForm, id);
  const redaction = requiredCheckboxes(bugForm, "redaction");
  for (const phrase of ["API keys", "invite codes", "passwords", "session tokens", "loan data", "borrower PII"]) {
    assert.ok(flat(redaction).toLowerCase().includes(phrase.toLowerCase()), `bug form redaction must forbid ${phrase}`);
  }
  assert.match(flat(bugForm), /production loan data/i);
  assert.doesNotMatch(bugForm, /\t/, "issue form YAML must not use tab indentation");
});

test("improvement form keeps scope small and asks how it will be verified", () => {
  assert.match(improvementForm, /^name: Feature or improvement$/m);
  for (const id of ["area", "problem", "proposal", "verification", "implementer"]) requiredBlock(improvementForm, id);
  const agreements = requiredCheckboxes(improvementForm, "agreements");
  assert.match(flat(agreements), /no API keys/i);
  assert.match(flat(improvementForm), /YAGNI/);
  assert.match(flat(improvementForm), /smallest/i);
  assert.doesNotMatch(improvementForm, /\t/, "issue form YAML must not use tab indentation");
});

test("issue chooser routes to the contributing guide and a support surface", () => {
  assert.match(issueConfig, /^blank_issues_enabled:\s*(true|false)$/m);
  assert.match(issueConfig, /^contact_links:$/m);
  const urls = [...issueConfig.matchAll(/^\s*url:\s*(\S+)$/gm)].map((match) => match[1]);
  assert.ok(urls.some((url) => url.endsWith("/blob/main/CONTRIBUTING.md")));
  assert.ok(urls.some((url) => /\/(issues|discussions)$/.test(url)));
  assert.match(flat(issueConfig), /sanitized|Never post API keys/i);
});

test("PR template requires verification disclosure, a regression test, and deploy honesty", () => {
  assert.match(prTemplate, /## What changed and why/);
  assert.match(prTemplate, /Fixes #/);
  assert.match(flat(prTemplate), /Regression test added or updated for this bug fix/i);
  assert.match(flat(prTemplate), /what was actually run/i);
  assert.match(flat(prTemplate), /Not validated against a real BytePro tenant/i);
  assert.match(flat(prTemplate), /Not validated against a live AWS deployment/i);
  assert.match(flat(prTemplate), /Do not check a box for a run that did not happen/i);
  assert.match(flat(prTemplate), /API keys/i);
  assert.match(flat(prTemplate), /borrower PII/i);
});

test("documented issue and pull-request links land on shipped templates", () => {
  for (const text of [page, readme, llms, contributing]) assert.ok(text.includes(`${REPO}/issues/new`));
  for (const text of [page, readme, llms, contributing]) assert.ok(text.includes(`${REPO}/pulls`));
  for (const file of [
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_improvement.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/pull_request_template.md"
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);
  }
});
