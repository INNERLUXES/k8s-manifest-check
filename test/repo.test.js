import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS, FINDINGS, SOURCES, VERSION_NOTES } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/software-development/cloud-native-development';

async function markdownFiles() {
  const docs = (await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`);
  return ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...docs];
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'k8s-manifest-check');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['k8s-manifest-check'], 'bin/k8s-manifest-check.js');
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  assert.deepEqual(Object.keys(JSON.parse(await read('package-lock.json')).packages), ['']);
});

test('README: the closing Background section links to the cloud native development page with the agreed anchor text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[cloud native application development services](${HOMEPAGE})`));
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README and documents: no date and no year anywhere', async () => {
  for (const file of await markdownFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.doesNotMatch(text, /within\s+\d|\bSLA\b|business days|hours|within a (?:day|week)|\bdays\b|\bweeks\b|\bpromptly\b|\bquickly\b/i);
});

test('the documents carry no company numbers and no promise', async () => {
  for (const file of await markdownFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, /\b\d[\d,]*\+? (?:clients|customers|projects|engineers|developers)\b/i, file);
    assert.doesNotMatch(text, /\bguarantee[sd]?\b/i, file);
  }
});

test('workflows: every action is pinned to a commit, the CI runs three systems and two Node versions, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --format markdown >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  assert.match(ci, /npm run check/);
  assert.match(ci, /npm run example/);
});

test('workflows: the pinned commits are the ones that the sibling repository uses', async () => {
  const known = new Set([
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
    'github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
    'actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8'
  ]);
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    for (const m of text.matchAll(/^\s*- uses: (\S+)/gm)) assert.ok(known.has(m[1]), `${name}: ${m[1]}`);
  }
  assert.match(await read('.github/workflows/ci.yml'), /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  for (const m of (await read('README.md')).matchAll(/uses: (\S+)/g)) assert.ok(known.has(m[1]), `README: ${m[1]}`);
});

test('release workflow: a tgz, a CycloneDX SBOM and SHA256SUMS named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/k8s-manifest-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.doesNotMatch(release, /pwa-offline-check/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/output\/\*\.csv -text$/m);
});

test('the repository names no other project and no tool that wrote it', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md']) {
    const text = await read(file);
    assert.doesNotMatch(text, /sql-migration-check|openapi-security-check|desktop-release-check|pwa-offline-check|electron/i, file);
  }
});

test('docs: every finding id of the tool is described in docs/method.md, in the README table, in docs/rules-and-sources.md and in the changelog', async () => {
  const method = await read('docs/method.md');
  const readme = await read('README.md');
  const sources = await read('docs/rules-and-sources.md');
  const changelog = await read('CHANGELOG.md');
  for (const f of FINDINGS) {
    assert.ok(method.includes(`\`${f.id}\``), `docs/method.md: ${f.id}`);
    assert.ok(method.includes(`### \`${f.id}\``), `docs/method.md heading: ${f.id}`);
    assert.ok(readme.includes(`| \`${f.id}\` |`), `README: ${f.id}`);
    assert.ok(sources.includes(`\`${f.id}\``), `docs/rules-and-sources.md: ${f.id}`);
    assert.ok(changelog.includes(`\`${f.id}\``), `CHANGELOG: ${f.id}`);
  }
});

test('docs: docs/rules-and-sources.md quotes every sentence of src/data.js and lists every saved page', async () => {
  const sources = await read('docs/rules-and-sources.md');
  for (const [key, fact] of Object.entries(FACTS)) assert.ok(sources.includes(fact.text.replace(/\|/g, '\\|')), key);
  for (const n of VERSION_NOTES) assert.ok(sources.includes(n.text), n.text);
  for (const s of SOURCES) {
    assert.ok(sources.includes(s.url), s.url);
    assert.ok(sources.includes(`research/sources/${s.file}`), s.file);
  }
});

test('docs: docs/limits.md quotes the sentences about versions in the words of the pages', async () => {
  const limits = await read('docs/limits.md');
  for (const n of VERSION_NOTES) assert.ok(limits.includes(n.text.replace(/\.$/, '')), n.text);
});

test('README: the usage, the options and the exit codes are the ones of the tool', async () => {
  const readme = await read('README.md');
  for (const text of ['--format <name>', '--fail-on warning', 'info never fails the run']) assert.ok(readme.includes(text), text);
  assert.match(readme, /`0` no finding at the `--fail-on` level, `1` at least one such finding/);
  assert.match(readme, /`2` a usage or input error/);
});

test('the examples: a made-up shop API with problems, a fixed one, and the reports in every format', async () => {
  const bad = (await readdir(resolve(root, 'examples/shop-api'))).sort();
  assert.deepEqual(bad, ['api.yaml', 'worker.yaml']);
  const fixed = (await readdir(resolve(root, 'examples/shop-api-fixed'))).sort();
  assert.deepEqual(fixed, ['api.yaml', 'worker.yaml']);
  assert.deepEqual((await readdir(resolve(root, 'examples/output'))).sort(), ['shop-api.csv', 'shop-api.json', 'shop-api.md', 'shop-api.txt']);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket|\beval\(|new Function\(|\brequire\(|\bimport\(/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src reads only what is named: the only imports of the file system are in src/files.js and src/cli.js', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'files.js') assert.match(text, /from 'node:fs\/promises'/);
    else if (file === 'cli.js') assert.match(text, /from 'node:fs(?:\/promises)?'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('the YAML reader keeps its refusals and its limits', async () => {
  const text = await read('src/yaml.js');
  for (const word of ['anchor (&name) is refused', 'alias (*name) is refused', 'tag (! or !!) is refused', 'merge key (<<) is refused', 'duplicate key']) assert.ok(text.includes(word), word);
  assert.match(text, /maxDepth: 64/);
  assert.match(text, /maxNodes: 200000/);
  assert.match(text, /maxDocuments: 500/);
  assert.match(text, /maxScalarChars: 262144/);
  assert.doesNotMatch(text, /new RegExp/);
});

test('the tool never reads the value of an environment variable into a finding', async () => {
  const check = await read('src/check.js');
  const env = check.slice(check.indexOf('// secrets as plain environment values'), check.indexOf('if (c.group !== \'containers\') continue;'));
  assert.ok(env.includes('The value is not shown here.'));
  assert.doesNotMatch(env, /message: `[^`]*\$\{(?:value|valueEntry)/);
});

test('no file holds a control byte (0x01 to 0x08) or a token-shaped string, and text files end with a line end', async () => {
  const names = [];
  async function walk(dir) {
    for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const rel = dir === '.' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(rel);
      else names.push(rel);
    }
  }
  await walk('.');
  assert.ok(names.length > 50);
  const prefixes = [['g', 'h', 'p', '_'].join(''), ['github', 'pat', ''].join('_')];
  for (const name of names) {
    const text = await read(name);
    assert.doesNotMatch(text, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), name);
    for (const prefix of prefixes) assert.ok(!text.includes(prefix), `${name}: ${prefix}`);
    if (!name.startsWith('research/') && !name.endsWith('.csv')) assert.ok(text === '' || text.endsWith('\n'), `${name}: ends with a line end`);
  }
});
