import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSecretName, parseImage } from '../src/index.js';
import { GOOD, check, find, good, ids } from './helpers.js';

const RESOURCES = '          resources:\n            requests: {cpu: 100m, memory: 64Mi}\n            limits: {cpu: 200m, memory: 128Mi}\n';
const READINESS = '          readinessProbe:\n            httpGet: {path: /ready, port: 8080}\n';
const IMAGE = '          image: registry.example/web:1.0.0\n';
const noResources = (extra = '') => good([RESOURCES, extra]);

test('resources: no requests and no limits are two warnings that name what is missing, at the container', async () => {
  const r = await check(noResources());
  assert.deepEqual(ids(r), ['resources-requests-missing', 'resources-limits-missing']);
  assert.ok(r.findings.every((f) => f.severity === 'warning' && f.container === 'web' && f.line === 21));
  assert.match(r.findings[0].message, /request for cpu and memory/);
  assert.match(r.findings[1].message, /limit for cpu and memory/);
  assert.equal(r.findings[0].at, 'spec.template.spec.containers[0].resources.requests');
});

test('resources: the findings quote the page about requests and limits', async () => {
  const r = await check(noResources());
  const quotes = r.findings.flatMap((f) => f.manual.map((m) => m.quote));
  assert.ok(quotes.includes('When you specify the resource request for containers in a Pod, the kube-scheduler uses this information to decide which node to place the Pod on.'));
  assert.ok(quotes.includes('memory limits are enforced by the kernel with out of memory (OOM) kills.'));
  assert.ok(r.findings[0].manual.every((m) => m.url === 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/'));
});

test('resources: a missing memory limit or cpu request is named alone, and the line is the key that is nearest', async () => {
  const text = good([RESOURCES, '          resources:\n            requests:\n              cpu: 100m\n            limits:\n              cpu: 200m\n']);
  const r = await check(text);
  assert.deepEqual(ids(r), ['resources-requests-missing', 'resources-limits-missing']);
  assert.match(r.findings[0].message, /request for memory\./);
  assert.match(r.findings[1].message, /limit for memory,/);
  assert.equal(r.findings[0].line, 24);
  assert.equal(r.findings[1].line, 26);
});

test('resources: a limit without a request counts as the request, as the page says Kubernetes does', async () => {
  const text = good([RESOURCES, '          resources:\n            limits: {cpu: 200m, memory: 128Mi}\n']);
  assert.deepEqual(ids(await check(text)), []);
  const half = good([RESOURCES, '          resources:\n            limits: {memory: 128Mi}\n']);
  const r = await check(half);
  assert.deepEqual(ids(r), ['resources-requests-missing', 'resources-limits-missing']);
  assert.ok(r.findings[0].manual.some((m) => m.quote.startsWith('If you specify a limit for a resource, but do not specify any request')));
});

test('resources: init containers are not asked for resources, and Pod level resources stop the comparison with a note', async () => {
  const withInit = good(['      containers:\n', '      initContainers:\n        - name: setup\n          image: registry.example/setup:1.0.0\n          securityContext: {allowPrivilegeEscalation: false, capabilities: {drop: [ALL]}}\n      containers:\n']);
  assert.deepEqual(ids(await check(withInit)), []);
  const podLevel = noResources().replace('    spec:\n      securityContext', '    spec:\n      resources:\n        requests: {cpu: 1}\n      securityContext');
  const r = await check(podLevel);
  assert.deepEqual(ids(r), []);
  assert.ok(r.notes.some((n) => n.includes('resources are set at the Pod level')));
});

test('probes: a Deployment container without a readinessProbe is a warning, with a probe it is not', async () => {
  const r = await check(good([READINESS, '']));
  assert.deepEqual(ids(r), ['readiness-probe-missing']);
  assert.equal(r.findings[0].severity, 'warning');
  assert.equal(r.findings[0].kind, 'Deployment');
  assert.ok(r.findings[0].manual.some((m) => m.quote === 'To start sending traffic to a Pod only when a probe succeeds, specify a readiness probe.'));
  assert.deepEqual(ids(await check(good())), []);
  const empty = await check(good([READINESS, '          readinessProbe:\n']));
  assert.deepEqual(ids(empty), ['readiness-probe-missing']);
});

test('probes: a StatefulSet needs a readinessProbe too, a Job and a CronJob do not', async () => {
  const sts = good(['kind: Deployment', 'kind: StatefulSet'], [READINESS, '']);
  assert.deepEqual(ids(await check(sts)), ['readiness-probe-missing']);
  const job = good(['kind: Deployment', 'kind: Job'], [READINESS, '']);
  assert.deepEqual(ids(await check(job)), []);
});

test('probes: a livenessProbe without a readinessProbe is an info on a Pod and a warning that says so on a Deployment', async () => {
  const live = '          livenessProbe:\n            httpGet: {path: /healthz, port: 8080}\n';
  const dep = await check(good([READINESS, live]));
  assert.deepEqual(ids(dep), ['readiness-probe-missing']);
  assert.match(dep.findings[0].message, /has a livenessProbe/);
  const podText = 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: p\n  namespace: shop\nspec:\n  containers:\n    - name: c\n      image: registry.example/c:1.0.0\n      livenessProbe:\n        httpGet: {path: /h, port: 80}\n';
  const pod = await check(podText);
  const f = find(pod, 'liveness-without-readiness');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'info');
  assert.equal(f[0].line, 10);
  assert.equal(pod.gate.pass, true);
});

test('images: no tag and the tag latest are warnings, a version tag and a digest are fine', async () => {
  const mk = (image) => good([IMAGE, `          image: ${image}\n`]);
  assert.deepEqual(ids(await check(mk('registry.example/web:1.0.0'))), []);
  assert.deepEqual(ids(await check(mk('registry.example/web'))), ['image-tag-missing']);
  assert.deepEqual(ids(await check(mk('web:latest'))), ['image-tag-latest']);
  assert.deepEqual(ids(await check(mk('localhost:5000/web'))), ['image-tag-missing']);
  assert.deepEqual(ids(await check(mk('localhost:5000/web:2'))), []);
  const digest = `registry.example/web@sha256:${'ab'.repeat(32)}`;
  assert.deepEqual(ids(await check(mk(digest))), []);
  assert.deepEqual(ids(await check(mk(`registry.example/web:latest@sha256:${'ab'.repeat(32)}`))), []);
  assert.deepEqual(ids(await check(mk('web:Latest'))), []);
});

test('images: the finding quotes the page on latest and on imagePullPolicy, and names the image', async () => {
  const r = await check(good([IMAGE, '          image: web:latest\n']));
  const f = r.findings[0];
  assert.equal(f.id, 'image-tag-latest');
  assert.match(f.message, /web:latest/);
  const quotes = f.manual.map((m) => m.quote);
  assert.ok(quotes.some((q) => q.startsWith('You should avoid using the :latest tag')));
  assert.ok(quotes.some((q) => q.includes('imagePullPolicy is automatically set to Always')));
});

test('images: parseImage reads the tag after the last slash and the digest after the last at sign', () => {
  assert.deepEqual(parseImage('busybox'), { variable: false, name: 'busybox', tag: null, digest: null });
  assert.equal(parseImage('a/b/c:v1').tag, 'v1');
  assert.equal(parseImage('host:5000/c').tag, null);
  assert.equal(parseImage('host:5000/c:v2').name, 'host:5000/c');
  assert.equal(parseImage(`c@sha256:${'0'.repeat(64)}`).digest, `sha256:${'0'.repeat(64)}`);
  assert.equal(parseImage('c@sha256:short').digest, null);
  assert.equal(parseImage('c:').tag, null);
  assert.equal(parseImage('${IMAGE}:1').variable, true);
  assert.equal(parseImage('{{ .Values.image }}').variable, true);
});

test('images: an image written as a placeholder is a note, not a finding', async () => {
  const r = await check(good([IMAGE, '          image: "$(IMAGE)"\n']));
  assert.deepEqual(ids(r), []);
  assert.ok(r.notes.some((n) => n.includes('placeholder')));
});

test('namespace: a missing namespace and the default namespace are info findings, with the line of metadata or of the key', async () => {
  const none = await check(good(['  namespace: shop\n', '']));
  assert.deepEqual(ids(none), ['namespace-missing']);
  assert.equal(none.findings[0].severity, 'info');
  assert.equal(none.findings[0].line, 3);
  assert.equal(none.gate.pass, true);
  const def = await check(good(['namespace: shop', 'namespace: default']));
  assert.deepEqual(ids(def), ['namespace-default']);
  assert.equal(def.findings[0].line, 5);
  assert.ok(none.findings[0].manual[0].quote.startsWith('For a production cluster, consider not using the default namespace.'));
});

test('replicas: one replica with no PodDisruptionBudget is an info, a matching budget silences it, another namespace or label does not', async () => {
  const one = good(['replicas: 2', 'replicas: 1']);
  const pdb = (ns, label) => `apiVersion: policy/v1\nkind: PodDisruptionBudget\nmetadata:\n  name: web\n  namespace: ${ns}\nspec:\n  minAvailable: 1\n  selector:\n    matchLabels:\n      app: ${label}\n`;
  const alone = await check(one);
  assert.deepEqual(ids(alone), ['replicas-one-no-pdb']);
  assert.equal(alone.findings[0].line, 7);
  assert.equal(alone.findings[0].severity, 'info');
  assert.deepEqual(ids(await check({ 'a.yaml': one, 'b.yaml': pdb('shop', 'web') })), []);
  assert.deepEqual(ids(await check({ 'a.yaml': one, 'b.yaml': pdb('other', 'web') })), ['replicas-one-no-pdb']);
  assert.deepEqual(ids(await check({ 'a.yaml': one, 'b.yaml': pdb('shop', 'api') })), ['replicas-one-no-pdb']);
  assert.deepEqual(ids(await check(good())), []);
});

test('replicas: a budget that cannot be compared (matchExpressions) counts as a match and a note says so', async () => {
  const one = good(['replicas: 2', 'replicas: 1']);
  const pdb = 'kind: PodDisruptionBudget\nmetadata:\n  name: b\n  namespace: shop\nspec:\n  selector:\n    matchExpressions:\n      - {key: app, operator: In, values: [web]}\n';
  const r = await check({ 'a.yaml': one, 'b.yaml': pdb });
  assert.deepEqual(ids(r), []);
  assert.ok(r.notes.some((n) => n.includes('cannot be compared')));
});

test('secrets: a plain value in a variable named like a secret is a warning, and the value is never printed', async () => {
  const env = '          env:\n            - name: DB_PASSWORD\n              value: hunter2-not-real\n            - name: API_TOKEN\n              value: "tok-not-real"\n            - name: LOG_LEVEL\n              value: debug\n';
  const r = await check(good([IMAGE, IMAGE + env]));
  const f = find(r, 'env-secret-plain');
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.line), [25, 27]);
  assert.match(f[0].message, /DB_PASSWORD/);
  assert.equal(f[0].at, 'spec.template.spec.containers[0].env[0].value');
  const everything = JSON.stringify(r);
  assert.ok(!everything.includes('hunter2-not-real'));
  assert.ok(!everything.includes('tok-not-real'));
});

