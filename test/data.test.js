import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { BASELINE_CAPABILITIES, FACTS, FINDINGS, ORDER, PSS_CONTROLS, RESTRICTED_ADDED_CAPABILITY, SECCOMP_ALLOWED, SEVERITIES, SOURCES, VERSION_NOTES, WORKLOAD_PATHS, manualFor, sourceUrl } from '../src/index.js';

const dir = new URL('../research/sources/', import.meta.url);
const page = async (id) => readFile(new URL(SOURCES.find((s) => s.id === id).file, dir), 'utf8');
const quotes = (t) => t.split(String.fromCharCode(0x2019)).join("'").split(String.fromCharCode(0x2018)).join("'").split(String.fromCharCode(0x201c)).join('"').split(String.fromCharCode(0x201d)).join('"');
// Text compared without line breaks, runs of white space or the typographic quotes.
const flat = (t) => quotes(t).replace(/\s+/g, ' ').trim();
const has = (text, needle) => flat(text).includes(flat(needle));
const MINOR = new Set(['# Note:', '# Tip:', '# Warning:', '# Caution:', '# Important:']);

// The text of one section of a saved page: from its heading to the next heading that is not a note.
function section(text, title) {
  const lines = text.split('\n').map((l) => l.replace(/ #$/, ''));
  const at = lines.indexOf(`# ${title}`);
  assert.ok(at >= 0, `# ${title}`);
  let end = at + 1;
  while (end < lines.length && !(lines[end].startsWith('# ') && !MINOR.has(lines[end]))) end += 1;
  return lines.slice(at, end).join('\n');
}

test('sources: every saved page has its address on the first line and holds text', async () => {
  for (const s of SOURCES) {
    const text = await page(s.id);
    assert.equal(text.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(text.length > 4000, `${s.file} holds the page text`);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(dir)).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: the pages come from the Kubernetes documentation only', () => {
  for (const s of SOURCES) assert.match(s.url, /^https:\/\/kubernetes\.io\/docs\/(?:concepts|tasks)\/[a-z0-9/-]+\/$/, s.url);
  assert.equal(sourceUrl('pss'), 'https://kubernetes.io/docs/concepts/security/pod-security-standards/');
});

test('sources: the title of every page is a heading of the saved text', async () => {
  for (const s of SOURCES) {
    const lines = (await page(s.id)).split('\n');
    assert.ok(lines.includes(`# ${s.title}`), `${s.file}: # ${s.title}`);
  }
});

test('facts: every quoted sentence is on the saved page it names, word for word', async () => {
  assert.ok(Object.keys(FACTS).length >= 40);
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), `${key}: source`);
    assert.ok(has(await page(fact.source), fact.text), `${key}: "${fact.text}"`);
  }
});

test('facts: the section of every fact is a heading of the saved page, and the sentence is under it', async () => {
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(has(section(await page(fact.source), fact.section), fact.text), `${key}: the sentence is under ${fact.section}`);
  }
});

test('facts: no sentence is quoted twice under two names', () => {
  const seen = new Map();
  for (const [key, fact] of Object.entries(FACTS)) {
    const id = `${fact.source}|${flat(fact.text)}`;
    assert.ok(!seen.has(id), `${key} repeats ${seen.get(id)}`);
    seen.set(id, key);
  }
});

test('pss: every field path of every control is listed by the page under the profile the tool names', async () => {
  const text = await page('pss');
  const baseline = section(text, 'Baseline');
  const restricted = section(text, 'Restricted');
  for (const [key, control] of Object.entries(PSS_CONTROLS)) {
    const body = control.profile === 'Baseline' ? baseline : restricted;
    assert.ok(body.includes(control.control), `${key}: the control name ${control.control}`);
    for (const field of control.fields) {
      const paths = field.includes('{c}') ? ['containers', 'initContainers'].map((c) => field.split('{c}').join(c)) : [field];
      for (const path of paths) assert.ok(body.includes(`\n- ${path}\n`), `${key}: ${path} under ${control.profile}`);
    }
  }
});

