import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POD_KINDS, collect, dig, get, lineOfPath, readDocuments, textOf } from '../src/index.js';
import { GOOD } from './helpers.js';

const docs = (text) => readDocuments(text).documents;

test('workloads: the kinds that are read, and the Pod spec path of a Deployment', () => {
  assert.deepEqual(POD_KINDS, ['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);
  const { workloads, budgets, others } = collect([{ path: 'a.yaml', documents: docs(GOOD) }]);
  assert.equal(workloads.length, 1);
  assert.equal(budgets.length, 0);
  assert.equal(others.size, 0);
  const w = workloads[0];
  assert.equal(w.kind, 'Deployment');
  assert.equal(w.name, 'web');
  assert.equal(w.specPath, 'spec.template.spec');
  assert.deepEqual(w.namespace, { value: 'shop', line: 5 });
  assert.equal(w.line, 2);
  assert.equal(w.containers.length, 1);
  assert.equal(w.containers[0].name, 'web');
  assert.equal(w.containers[0].group, 'containers');
});

test('workloads: textOf reads strings and numbers as text and null as null, and dig follows keys', () => {
  const root = docs('a:\n  b: text\n  c: 12\n  d:\n  e: "q"\n')[0].root;
  assert.equal(textOf(dig(root, 'a', 'b')), 'text');
  assert.equal(textOf(dig(root, 'a', 'c')), '12');
  assert.equal(textOf(dig(root, 'a', 'd')), null);
  assert.equal(textOf(dig(root, 'a', 'e')), 'q');
  assert.equal(textOf(dig(root, 'a')), null);
  assert.equal(dig(root, 'a', 'missing', 'deeper'), undefined);
  assert.equal(get(dig(root, 'a'), 'b').value, 'text');
});

test('workloads: lineOfPath gives the line of the deepest key that exists, and the line of the node when none does', () => {
  const root = docs('a:\n  b:\n    c: 1\nx: 2\n')[0].root;
  assert.equal(lineOfPath(root, 'a', 'b', 'c'), 3);
  assert.equal(lineOfPath(root, 'a', 'b', 'missing', 'deeper'), 2);
  assert.equal(lineOfPath(root, 'nothing'), 1);
  assert.equal(lineOfPath(root, 'x'), 4);
});

test('workloads: a budget is kept apart, an unnamed workload gets a placeholder, and other kinds are counted', () => {
  const text = 'kind: PodDisruptionBudget\nmetadata: {name: b}\n---\nkind: Pod\nspec:\n  containers: []\n---\nkind: Service\n---\nkind: Service\n';
  const { workloads, budgets, others } = collect([{ path: 'a.yaml', documents: docs(text) }]);
  assert.equal(budgets.length, 1);
  assert.equal(budgets[0].name, 'b');
  assert.equal(workloads[0].name, '(unnamed)');
  assert.equal(workloads[0].namespace, null);
  assert.equal(others.get('Service'), 2);
});
