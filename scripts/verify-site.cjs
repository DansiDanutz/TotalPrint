const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const verifyWorkflow = fs.readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8');
const codeqlWorkflow = fs.readFileSync(path.join(root, '.github/workflows/codeql.yml'), 'utf8');
const canonicalCodeqlWorkflow = "name: CodeQL\n\non:\n  pull_request:\n  push:\n    branches: [main]\n  schedule:\n    - cron: \"23 4 * * 1\"\n\nconcurrency:\n  group: codeql-${{ github.ref }}\n  cancel-in-progress: true\n\npermissions:\n  actions: read\n  contents: read\n\njobs:\n  analyze:\n    runs-on: ubuntu-latest\n    timeout-minutes: 20\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - uses: github/codeql-action/init@c54b30b7df092240050e69945842bc67aee0f0f4 # v4.37.3\n        with:\n          languages: javascript-typescript\n      - uses: github/codeql-action/analyze@c54b30b7df092240050e69945842bc67aee0f0f4 # v4.37.3\n        with:\n          output: ../results\n          upload: never\n          upload-database: false\n      - name: Report and reject CodeQL findings\n        run: |\n          jq -r '.runs[].results[]? | [.ruleId, .locations[0].physicalLocation.artifactLocation.uri, (.locations[0].physicalLocation.region.startLine // 0), .message.text] | @tsv' ../results/*.sarif\n          jq -s -e '([.[].runs[].results[]?] | length) == 0' ../results/*.sarif\n";
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

const siteScript = fs.readFileSync(path.join(root, 'site.js'), 'utf8');
const scriptMarkerCount = html.toLowerCase().split('<script').length - 1;
assert.equal(
  scriptMarkerCount,
  2,
  'index.html must contain only the two audited external script references',
);
assert.ok(
  !html.includes('<!--') && !html.includes('-->'),
  'index.html must not contain comment delimiters that can deactivate audited scripts',
);
assert.match(html, /<script src="contact\.js"><\/script>/);
assert.match(html, /<script src="site\.js"><\/script>/);
assert.ok(
  html.indexOf('<script src="contact.js"></script>') <
    html.indexOf('<script src="site.js"></script>'),
  'contact.js must load before site.js consumes its global initializer',
);
assert.match(
  html,
  /<\/footer>\s*<script src="contact\.js"><\/script>\s*<script src="site\.js"><\/script>\s*<\/body>\s*<\/html>\s*$/u,
  'the audited scripts must be active elements at the end of the document body',
);
new vm.Script(siteScript, { filename: 'site.js' });


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

function assertCanonicalCodeqlWorkflow(workflow) {
  assert.equal(
    workflow,
    canonicalCodeqlWorkflow,
    'CodeQL workflow must exactly match the audited executable release contract',
  );
}

