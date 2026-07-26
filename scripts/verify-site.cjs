const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const { buildContactMailto } = require(path.join(root, 'contact.js'));

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

assert.match(html, /<form[^>]+id="contactForm"/);
assert.doesNotMatch(html, /onsubmit=/);
for (const field of ['name', 'phone', 'email', 'eventType', 'eventDate', 'message']) {
  assert.match(html, new RegExp(`name="${field}"`), `missing named field: ${field}`);
}

assert.match(html, /<button[^>]+class="faq-q"[^>]+aria-expanded="false"/);
assert.match(html, /id="hamburger"[^>]+aria-controls="navLinks"[^>]+aria-expanded="false"/);
assert.doesNotMatch(html, /href="#"/);
assert.doesNotMatch(html, /this\.querySelector\('button'\)\.textContent='✓ Trimis!'/);
assert.doesNotMatch(html, /40740000000|0740 000 000/, 'placeholder phone channel must not be published');

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .filter(Boolean);
inlineScripts.forEach((source) => new vm.Script(source));

console.log(`Site verification passed: contact delivery, interaction contracts, and ${inlineScripts.length} inline script block are valid.`);
