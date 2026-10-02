// From the documents of the manifest files to the things the checks look at: the workloads (Pod, Deployment, StatefulSet,
// DaemonSet, ReplicaSet, Job, CronJob), with the path to their Pod spec, and the PodDisruptionBudgets, which one check
// needs. A document of any other kind is counted and not looked at; a Secret is never opened.

import { WORKLOAD_PATHS } from './data.js';
import { entryOf, get, isMap, isScalar, isSeq, resolveScalar } from './yaml.js';
import { safeText } from './rules.js';

// The text of a plain or quoted scalar, or null.
export function textOf(node) {
  if (!isScalar(node)) return null;
  const r = resolveScalar(node);
  return r.kind === 'null' ? null : String(node.value);
}

// The value of a key, followed down a path of keys; undefined when any step is missing.
export function dig(node, ...keys) {
  let cur = node;
  for (const key of keys) {
    cur = get(cur, key);
    if (cur === undefined) return undefined;
  }
  return cur;
}

// The line of the deepest key of a path that exists, and the line of the node itself when none does. Used for a finding
// about a field that is missing: it points at the nearest key that is written.
export function lineOfPath(node, ...keys) {
  let cur = node;
  let line = node.line;
  for (const key of keys) {
    const entry = entryOf(cur, key);
    if (entry === undefined) break;
    line = entry.line;
    cur = entry.value;
  }
  return line;
}

export const POD_KINDS = Object.keys(WORKLOAD_PATHS);

// Splits the documents of every file into workloads, PodDisruptionBudgets and the rest. files is a list of
// { path, documents } where documents come from readDocuments. Returns { workloads, budgets, others, notes }.
export function collect(files) {
  const workloads = [];
  const budgets = [];
  const others = new Map();
  const notes = [];
  let withoutKind = 0;

  const add = (path, doc, via) => {
    const root = doc.root;
    if (!isMap(root)) {
      withoutKind += 1;
      return;
    }
    const kind = textOf(get(root, 'kind'));
    if (kind === null) {
      withoutKind += 1;
      return;
    }
    if (kind === 'List') {
      const items = get(root, 'items');
      if (isSeq(items)) for (const item of items.items) add(path, { line: item.line, root: item }, 'List');
      return;
    }
    const metadata = get(root, 'metadata');
    const name = textOf(get(metadata, 'name'));
    const nsEntry = entryOf(metadata, 'namespace');
    const base = {
      file: path,
      kind: safeText(kind, 60),
      name: name === null ? '(unnamed)' : safeText(name, 120),
      line: entryOf(root, 'kind').line,
      root,
      metadata,
      namespace: nsEntry === undefined ? null : { value: textOf(nsEntry.value), line: nsEntry.line },
      metadataLine: (entryOf(root, 'metadata') ?? entryOf(root, 'kind')).line
    };
    if (Object.hasOwn(WORKLOAD_PATHS, kind)) {
      const spec = dig(root, ...WORKLOAD_PATHS[kind]);
      if (!isMap(spec)) {
        notes.push(`${path}:${base.line} ${base.kind} ${base.name}: no Pod spec at ${WORKLOAD_PATHS[kind].join('.')}, so it was not checked`);
        return;
      }
      const containers = [];
      for (const group of ['containers', 'initContainers']) {
        const list = get(spec, group);
        if (list === undefined) continue;
        if (!isSeq(list)) {
          notes.push(`${path}:${base.line} ${base.kind} ${base.name}: ${group} is not a list, so it was not checked`);
          continue;
        }
        list.items.forEach((node, index) => {
          if (!isMap(node)) {
            notes.push(`${path}:${node.line} ${base.kind} ${base.name}: ${group}[${index}] is not a map, so it was not checked`);
            return;
          }
          const cname = textOf(get(node, 'name'));
          containers.push({ group, index, node, name: cname === null ? '(unnamed)' : safeText(cname, 120) });
        });
      }
      workloads.push({ ...base, specPath: WORKLOAD_PATHS[kind].join('.'), spec, containers, via });
    } else if (kind === 'PodDisruptionBudget') {
      budgets.push(base);
    } else {
      others.set(kind, (others.get(kind) ?? 0) + 1);
    }
  };

  for (const file of files) for (const doc of file.documents) add(file.path, doc, null);
  if (withoutKind > 0) notes.push(`${withoutKind} ${withoutKind === 1 ? 'document has' : 'documents have'} no kind (or are not a map) and ${withoutKind === 1 ? 'was' : 'were'} not checked`);
  return { workloads, budgets, others, notes };
}