assertCanonicalCodeqlWorkflow(codeqlWorkflow);
assert.throws(
  () => assertCanonicalCodeqlWorkflow(
    codeqlWorkflow.replace(
      'jobs:\n',
      'templates:\n  include: [ &evil { uses: docker://alpine:latest } ]\njobs:\n',
    ).replace(
      '    steps:\n',
      '    steps:\n      - *evil\n',
    ),
  ),
  /exactly match the audited executable release contract/u,
  'YAML anchors and aliases must not inject executable action mappings',
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
assert.match(
  codeqlWorkflow,
  /^        run: \|\n          jq -r '[^\n]+' \.\.\/results\/\*\.sarif\n          jq -s -e '\(\[\.\[\]\.runs\[\]\.results\[\]\?\] \| length\) == 0' \.\.\/results\/\*\.sarif$/mu,
  'the active release step must report and reject SARIF findings with the audited commands',
);
function yamlScalar(rawValue) {
  const trimmed = rawValue.trim();
  assert.doesNotMatch(
    trimmed,
    /^[>|]/u,
    'block-scalar action references are outside the audited workflow grammar',
  );
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
    const uses = line.match(/^\s*(?:-\s*)?(?:uses|"uses"|'uses')\s*:\s*(.+)$/u);
    if (!uses) return [];
    const scalar = yamlScalar(uses[1]);
    const reference = scalar.match(/^([^@\s]+)@([^\s]+)$/u);
    assert.ok(
      reference,
      `unsupported executable action reference: ${scalar}`,
    );
    return [{ action: reference[1], revision: reference[2] }];
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
assert.deepEqual(
  auditedCodeqlRefs.map(({ action }) => action),
  [
    'actions/checkout',
    'github/codeql-action/init',
    'github/codeql-action/analyze',
  ],
  'the audited workflow must retain exactly the approved checkout, init, and analyze actions',
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
  /(?:^\s*|[,{}]\s*)(?:queries|config-file|"queries"|'queries'|"config-file"|'config-file')\s*:/mu;
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
assert.throws(
  () =>
    assertImmutableCodeqlRefs(
      '- name: Autobuild\n  uses: github/codeql-action/autobuild@v4',
    ),
  /immutable 40-character revision/u,
  'named multi-line steps must not hide mutable CodeQL action references',
);
assert.match(
  'with: { languages: javascript-typescript, queries: ./narrow.qls }',
  codeqlOverrideKeyPattern,
  'flow-mapping query override keys must remain covered by the rejection guard',
);
const unsupportedCodeqlYamlPattern = /^\s*(?:-\s*(?:\{|\?)|\?\s+)/mu;
const unsupportedUsesContinuationPattern =
  /^\s*(?:-\s*)?(?:uses|"uses"|'uses')\s*:\s*(?:#.*)?$/mu;
assert.doesNotMatch(
  codeqlWorkflow,
  unsupportedCodeqlYamlPattern,
  'CodeQL workflow must use audited block-style steps and implicit mapping keys',
);
assert.doesNotMatch(
  codeqlWorkflow,
  unsupportedUsesContinuationPattern,
  'CodeQL action references must remain on the uses key line',
);
assert.doesNotMatch(
  codeqlWorkflow,
  /\\/u,
  'escape-bearing YAML is outside the audited CodeQL workflow grammar',
);
assert.match(
  '- { uses: github/codeql-action/autobuild@v4 }',
  unsupportedCodeqlYamlPattern,
  'flow-style steps must remain outside the audited workflow grammar',
);
assert.match(
  '? queries\n: ./narrow.qls',
  unsupportedCodeqlYamlPattern,
  'explicit mapping keys must remain outside the audited workflow grammar',
);
assert.match(
  '- ? uses\n  : docker://alpine:latest',
  unsupportedCodeqlYamlPattern,
  'sequence-item explicit keys must remain outside the audited workflow grammar',
);
assert.throws(
  () => assertImmutableCodeqlRefs('- uses: >-\n    vendor/report-action@main'),
  /block-scalar action references/u,
  'block-scalar action references must remain outside the audited workflow grammar',
);
assert.throws(
  () => assertImmutableCodeqlRefs('- uses: vendor/report-action@main'),
  /immutable 40-character revision/u,
  'every third-party action reference must be inspected before allowlist validation',
);
assert.throws(
  () => assertImmutableCodeqlRefs('- uses: docker://alpine:latest'),
  /unsupported executable action reference/u,
  'container actions without an at-sign must fail instead of escaping action validation',
);
assert.match(
  '"quer\\u0069es": ./narrow.qls',
  /\\/u,
  'escaped quoted keys must remain outside the audited workflow grammar',
);
assert.match(
  '- uses:\n    vendor/report-action@main',
  unsupportedUsesContinuationPattern,
  'continued plain action scalars must remain outside the audited workflow grammar',
);
assert.match(
  '- uses: # approved helper\n    vendor/report-action@main',
  unsupportedUsesContinuationPattern,
  'comment-only uses values must not hide continued mutable action references',
);
assert.doesNotMatch(
  codeqlWorkflow,
  /(?:actions\/checkout|github\/codeql-action\/(?:init|analyze))@v\d+\b/,
  'CodeQL executable actions must not use mutable major-version tags',
);

console.log(`Site verification passed: contact delivery, interaction, security-header, and pinned-action contracts, and the external site script is valid.`);
