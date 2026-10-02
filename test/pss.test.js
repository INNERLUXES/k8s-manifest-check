import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, find, good, ids } from './helpers.js';

const SC = '          securityContext:\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n';
const withSecurity = (lines) => good([SC, `          securityContext:\n            allowPrivilegeEscalation: false\n${lines}            capabilities:\n              drop: [ALL]\n`]);
const pod = (extra) => good(['      securityContext:\n', `      securityContext:\n${extra}`]);

test('pss: the good manifest has no finding at all', async () => {
  const r = await check(good());
  assert.deepEqual(r.findings, []);
  assert.equal(r.input.workloads, 1);
});

test('pss: privileged true is an error under Baseline, with the page field path and the line of the key', async () => {
  const r = await check(withSecurity('            privileged: true\n'));
  const f = find(r, 'pss-privileged');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
  assert.equal(f[0].profile, 'Baseline');
  assert.equal(f[0].field, 'spec.containers[*].securityContext.privileged');
  assert.equal(f[0].at, 'spec.template.spec.containers[0].securityContext.privileged');
  assert.equal(f[0].line, 30);
  assert.equal(f[0].kind, 'Deployment');
  assert.equal(f[0].name, 'web');
  assert.equal(f[0].container, 'web');
  assert.equal(r.gate.pass, false);
});

test('pss: privileged false, or no privileged, is fine (near miss)', async () => {
  assert.deepEqual(ids(await check(withSecurity('            privileged: false\n'))), []);
});

test('pss: hostNetwork, hostPID and hostIPC are errors under Baseline, one finding for each', async () => {
  const r = await check(pod('        hostNetwork: true\n').replace('    spec:\n      securityContext', '    spec:\n      hostPID: true\n      hostIPC: true\n      hostNetwork: true\n      securityContext'));
  const f = find(r, 'pss-host-namespaces');
  assert.deepEqual(f.map((x) => x.field), ['spec.hostPID', 'spec.hostIPC', 'spec.hostNetwork']);
  assert.ok(f.every((x) => x.severity === 'error' && x.profile === 'Baseline' && x.container === ''));
  const off = await check(good(['    spec:\n', '    spec:\n      hostNetwork: false\n']));
  assert.deepEqual(ids(off), []);
});

test('pss: a hostPath volume is an error under Baseline, a persistentVolumeClaim and an emptyDir are not', async () => {
  const bad = good(['      containers:\n', '      volumes:\n        - name: data\n          hostPath:\n            path: /var/data\n      containers:\n']);
  const f = find(await check(bad), 'pss-host-path');
  assert.equal(f.length, 1);
  assert.equal(f[0].field, 'spec.volumes[*].hostPath');
  assert.equal(f[0].at, 'spec.template.spec.volumes[0].hostPath');
  assert.match(f[0].message, /volume data/);
  const fine = good(['      containers:\n', '      volumes:\n        - name: data\n          emptyDir: {}\n        - name: claim\n          persistentVolumeClaim:\n            claimName: c\n      containers:\n']);
  assert.deepEqual(ids(await check(fine)), []);
});

test('pss: a hostPort other than 0 is an error under Baseline, and a containerPort alone is not', async () => {
  const bad = good(['          image: registry.example/web:1.0.0\n', '          image: registry.example/web:1.0.0\n          ports:\n            - containerPort: 80\n              hostPort: 8080\n']);
  const f = find(await check(bad), 'pss-host-port');
  assert.equal(f.length, 1);
  assert.equal(f[0].field, 'spec.containers[*].ports[*].hostPort');
  assert.equal(f[0].at, 'spec.template.spec.containers[0].ports[0].hostPort');
  const zero = good(['          image: registry.example/web:1.0.0\n', '          image: registry.example/web:1.0.0\n          ports:\n            - containerPort: 80\n              hostPort: 0\n']);
  assert.deepEqual(ids(await check(zero)), []);
});

test('pss: a capability beyond the Baseline list is an error that names it', async () => {
  const r = await check(withSecurity('            capabilities:\n              add: [SYS_ADMIN, CHOWN]\n').replace('            capabilities:\n              drop: [ALL]\n', ''));
  const f = find(r, 'pss-capabilities-add');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /SYS_ADMIN/);
  assert.doesNotMatch(f[0].message, /CHOWN/);
  assert.equal(f[0].field, 'spec.containers[*].securityContext.capabilities.add');
});

