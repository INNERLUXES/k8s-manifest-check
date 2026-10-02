import { test } from 'node:test';
import assert from 'node:assert/strict';
import { USAGE, VERSION, csvCell, mdCell, parseArgs, safeText, toCsv, toJson, toMarkdown, toText } from '../src/index.js';
import { GOOD, check, cli, good, ids, run } from './helpers.js';

const BROKEN = good(['image: registry.example/web:1.0.0', 'image: web:latest']);
const PRIV = good(['              drop: [ALL]\n', '              drop: [ALL]\n            privileged: true\n']);

test('exit codes: 0 without a finding at the level, 1 with one, 2 for a usage or input error', async () => {
  assert.equal((await run({ 'ok.yaml': GOOD }, ['.'])).code, 0);
  assert.equal((await run({ 'bad.yaml': PRIV }, ['.'])).code, 1);
  assert.equal((await run({ 'ok.yaml': GOOD }, [])).code, 2);
  assert.equal((await run({}, ['missing'])).code, 2);
  assert.equal((await run({ 'readme.md': 'x' }, ['.'])).code, 2);
});

test('--fail-on: warnings fail only at the level warning, and info never fails', async () => {
  const warn = { 'w.yaml': BROKEN };
  assert.equal((await run(warn, ['.'])).code, 0);
  const strict = await run(warn, ['.', '--fail-on', 'warning']);
  assert.equal(strict.code, 1);
  assert.match(strict.out, /GATE: FAIL - 1 warning/);
  const info = { 'i.yaml': good(['  namespace: shop\n', '']) };
  const r = await run(info, ['.', '--fail-on', 'warning']);
  assert.equal(r.code, 0);
  assert.match(r.out, /INFO {5}namespace-missing/);
  assert.match(r.out, /GATE: PASS \(--fail-on warning\)/);
  assert.equal((await run(info, ['.', '--fail-on', 'info'])).code, 2);
});

test('arguments: unknown options, missing values, bad formats and addresses are usage errors that print the usage', async () => {
  for (const argv of [['--nope'], ['.', '--format'], ['.', '--format', 'xml'], ['https://example.test/'], ['-'], ['.', '--fail-on', '--format'], ['a', 'b'], ['.', '--fail-on', 'info']]) {
    const r = await cli(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, /Usage: k8s-manifest-check/);
    assert.equal(r.out, '');
  }
  assert.throws(() => parseArgs(['.', '--format']), /needs a value/);
});

