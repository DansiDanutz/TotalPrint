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

function nextScriptOrComment(markup, normalized, cursor) {
  let inTag = false;
  let quote = null;
  for (let index = cursor; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (inTag) {
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        inTag = false;
      }
      continue;
    }
    if (normalized.startsWith('<!--', index)) {
      return { type: 'comment', start: index };
    }
    if (normalized.startsWith('<script', index)) {
      const boundary = normalized[index + '<script'.length];
      if (boundary === '>' || /\s/u.test(boundary ?? '')) {
        return { type: 'script', start: index };
      }
    }
    if (character === '<' && /[A-Za-z!/?]/u.test(markup[index + 1] ?? '')) {
      inTag = true;
    }
  }
  return null;
}

function tagEnd(markup, start, description) {
  let quote = null;
  for (let index = start; index < markup.length; index += 1) {
    const character = markup[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  assert.fail(`unterminated ${description}`);
}

function extractInlineScripts(markup) {
  const normalized = markup.toLowerCase();
  const sources = [];
  let cursor = 0;
  while (cursor < markup.length) {
    const token = nextScriptOrComment(markup, normalized, cursor);
    if (!token) break;
    if (token.type === 'comment') {
      const commentEnd = normalized.indexOf('-->', token.start + '<!--'.length);
      assert.notEqual(commentEnd, -1, 'unterminated HTML comment');
      cursor = commentEnd + '-->'.length;
      continue;
    }
    const openingStart = token.start;
    const openingEnd = tagEnd(
      markup,
      openingStart + '<script'.length,
      'script opening tag',
    );
    let closingStart = openingEnd + 1;
    while (true) {
      closingStart = normalized.indexOf('</script', closingStart);
      assert.notEqual(closingStart, -1, 'missing script closing tag');
      const closingBoundary = normalized[closingStart + '</script'.length];
      if (closingBoundary === '>' || /\s/u.test(closingBoundary ?? '')) break;
      closingStart += '</script'.length;
    }
    const closingEnd = tagEnd(
      markup,
      closingStart + '</script'.length,
      'script closing tag',
    );
    const source = markup.slice(openingEnd + 1, closingStart);
    if (source) sources.push(source);
    cursor = closingEnd + 1;
  }
  return sources;
}

const inlineScripts = extractInlineScripts(html);
assert.deepEqual(
  extractInlineScripts('<SCRIPT>const covered = true;</ScRiPt \\t\\n recovered>'),
  ['const covered = true;'],
  'script discovery must cover browser-recovered casing and closing-tag forms',
);
for (const falseClosingName of ['scriptx', 'scripture']) {
  const retainedSource = `const covered = true; // </${falseClosingName}>\nconst broken = ;`;
  const retainedMarkup = `<script>${retainedSource}</script>`;
  assert.deepEqual(
    extractInlineScripts(retainedMarkup),
    [retainedSource],
    `script discovery must ignore </${falseClosingName}> false closing-tag prefixes`,
  );
  assert.throws(
    () => new vm.Script(extractInlineScripts(retainedMarkup)[0]),
    SyntaxError,
    `syntax after </${falseClosingName}> must remain inside the validated script`,
  );
}
const commentedScriptMarkup =
  '<!-- <SCRIPT> // harmless --> <script>const broken = ;</script>';
assert.deepEqual(
  extractInlineScripts(commentedScriptMarkup),
  ['const broken = ;'],
  'script-like markup inside HTML comments must not absorb executable scripts',
);
assert.throws(
  () => new vm.Script(extractInlineScripts(commentedScriptMarkup)[0]),
  SyntaxError,
  'invalid executable JavaScript after a commented script opener must fail validation',
);
const quotedCommentMarkerMarkup =
  '<div title="<!--"><script>const broken = ;</script><span>--></span>';
assert.deepEqual(
  extractInlineScripts(quotedCommentMarkerMarkup),
  ['const broken = ;'],
  'comment markers inside quoted attributes must remain attribute data',
);
assert.throws(
  () => new vm.Script(extractInlineScripts(quotedCommentMarkerMarkup)[0]),
  SyntaxError,
  'quoted comment markers must not hide a later executable script',
);
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
function yamlScalar(rawValue) {
  const trimmed = rawValue.trim();
  if (trimmed[0] === '"' || trimmed[0] === "'") {
    const quote = trimmed[0];
    const closingQuote = trimmed.indexOf(quote, 1);
    assert.notEqual(closingQuote, -1, 'unterminated quoted YAML scalar');
    const trailing = trimmed.slice(closingQuote + 1).trim();
    assert.ok(!trailing || trailing.startsWith('#'), 'unexpected YAML scalar suffix');
    return trimmed.slice(1, closingQuote);
  }
  return trimmed.replace(/\s+#.*$/u, '').trim();
}

function executableCodeqlRefs(workflow) {
  return workflow.split('\n').flatMap((line) => {
    const uses = line.match(/^\s*-\s+(?:uses|"uses"|'uses')\s*:\s*(.+)$/u);
    if (!uses) return [];
    const scalar = yamlScalar(uses[1]);
    const reference = scalar.match(
      /^(actions\/checkout|github\/codeql-action\/[^@\s]+)@([^\s]+)$/u,
    );
    return reference
      ? [{ action: reference[1], revision: reference[2] }]
      : [];
  });
}

function assertImmutableCodeqlRefs(workflow, minimum = 0) {
  const references = executableCodeqlRefs(workflow);
  assert.ok(references.length >= minimum, 'expected checkout, CodeQL init, and CodeQL analyze steps');
  for (const { action, revision } of references) {
    assert.match(
      revision,
      /^[0-9a-f]{40}$/,
      `CodeQL executable action ${action} must use an immutable 40-character revision`,
    );
  }
  return references;
}

const auditedCodeqlRefs = assertImmutableCodeqlRefs(codeqlWorkflow, 3);
assert.equal(
  auditedCodeqlRefs.length,
  3,
  'the audited workflow must retain exactly checkout, init, and analyze executable actions',
);
assert.throws(
  () =>
    assertImmutableCodeqlRefs(
      '  - uses: "github/codeql-action/autobuild@v4"',
    ),
  /immutable 40-character revision/u,
  'quoted mutable CodeQL action references must fail validation',
);
const codeqlOverrideKeyPattern =
  /^\s+(?:queries|config-file|"queries"|'queries'|"config-file"|'config-file')\s*:/mu;
assert.doesNotMatch(
  codeqlWorkflow,
  codeqlOverrideKeyPattern,
  'CodeQL query-suite and config-file overrides require explicit audited approval',
);
assert.match(
  '      "queries": ./narrow.qls',
  codeqlOverrideKeyPattern,
  'quoted query override keys must remain covered by the rejection guard',
);
assert.doesNotMatch(
  codeqlWorkflow,
  /(?:actions\/checkout|github\/codeql-action\/(?:init|analyze))@v\d+\b/,
  'CodeQL executable actions must not use mutable major-version tags',
);

console.log(`Site verification passed: contact delivery, interaction, security-header, and pinned-action contracts, and ${inlineScripts.length} inline script block are valid.`);