test('secrets: valueFrom, references, empty values and names that point at a file are not findings (near misses)', async () => {
  const env = '          env:\n            - name: DB_PASSWORD\n              valueFrom:\n                secretKeyRef: {name: db, key: password}\n            - name: TOKEN_PATH\n              value: /var/run/token\n            - name: DB_PASSWORD_FILE\n              value: /etc/p\n            - name: API_TOKEN\n              value: $(OTHER)\n            - name: API_SECRET\n              value: ""\n            - name: KEYBOARD\n              value: us\n';
  assert.deepEqual(ids(await check(good([IMAGE, IMAGE + env]))), []);
});

test('secrets: the name rule', () => {
  for (const name of ['PASSWORD', 'db_password', 'AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'api-key', 'API_KEY', 'private_key', 'SERVICE_CREDENTIALS']) assert.equal(looksLikeSecretName(name), true, name);
  for (const name of ['LOG_LEVEL', 'PASSWORD_FILE', 'TOKEN_URL', 'SECRET_NAME', 'KEY', 'PORT', 'TOKENIZER_MODE'.replace('TOKEN', 'TOK')]) assert.equal(looksLikeSecretName(name), false, name);
});

test('kinds: the other kinds are counted and not checked, and a Secret is never opened', async () => {
  const other = 'kind: Service\nmetadata:\n  name: s\n---\nkind: Secret\nmetadata:\n  name: db\nstringData:\n  password: do-not-print-this\n---\nkind: ConfigMap\nmetadata:\n  name: c\n';
  const r = await check({ 'a.yaml': GOOD, 'b.yaml': other });
  assert.deepEqual(ids(r), []);
  assert.ok(r.notes.some((n) => n.includes('ConfigMap (1), Secret (1), Service (1)') && n.includes('A Secret is never opened')));
  assert.ok(!JSON.stringify(r).includes('do-not-print-this'));
  assert.equal(r.input.documents, 4);
  assert.equal(r.input.workloads, 1);
});

test('kinds: a List holds workloads, and a document without a kind is a note', async () => {
  const list = 'apiVersion: v1\nkind: List\nitems:\n  - kind: Pod\n    metadata: {name: p, namespace: x}\n    spec:\n      containers:\n        - name: c\n          image: c\n';
  const r = await check({ 'l.yaml': list, 'n.yaml': 'just: a map\n' });
  assert.equal(r.input.workloads, 1);
  assert.ok(find(r, 'image-tag-missing').length === 1);
  assert.ok(r.notes.some((n) => n.includes('no kind')));
});

test('kinds: a workload with no Pod spec or a container that is not a map is a note and does not stop the rest', async () => {
  const text = 'kind: Deployment\nmetadata: {name: a}\nspec: {}\n---\nkind: Pod\nmetadata: {name: b, namespace: x}\nspec:\n  containers:\n    - just-a-string\n    - {name: c, image: "c:1"}\n';
  const r = await check(text);
  assert.ok(r.notes.some((n) => n.includes('no Pod spec at spec.template.spec')));
  assert.ok(r.notes.some((n) => n.includes('containers[0] is not a map')));
  assert.equal(r.input.workloads, 1);
});

test('yaml errors: a file that cannot be read is an error finding with the line, and the other documents are still checked', async () => {
  const text = `${GOOD.replace('image: registry.example/web:1.0.0', 'image: web')}---\nkind: Pod\nmetadata:\n  name: &p x\n`;
  const r = await check(text);
  assert.deepEqual(ids(r).sort(), ['image-tag-missing', 'yaml-not-read']);
  const f = find(r, 'yaml-not-read')[0];
  assert.equal(f.severity, 'error');
  assert.equal(f.line, 35);
  assert.match(f.message, /anchor \(&name\) is refused/);
  assert.equal(r.gate.pass, false);
});

test('report: findings come in file order, then line order, and every finding has the fields the formats need', async () => {
  const r = await check({ 'b.yaml': good(['image: registry.example/web:1.0.0', 'image: web']), 'a.yaml': good([READINESS, '']) });
  assert.deepEqual(r.findings.map((f) => `${f.file}:${f.line}`), ['a.yaml:21', 'b.yaml:22']);
  for (const f of r.findings) {
    for (const key of ['id', 'severity', 'file', 'line', 'kind', 'name', 'container', 'profile', 'field', 'at', 'message', 'fix', 'manual']) assert.ok(key in f, key);
    assert.ok(f.manual.length > 0 && f.manual.every((m) => m.url.startsWith('https://kubernetes.io/docs/') && m.quote));
  }
});
