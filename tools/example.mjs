// Runs the README examples, checks that they report what the README shows, and writes the reports of the failing
// example to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, LIMITS } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Runs the tool on folders of the repository; the paths in the report are relative to the folder that is checked.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, LIMITS, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const failingArgs = ['examples/shop-api'];
const failing = await run(failingArgs);
process.stdout.write(failing.out);
expect('failing manifests', failing, 1, [
  'findings: 5 error, 17 warning, 2 info',
  'INFO     namespace-missing  api.yaml:4',
  'INFO     replicas-one-no-pdb  api.yaml:9',
  'ERROR    pss-host-namespaces  api.yaml:18',
  'WARNING  resources-requests-missing  api.yaml:20',
  'WARNING  readiness-probe-missing  api.yaml:20',
  'WARNING  image-tag-latest  api.yaml:21',
  'ERROR    pss-host-port  api.yaml:24',
  'WARNING  env-secret-plain  api.yaml:27',
  'ERROR    pss-privileged  api.yaml:31',
  'ERROR    pss-capabilities-add  api.yaml:33',
  'WARNING  image-tag-missing  api.yaml:39',
  'WARNING  pss-run-as-user-root  worker.yaml:17',
  'ERROR    pss-host-path  worker.yaml:20',
  'WARNING  image-tag-latest  worker.yaml:50',
  'GATE: FAIL - 5 errors'
], ['GATE: PASS', 'example-not-a-real-value']);

process.stdout.write('\n');
const fixedArgs = ['examples/shop-api-fixed', '--fail-on', 'warning'];
const fixed = await run(fixedArgs);
process.stdout.write(fixed.out);
expect('fixed manifests with --fail-on warning', fixed, 0, [
  'findings: 0 error, 0 warning, 0 info',
  'GATE: PASS (--fail-on warning)'
], ['ERROR', 'WARNING ']);

// The README shows the runs as they are printed.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
if (!readme.includes(failing.out)) problems.push('README: the sample output of the failing manifests differs from a real run');
if (!readme.includes(fixed.out)) problems.push('README: the sample output of the fixed manifests differs from a real run');

// The same manifests in the other formats, kept as examples of what each one looks like.
await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/shop-api.txt'), failing.out);
for (const [format, name] of [['markdown', 'shop-api.md'], ['json', 'shop-api.json'], ['csv', 'shop-api.csv']]) {
  const r = await run([...failingArgs, '--format', format]);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