test('pss: under Restricted only NET_BIND_SERVICE may be added back, and a Baseline capability such as CHOWN is a warning', async () => {
  const mk = (list) => good(['              drop: [ALL]\n', `              drop: [ALL]\n              add: [${list}]\n`]);
  assert.deepEqual(ids(await check(mk('NET_BIND_SERVICE'))), []);
  const r = await check(mk('CHOWN, NET_BIND_SERVICE'));
  assert.deepEqual(ids(r), ['pss-capabilities-add-restricted']);
  assert.equal(r.findings[0].severity, 'warning');
  assert.equal(r.findings[0].profile, 'Restricted');
  assert.match(r.findings[0].message, /CHOWN/);
  assert.doesNotMatch(r.findings[0].message, /adds CHOWN, NET_BIND_SERVICE/);
});

test('pss: allowPrivilegeEscalation must be false: true and missing are both warnings under Restricted', async () => {
  const t = find(await check(withSecurity('').replace('allowPrivilegeEscalation: false', 'allowPrivilegeEscalation: true')), 'pss-privilege-escalation');
  assert.equal(t.length, 1);
  assert.equal(t[0].severity, 'warning');
  assert.equal(t[0].profile, 'Restricted');
  assert.match(t[0].message, /is true/);
  const missing = find(await check(withSecurity('').replace('            allowPrivilegeEscalation: false\n', '')), 'pss-privilege-escalation');
  assert.equal(missing.length, 1);
  assert.match(missing[0].message, /not set to false/);
});

test('pss: runAsNonRoot must be true on the container or on the Pod', async () => {
  assert.deepEqual(ids(await check(good())), []);
  const none = await check(good(['        runAsNonRoot: true\n', '']));
  assert.deepEqual(ids(none), ['pss-run-as-non-root']);
  assert.equal(none.findings[0].field, 'spec.containers[*].securityContext.runAsNonRoot');
  const off = await check(good(['        runAsNonRoot: true\n', '        runAsNonRoot: false\n']));
  assert.equal(find(off, 'pss-run-as-non-root')[0].line, 17);
  assert.match(find(off, 'pss-run-as-non-root')[0].message, /is false/);
  const container = good(['        runAsNonRoot: true\n', ''], [SC, `          securityContext:\n            runAsNonRoot: true\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n`]);
  assert.deepEqual(ids(await check(container)), []);
});

test('pss: a container value of runAsNonRoot wins over the Pod value', async () => {
  const text = good([SC, `          securityContext:\n            runAsNonRoot: false\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n`]);
  const r = await check(text);
  assert.deepEqual(ids(r), ['pss-run-as-non-root']);
});

test('pss: runAsUser 0 is a warning on the container and on the Pod, and another number is not', async () => {
  const c = await check(withSecurity('            runAsUser: 0\n'));
  assert.deepEqual(ids(c), ['pss-run-as-user-root']);
  assert.equal(c.findings[0].container, 'web');
  const p = await check(pod('        runAsUser: 0\n'));
  assert.deepEqual(ids(p), ['pss-run-as-user-root']);
  assert.equal(p.findings[0].container, '');
  assert.equal(p.findings[0].field, 'spec.securityContext.runAsUser');
  assert.deepEqual(ids(await check(withSecurity('            runAsUser: 10001\n'))), []);
  assert.deepEqual(ids(await check(withSecurity('            runAsUser: "0"\n'))), ['value-not-read']);
});

test('pss: no seccomp profile is a Restricted warning, Localhost and RuntimeDefault are fine, Unconfined is a Baseline error', async () => {
  const none = await check(good(['        seccompProfile:\n          type: RuntimeDefault\n', '']));
  assert.deepEqual(ids(none), ['pss-seccomp-missing']);
  assert.equal(none.findings[0].field, 'spec.containers[*].securityContext.seccompProfile.type');
  assert.deepEqual(ids(await check(good(['type: RuntimeDefault', 'type: Localhost']))), []);
  const unconfined = await check(good(['type: RuntimeDefault', 'type: Unconfined']));
  assert.deepEqual(ids(unconfined), ['pss-seccomp-unconfined']);
  assert.equal(unconfined.findings[0].severity, 'error');
  assert.equal(unconfined.findings[0].profile, 'Baseline');
  assert.equal(unconfined.findings[0].field, 'spec.securityContext.seccompProfile.type');
  const odd = await check(good(['type: RuntimeDefault', 'type: Strange']));
  assert.deepEqual(ids(odd), ['pss-seccomp-missing']);
});

