import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, checkManifests, compareNames, diskSource, displayPath, isManifestName, memorySource } from '../src/index.js';
import { GOOD, check, find, ids, withFiles } from './helpers.js';

test('files: only .yaml and .yml are manifests, letter case ignored', () => {
  assert.equal(isManifestName('a.yaml'), true);
  assert.equal(isManifestName('a.YML'), true);
  assert.equal(isManifestName('a.json'), false);
  assert.equal(isManifestName('yaml'), false);
  assert.equal(isManifestName('a.yaml.bak'), false);
});

test('files: a folder is read below its root, in code unit order, and node_modules and .git are skipped', async () => {
  await withFiles({ 'b.yaml': GOOD, 'a/z.yml': GOOD, 'a.yaml': GOOD, 'readme.md': 'x', 'node_modules/p/x.yaml': GOOD, '.git/c.yaml': GOOD, 'C.YAML': GOOD }, async (dir) => {
    const listing = await (await diskSource(dir)).list();
    assert.deepEqual(listing.files.map((f) => f.path), ['C.YAML', 'a.yaml', 'a/z.yml', 'b.yaml']);
    assert.deepEqual(listing.problems, []);
  });
});

test('files: one file as the input is read, with its name as the path', async () => {
  await withFiles({ 'only.yaml': GOOD, 'other.yaml': GOOD }, async (dir) => {
    const source = await diskSource(resolve(dir, 'only.yaml'));
    const report = await checkManifests(source, { target: 'only.yaml' });
    assert.deepEqual(report.input.files.map((f) => f.path), ['only.yaml']);
    assert.equal(report.input.workloads, 1);
  });
});

test('files: paths are shown relative with forward slashes, on every system', async () => {
  assert.equal(displayPath(resolve('/tmp/x/a/b.yaml'), resolve('/tmp/x')), 'a/b.yaml');
  await withFiles({ 'deep/er/m.yaml': GOOD }, async (dir) => {
    const report = await checkManifests(await diskSource(dir));
    assert.deepEqual(report.input.files.map((f) => f.path), ['deep/er/m.yaml']);
    assert.ok(report.findings.every((f) => !f.file.includes('\\')));
  });
});

test('files: names compare by code unit, not by locale', () => {
  assert.deepEqual(['b', 'A', 'a', 'B'].sort(compareNames), ['A', 'B', 'a', 'b']);
  assert.equal(compareNames('a', 'a'), 0);
});

test('files: a file over the size limit is a finding and the other files are still read', async () => {
  const small = { ...FILE_LIMITS, maxFileBytes: 200 };
  await withFiles({ 'big.yaml': `a: ${'x'.repeat(500)}\n`, 'ok.yaml': 'kind: ConfigMap\n' }, async (dir) => {
    const report = await checkManifests(await diskSource(dir, small), { limits: { ...small, maxDocuments: 500, maxDepth: 64, maxNodes: 1000, maxScalarChars: 1000 } });
    const f = find(report, 'file-not-read');
    assert.equal(f.length, 1);
    assert.equal(f[0].file, 'big.yaml');
    assert.match(f[0].message, /over the 200 bytes limit/);
    assert.equal(report.input.files.length, 2);
  });
});

test('files: the total size is limited and the rest is a limit-reached finding', async () => {
  const limits = { ...FILE_LIMITS, maxTotalBytes: 100, maxFileBytes: 1000 };
  const files = { 'a.yaml': `a: ${'x'.repeat(60)}\n`, 'b.yaml': `b: ${'y'.repeat(60)}\n`, 'c.yaml': 'c: 1\n' };
  const report = await checkManifests(memorySource(files, limits), { limits: { ...limits, maxDocuments: 500, maxDepth: 64, maxNodes: 1000, maxScalarChars: 1000 } });
  assert.deepEqual(ids(report), ['limit-reached']);
  assert.equal(report.findings[0].file, 'b.yaml');
});