test('arguments: --help and --version print and exit 0, and the usage lists the checks and the exit codes', async () => {
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  assert.match(USAGE, /pss-privileged/);
  assert.match(USAGE, /Exit codes: 0 no finding/);
  const version = await cli(['--version']);
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('input: a folder and one file give the same findings, and the path of the report is relative with forward slashes', async () => {
  const files = { 'k8s/prod/a.yaml': BROKEN };
  const folder = JSON.parse((await run(files, ['k8s', '--format', 'json'])).out);
  const file = JSON.parse((await run(files, ['k8s/prod/a.yaml', '--format', 'json'])).out);
  assert.equal(folder.target, 'k8s');
  assert.equal(folder.findings[0].file, 'prod/a.yaml');
  assert.equal(file.findings[0].file, 'a.yaml');
  assert.equal(folder.findings[0].id, file.findings[0].id);
  // A backslash separates folders only on Windows; on Linux and macOS it is a normal character in a file name.
  if (process.platform === 'win32') {
    const windows = JSON.parse((await run(files, ['k8s\\prod', '--format', 'json'])).out);
    assert.ok(!windows.target.includes('\\'));
  }
});

test('text report: the lines, the counts, the source with its address and the gate', async () => {
  const r = await check(BROKEN, { target: 'm' });
  const text = toText(r);
  assert.match(text, /^k8s-manifest-check: m\nread: 1 file, 1 document, 1 workload\nfindings: 0 error, 1 warning, 0 info\n/);
  assert.match(text, /WARNING {2}image-tag-latest {2}manifest\.yaml:22\n {9}about: Deployment web, container web\n/);
  assert.match(text, / {9}source \(Images, Image pull policy\): "You should avoid using the :latest tag/);
  assert.match(text, / {11}https:\/\/kubernetes\.io\/docs\/concepts\/containers\/images\//);
  assert.match(text, /GATE: PASS \(--fail-on error\)\n$/);
  const pss = toText(await check(good(['drop: [ALL]', 'drop: [NET_RAW]'])));
  assert.match(pss, / {9}profile: Restricted, page field spec\.containers\[\*\]\.securityContext\.capabilities\.drop\n/);
});

test('markdown report: a table with the profile and the source links, and the gate line', async () => {
  const md = toMarkdown(await check(BROKEN, { target: 'm' }));
  assert.match(md, /^## k8s-manifest-check: 0 error, 1 warning, 0 info\n\nm, 1 file, 1 document, 1 workload\.\n/);
  assert.match(md, /\| Severity \| Check \| Where \| About \| Profile \| Message \| Fix \| Source \|/);
  assert.match(md, /\[Images, Image pull policy\]\(https:\/\/kubernetes\.io\/docs\/concepts\/containers\/images\/\)/);
  assert.match(md, /\*\*Gate passed\*\* \(--fail-on error\)\./);
  assert.match(toMarkdown(await check(GOOD)), /No findings\./);
});

test('markdown report: pipes, angle brackets and line breaks from a manifest cannot break the table or become HTML', async () => {
  const name = 'a|b<script>x</script>&';
  const r = await check(good(['name: web\n  namespace', `name: "${name}"\n  namespace`], ['image: registry.example/web:1.0.0', 'image: web']));
  const md = toMarkdown(r);
  assert.ok(!md.includes('<script>'));
  assert.ok(md.includes('a\\|b&lt;script&gt;'));
  assert.equal(mdCell('x\r\ny|z\\'), 'x y\\|z\\\\');
  for (const line of md.split('\n').filter((l) => l.startsWith('| warning'))) assert.equal(line.replace(/\\\|/g, '').split('|').length, 10);
});

test('json report: the whole report with the files, counts, findings with their sources, notes and the gate', async () => {
  const r = JSON.parse(toJson(await check(BROKEN, { target: 'm', version: '9.9.9' })));
  assert.equal(r.tool, 'k8s-manifest-check');
  assert.equal(r.version, '9.9.9');
  assert.deepEqual(r.input, { files: [{ path: 'manifest.yaml', bytes: Buffer.byteLength(BROKEN), documents: 1 }], documents: 1, workloads: 1 });
  assert.deepEqual(r.counts, { error: 0, warning: 1, info: 0 });
  assert.deepEqual(r.gate, { failOn: 'error', pass: true, reason: '' });
  assert.equal(r.findings[0].manual[0].page, 'Images');
});

test('csv report: RFC 4180 quoting with CRLF line ends, one row per finding, and a formula is defused', async () => {
  const r = await check(BROKEN);
  const csv = toCsv(r);
  const rows = csv.split('\r\n');
  assert.equal(rows[0], 'severity,id,file,line,kind,name,container,profile,field,message,fix,source_page,source_section,source_url');
  assert.equal(rows.length, 3);
  assert.match(rows[1], /^warning,image-tag-latest,manifest\.yaml,22,Deployment,web,web,,,"The image web:latest/);
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell(null), '');
});

test('safeText: control, line separator and direction characters become a space, and the length is cut', () => {
  assert.equal(safeText('a\u001b[31mb\u202ec\u2028d'), 'a [31mb c d');
  assert.equal(safeText('x'.repeat(300), 20), `${'x'.repeat(17)}...`);
  assert.equal(safeText(42), '42');
});

test('terminal safety: a name made of escape sequences and direction controls is cleaned in every format', async () => {
  const evil = 'web\u001b[2J\u202e\u2028x';
  const r = await check(good(['name: web\n  namespace', `name: "${evil.replace(/\u001b/g, '\\e').replace(/\u202e/g, '\\u202e').replace(/\u2028/g, '\\L')}"\n  namespace`], ['image: registry.example/web:1.0.0', 'image: web']));
  for (const out of [toText(r), toMarkdown(r), toJson(r), toCsv(r)]) {
    assert.doesNotMatch(out, /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f\u202e\u2028]/);
  }
  assert.equal(r.findings[0].name.includes('\u001b'), false);
});

test('no value of a manifest is printed: not an environment value, not a Secret, not a command', async () => {
  const text = `${good(['image: registry.example/web:1.0.0', 'image: web'])}---\nkind: Secret\nmetadata: {name: s}\ndata:\n  token: c2VjcmV0LXZhbHVl\n`.replace('        - name: web\n', '        - name: web\n          command: ["run-the-secret-command"]\n          env:\n            - {name: DB_PASSWORD, value: plain-secret-value}\n');
  const r = await check(text);
  assert.ok(ids(r).includes('env-secret-plain'));
  for (const out of [toText(r), toMarkdown(r), toJson(r), toCsv(r)]) {
    assert.ok(!out.includes('plain-secret-value'));
    assert.ok(!out.includes('c2VjcmV0LXZhbHVl'));
    assert.ok(!out.includes('run-the-secret-command'));
  }
});