test('pss: a container seccomp profile covers a Pod with none', async () => {
  const text = good(['      securityContext:\n        runAsNonRoot: true\n        seccompProfile:\n          type: RuntimeDefault\n', '      securityContext:\n        runAsNonRoot: true\n'], [SC, `          securityContext:\n            seccompProfile:\n              type: RuntimeDefault\n            allowPrivilegeEscalation: false\n            capabilities:\n              drop: [ALL]\n`]);
  assert.deepEqual(ids(await check(text)), []);
});

test('pss: a container must drop ALL capabilities: no drop, and a drop without ALL, are warnings', async () => {
  const none = await check(good(['            capabilities:\n              drop: [ALL]\n', '']));
  assert.deepEqual(ids(none), ['pss-capabilities-drop-all']);
  assert.equal(none.findings[0].field, 'spec.containers[*].securityContext.capabilities.drop');
  const some = await check(good(['drop: [ALL]', 'drop: [NET_RAW]']));
  assert.deepEqual(ids(some), ['pss-capabilities-drop-all']);
  assert.deepEqual(ids(await check(good(['drop: [ALL]', 'drop: [NET_RAW, ALL]']))), []);
});

test('pss: init containers are checked too, with the initContainers field path of the page', async () => {
  const text = good(['      containers:\n', '      initContainers:\n        - name: setup\n          image: registry.example/setup:1.0.0\n          securityContext:\n            privileged: true\n      containers:\n']);
  const f = find(await check(text), 'pss-privileged');
  assert.equal(f.length, 1);
  assert.equal(f[0].container, 'setup');
  assert.equal(f[0].field, 'spec.initContainers[*].securityContext.privileged');
  assert.equal(f[0].at, 'spec.template.spec.initContainers[0].securityContext.privileged');
});

test('pss: the Restricted controls that the page marks Linux only are not checked for a Windows Pod, and a note says so', async () => {
  const text = good(['      securityContext:\n', '      os:\n        name: windows\n      securityContext:\n'], [SC, '          securityContext:\n            runAsNonRoot: true\n']);
  const r = await check(text.replace('        seccompProfile:\n          type: RuntimeDefault\n', ''));
  assert.deepEqual(ids(r), []);
  assert.ok(r.notes.some((n) => n.includes('spec.os.name is windows')));
});

test('pss: a value that is not true or false is reported as not read, never guessed', async () => {
  const r = await check(withSecurity('            privileged: yes\n'));
  assert.deepEqual(ids(r), ['value-not-read']);
  assert.equal(r.findings[0].severity, 'info');
  assert.equal(r.gate.pass, true);
});

test('pss: every Pod kind is read at its own pod template path', async () => {
  const container = '      containers:\n        - name: c\n          image: registry.example/c:1\n          securityContext:\n            privileged: true\n';
  const docs = {
    'pod.yaml': 'apiVersion: v1\nkind: Pod\nmetadata:\n  name: p\nspec:\n  containers:\n    - name: c\n      image: registry.example/c:1\n      securityContext:\n        privileged: true\n',
    'ds.yaml': `kind: DaemonSet\nmetadata:\n  name: d\nspec:\n  template:\n    spec:\n${container}`,
    'sts.yaml': `kind: StatefulSet\nmetadata:\n  name: s\nspec:\n  template:\n    spec:\n${container}`,
    'rs.yaml': `kind: ReplicaSet\nmetadata:\n  name: r\nspec:\n  template:\n    spec:\n${container}`,
    'job.yaml': `kind: Job\nmetadata:\n  name: j\nspec:\n  template:\n    spec:\n${container}`,
    'cron.yaml': 'kind: CronJob\nmetadata:\n  name: c\nspec:\n  jobTemplate:\n    spec:\n      template:\n        spec:\n          containers:\n            - name: c\n              image: registry.example/c:1\n              securityContext:\n                privileged: true\n'
  };
  const r = await check(docs);
  const f = find(r, 'pss-privileged');
  assert.deepEqual(f.map((x) => x.kind).sort(), ['CronJob', 'DaemonSet', 'Job', 'Pod', 'ReplicaSet', 'StatefulSet']);
  const at = Object.fromEntries(f.map((x) => [x.kind, x.at]));
  assert.equal(at.Pod, 'spec.containers[0].securityContext.privileged');
  assert.equal(at.CronJob, 'spec.jobTemplate.spec.template.spec.containers[0].securityContext.privileged');
  assert.equal(at.StatefulSet, 'spec.template.spec.containers[0].securityContext.privileged');
});