test('files: more manifest files than the limit is a limit-reached finding', async () => {
  const limits = { ...FILE_LIMITS, maxFiles: 3 };
  const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.yaml`, 'a: 1\n']));
  const report = await checkManifests(memorySource(files, limits), { limits });
  assert.equal(report.input.files.length, 3);
  assert.equal(find(report, 'limit-reached').length, 1);
  assert.match(find(report, 'limit-reached')[0].message, /more than 3 manifest files/);
});

test('files: a folder tree deeper than the limit is a finding, and the files above it are read', async () => {
  const limits = { ...FILE_LIMITS, maxFolderDepth: 2 };
  await withFiles({ 'a.yaml': 'a: 1\n', 'x/y/z/deep.yaml': 'a: 1\n', 'x/mid.yaml': 'a: 1\n' }, async (dir) => {
    const report = await checkManifests(await diskSource(dir, limits), { limits });
    assert.deepEqual(report.input.files.map((f) => f.path), ['a.yaml', 'x/mid.yaml']);
    assert.equal(find(report, 'limit-reached').length, 1);
    assert.match(find(report, 'limit-reached')[0].message, /deeper than 2 folders/);
  });
});

test('files: a file that is not UTF-8 text is a finding and not a guess', async () => {
  const report = await check({ 'latin.yaml': Buffer.from([0x61, 0x3a, 0x20, 0xe9, 0x0a]), 'ok.yaml': 'a: 1\n' });
  assert.deepEqual(ids(report), ['file-not-read']);
  assert.match(report.findings[0].message, /not valid UTF-8/);
});

test('files: a link to a file outside the folder is refused, a link to a folder is not followed', async (t) => {
  await withFiles({ 'outside/secret.yaml': 'a: 1\n', 'root/ok.yaml': 'a: 1\n' }, async (dir) => {
    try {
      await symlink(resolve(dir, 'outside/secret.yaml'), resolve(dir, 'root/link.yaml'));
      await symlink(resolve(dir, 'outside'), resolve(dir, 'root/folder-link'), 'dir');
    } catch {
      t.skip('this system does not allow symbolic links here');
      return;
    }
    const report = await checkManifests(await diskSource(resolve(dir, 'root')));
    assert.deepEqual(report.input.files.map((f) => f.path), ['ok.yaml']);
    assert.equal(find(report, 'file-not-read').length, 1);
    assert.match(find(report, 'file-not-read')[0].message, /link that leads outside/);
    assert.ok(report.notes.some((n) => n.includes('folder-link') && n.includes('not followed')));
  });
});

test('files: a memory source reports a link outside and a file that is not regular as findings', async () => {
  const report = await check({ 'a.yaml': '->outside', 'b.yaml': '->special', 'c.yaml': 'a: 1\n' });
  assert.deepEqual(ids(report), ['file-not-read', 'file-not-read']);
  assert.match(report.findings[0].message, /outside the folder/);
  assert.match(report.findings[1].message, /not a regular file/);
});

test('files: a file written to the folder after the listing is not trusted for its size: the open file decides', async () => {
  await withFiles({ 'grow.yaml': 'a: 1\n' }, async (dir) => {
    const source = await diskSource(dir, { ...FILE_LIMITS, maxFileBytes: 50 });
    await writeFile(resolve(dir, 'grow.yaml'), `a: ${'x'.repeat(100)}\n`);
    await assert.rejects(source.read('grow.yaml', 50), /over the 50 bytes limit/);
    await mkdir(resolve(dir, 'sub'));
    await assert.rejects(source.read('sub', 50), /not a regular file|cannot be read/);
  });
});

test('files: a manifest folder with no findings gives an empty list of findings, not an error', async () => {
  const report = await check({ 'good.yaml': GOOD });
  assert.deepEqual(report.findings, []);
  assert.equal(report.gate.pass, true);
});
