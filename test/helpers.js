// Shared test helpers: manifests written inline and held in memory, files written into a temporary folder that is removed
// after the test, and the command line run with captured output.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkManifests, main, memorySource } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'k8s-manifest-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// A Deployment that passes every check at the level warning and has no info finding.
export const GOOD = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: web
          image: registry.example/web:1.0.0
          resources:
            requests: {cpu: 100m, memory: 64Mi}
            limits: {cpu: 200m, memory: 128Mi}
          readinessProbe:
            httpGet: {path: /ready, port: 8080}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
`;

// Replaces a piece of text and fails when the piece is not there, so a test cannot pass by changing nothing.
export function swap(text, from, to) {
  if (!text.includes(from)) throw new Error(`the helper text does not contain: ${from}`);
  return text.replace(from, to);
}

// The GOOD manifest with the pieces replaced: swaps is a list of [from, to].
export function good(...swaps) {
  return swaps.reduce((text, [from, to]) => swap(text, from, to), GOOD);
}

// Checks manifests held in memory: files is an object of path -> text, or one text for the file manifest.yaml.
export async function check(files, options = {}) {
  const set = typeof files === 'string' ? { 'manifest.yaml': files } : files;
  return checkManifests(memorySource(set), options);
}

export const ids = (report) => report.findings.map((f) => f.id);
export const find = (report, id) => report.findings.filter((f) => f.id === id);

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = []) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments.
export async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}
