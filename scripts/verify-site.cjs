const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const verifyWorkflow = fs.readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8');
const codeqlWorkflow = fs.readFileSync(path.join(root, '.github/workflows/codeql.yml'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const { buildContactMailto, initializeContactForm } = require(path.join(root, 'contact.js'));

const mailto = new URL(buildContactMailto({
  name: 'Maria Ionescu',
  phone: '0740 123 456',
  email: 'maria@example.com',
  eventType: 'Nuntă',
  eventDate: '2026-09-12',
  message: 'LOVE & MRS',
}));

assert.equal(mailto.protocol, 'mailto:');
assert.equal(mailto.pathname, 'contact@totalprint.ro');
assert.match(mailto.searchParams.get('subject'), /Nuntă/);
assert.match(mailto.searchParams.get('body'), /Maria Ionescu/);
assert.match(mailto.searchParams.get('body'), /0740 123 456/);
assert.match(mailto.searchParams.get('body'), /LOVE & MRS/);
assert.ok(mailto.href.length <= 1800, 'mailto URI must remain within the supported boundary');
assert.throws(
  () => buildContactMailto({
    name: 'Maria',
    phone: '0740 123 456',
    email: 'maria@example.com',
    eventType: 'Nuntă',
    eventDate: '2026-09-12',
    message: '😀'.repeat(500),
  }),
  /too long/i,
  'oversized encoded mailto payloads must fail before navigation',
);

assert.match(html, /<form[^>]+id="contactForm"/);
assert.doesNotMatch(html, /onsubmit=/);
assert.match(readme, /deploy[^\n]*(?:complete|all)[^\n]*(?:static|site)[^\n]*assets/i);
assert.match(readme, /contact\.js/);
assert.doesNotMatch(readme, /just deploy `index\.html`/i);
assert.match(html, /name="name"[^>]+maxlength="100"/);
assert.match(html, /name="phone"[^>]+maxlength="32"/);
assert.match(html, /name="email"[^>]+maxlength="254"/);
assert.match(html, /name="message"[^>]+maxlength="500"/);

let submitHandler;
const status = { textContent: '' };
const locationRef = { href: 'about:blank' };
const form = {
  addEventListener(type, handler) {
    assert.equal(type, 'submit');
    submitHandler = handler;
  },
};
const documentRef = {
  getElementById(id) {
    if (id === 'contactForm') return form;
    if (id === 'contactStatus') return status;
    return null;
  },
};
const oversizedDetails = {
  name: 'Maria',
  phone: '0740 123 456',
  email: 'maria@example.com',
  eventType: 'Nuntă',
  eventDate: '2026-09-12',
  message: '😀'.repeat(500),
};
initializeContactForm(documentRef, locationRef, () => Object.entries(oversizedDetails));
assert.equal(typeof submitHandler, 'function');
submitHandler({ preventDefault() {} });
assert.match(status.textContent, /prea lung/i);
assert.equal(locationRef.href, 'about:blank', 'oversized submit must not navigate');
for (const field of ['name', 'phone', 'email', 'eventType', 'eventDate', 'message']) {
  assert.match(html, new RegExp(`name="${field}"`), `missing named field: ${field}`);
}

assert.match(html, /<button[^>]+class="faq-q"[^>]+aria-expanded="false"/);
assert.match(html, /id="hamburger"[^>]+aria-controls="navLinks"[^>]+aria-expanded="false"/);
assert.doesNotMatch(html, /href="#"/);
assert.doesNotMatch(html, /this\.querySelector\('button'\)\.textContent='✓ Trimis!'/);
assert.doesNotMatch(html, /40740000000|0740 000 000/, 'placeholder phone channel must not be published');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(Boolean);
inlineScripts.forEach((source) => new vm.Script(source));

const siteHeaderRule = vercelConfig.headers.find((rule) => rule.source === '/(.*)');
assert.ok(siteHeaderRule, 'missing catch-all Vercel header rule');
const siteHeaders = Object.fromEntries(
  siteHeaderRule.headers.map(({ key, value }) => [key.toLowerCase(), value]),
);
assert.equal(siteHeaders['x-content-type-options'], 'nosniff');
assert.equal(siteHeaders['x-frame-options'], 'DENY');
assert.equal(siteHeaders['referrer-policy'], 'strict-origin-when-cross-origin');
assert.equal(siteHeaders['permissions-policy'], 'camera=(), microphone=(), geolocation=()');

assert.match(
  verifyWorkflow,
  /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\b/,
  'actions/checkout must be pinned to the verified v4 commit',
);
assert.match(
  verifyWorkflow,
  /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\b/,
  'actions/setup-node must be pinned to the verified v4 commit',
);
assert.doesNotMatch(
  verifyWorkflow,
  /uses:\s+actions\/(?:checkout|setup-node)@v\d+\b/,
  'official actions must not use mutable major-version tags',
);

assert.match(
  codeqlWorkflow,
  /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\b/,
  'CodeQL checkout must be pinned to the verified commit',
);
assert.match(
  codeqlWorkflow,
  /github\/codeql-action\/init@c54b30b7df092240050e69945842bc67aee0f0f4\b/,
  'CodeQL init must be pinned to the verified release',
);
assert.match(
  codeqlWorkflow,
  /github\/codeql-action\/analyze@c54b30b7df092240050e69945842bc67aee0f0f4\b/,
  'CodeQL analyze must be pinned to the verified release',
);
assert.match(codeqlWorkflow, /languages:\s*javascript-typescript/);
assert.match(codeqlWorkflow, /upload:\s*never/);
assert.match(
  codeqlWorkflow,
  /jq -s -e '\(\[\.\[\]\.runs\[\]\.results\[\]\?\] \| length\) == 0'/,
  'CodeQL must fail closed when SARIF contains any result',
);
assert.doesNotMatch(
  codeqlWorkflow,
  /(?:actions\/checkout|github\/codeql-action\/(?:init|analyze))@v\d+\b/,
  'CodeQL executable actions must not use mutable major-version tags',
);

console.log(`Site verification passed: contact delivery, interaction, security-header, and pinned-action contracts, and ${inlineScripts.length} inline script block are valid.`);
