// Command line: k8s-manifest-check <folder-or-file> [options]

import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FINDINGS, LIMITS, checkManifests } from './check.js';
import { diskSource } from './files.js';
import { safeText } from './rules.js';
import { toText, toMarkdown, toJson, toCsv } from './report.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, csv: toCsv };
const THRESHOLDS = ['error', 'warning'];

export const USAGE = `Usage: k8s-manifest-check <folder-or-file> [options]

Reads Kubernetes manifest files (.yaml and .yml, several documents in one file are fine) and reports the settings that
make a workload unsafe or unreliable in production: Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job and
CronJob are checked against the Pod Security Standards (Baseline and Restricted), resource requests and limits, probes
and image tags, and the namespace, the replicas and secrets written as plain environment values are reported. Every
finding quotes the Kubernetes documentation it rests on. It reads files only: it never talks to a cluster, fetches an
address, runs a program or opens a connection, and it never prints the value of an environment variable.

Options:
  --format <name>     text, markdown, json or csv (default: text)
  --fail-on <level>   exit with 1 when a finding is at this level or above: error or warning
                      (default: error); info never fails the run
  --help              show this text
  --version           show the version

Checks: ${FINDINGS.map((f) => f.id).join(', ')}

Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
`;

export function parseArgs(argv) {
  const o = { input: null, format: 'text', failOn: 'error', help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '-') throw new Error('reading from standard input is not supported; give the path of a folder or a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.input !== null) throw new Error('give one folder or one file');
    else o.input = a;
  }
  if (!o.help && !o.version) {
    if (o.input === null) throw new Error('give the path of the folder of manifests, or of one manifest file');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(o.input)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or csv)`);
    if (!THRESHOLDS.includes(o.failOn)) throw new Error(`--fail-on takes error or warning, not ${o.failOn}`);
  }
  return o;
}

const clean = (text) => safeText(text, 1000);

// The path as the user wrote it, with forward slashes, for the top of the report.
const shown = (input) => safeText(input.split('\\').join('/'), 300);

// Exit code: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error. base is the folder that a
// relative path is worked out from.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = LIMITS, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`k8s-manifest-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    const path = resolve(base, o.input);
    try {
      await stat(path);
    } catch (error) {
      throw new Error(`${safeText(o.input, 200)}: ${error.code === 'ENOENT' ? 'no such file or folder' : `cannot be read (${error.code ?? error.message})`}`);
    }
    const source = await diskSource(path, limits);
    report = await checkManifests(source, { target: shown(o.input), failOn: o.failOn, version: VERSION, limits });
    if (report.input.files.length === 0) throw new Error(`${safeText(o.input, 200)}: no .yaml or .yml file found`);
  } catch (error) {
    io.err(`k8s-manifest-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report));
  return report.gate.pass ? 0 : 1;
}