test('pss: the capabilities that Baseline allows are the allowed values of its Capabilities control, in the page order', async () => {
  const baseline = section(await page('pss'), 'Baseline');
  const start = baseline.indexOf('spec.containers[*].securityContext.capabilities.add');
  const end = baseline.indexOf('HostPath Volumes', start);
  const listed = baseline.slice(start, end).split('\n').filter((l) => /^- [A-Z_]+$/.test(l)).map((l) => l.slice(2));
  assert.deepEqual(listed, BASELINE_CAPABILITIES);
});

test('pss: the one capability that Restricted allows back and the seccomp values it allows are on the page', async () => {
  const restricted = section(await page('pss'), 'Restricted');
  assert.equal(RESTRICTED_ADDED_CAPABILITY, 'NET_BIND_SERVICE');
  assert.ok(has(restricted, `only permitted to add back the ${RESTRICTED_ADDED_CAPABILITY} capability`));
  assert.deepEqual(SECCOMP_ALLOWED, ['RuntimeDefault', 'Localhost']);
  const seccomp = restricted.slice(restricted.indexOf('Seccomp (v1.19+)'), restricted.indexOf('Capabilities (v1.22+)'));
  for (const value of SECCOMP_ALLOWED) assert.ok(seccomp.includes(`\n- ${value}\n`), value);
});

test('pss: the profile of every control is the one that the findings use, and the page says Baseline controls come first', async () => {
  for (const f of FINDINGS.filter((x) => x.control)) {
    assert.equal(PSS_CONTROLS[f.control].profile, f.profile, f.id);
    assert.equal(f.severity, f.profile === 'Baseline' ? 'error' : 'warning', f.id);
  }
  assert.ok(has(await page('pss'), 'Everything from the Baseline policy'));
});

test('workloads: the Pod spec paths are the pod template paths of each kind', () => {
  assert.deepEqual(Object.keys(WORKLOAD_PATHS), ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);
  assert.deepEqual(WORKLOAD_PATHS.CronJob, ['spec', 'jobTemplate', 'spec', 'template', 'spec']);
  assert.deepEqual(WORKLOAD_PATHS.Pod, ['spec']);
});

test('version notes: the sentences about versions are on the saved pages, and the tool invents no version', async () => {
  for (const n of VERSION_NOTES) assert.ok(has(section(await page(n.source), n.section), n.text), n.text);
  const source = await readFile(new URL('../src/data.js', import.meta.url), 'utf8');
  for (const line of source.split('\n')) {
    if (/\bv?1\.\d+\b/.test(line)) assert.ok(line.includes("control: '") || line.includes("text: '"), `a version in data.js that is not a page text: ${line.trim()}`);
  }
});

test('findings: every check has a unique id, a severity, an order and facts that exist', () => {
  assert.ok(FINDINGS.length >= 25);
  assert.equal(new Set(FINDINGS.map((f) => f.id)).size, FINDINGS.length);
  for (const f of FINDINGS) {
    assert.match(f.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(SEVERITIES.includes(f.severity), f.id);
    assert.equal(typeof ORDER[f.id], 'number');
    for (const key of [...f.facts, ...(f.optional ?? [])]) assert.ok(FACTS[key], `${f.id}: ${key}`);
  }
  const rank = FINDINGS.map((f) => SEVERITIES.indexOf(f.severity));
  assert.deepEqual(rank, [...rank].sort((a, b) => a - b));
});

test('findings: every fact of data.js is used by at least one check', () => {
  const used = new Set(FINDINGS.flatMap((f) => [...f.facts, ...(f.optional ?? [])]));
  for (const key of Object.keys(FACTS)) assert.ok(used.has(key), `${key} is not quoted by any check`);
});

test('findings: the checks that rest on a page quote it, and the ones about the file itself do not', () => {
  const own = ['file-not-read', 'yaml-not-read', 'limit-reached', 'value-not-read'];
  for (const f of FINDINGS) assert.equal(f.facts.length === 0, own.includes(f.id), f.id);
  const m = manualFor('pss-privileged');
  assert.equal(m.length, 2);
  assert.deepEqual(Object.keys(m[0]).sort(), ['page', 'quote', 'section', 'url']);
  assert.equal(m[0].url, 'https://kubernetes.io/docs/concepts/security/pod-security-standards/');
  assert.throws(() => manualFor('pss-privileged', ['img-digest-pins']), /does not quote/);
});
