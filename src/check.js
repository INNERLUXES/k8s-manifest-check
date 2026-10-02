// Reads the manifest files, runs the checks and returns one report. The tool reads files under the folder it is given and
// opens no connection and never talks to a cluster. docs/method.md gives the reason behind every finding. No value of a
// manifest is copied into a finding except the names that the finding is about: a path, a workload, a container, a
// volume, a port, a capability and the name of an environment variable, never the value of one.

import { BASELINE_CAPABILITIES, FACTS, PSS_CONTROLS, RESTRICTED_ADDED_CAPABILITY, SECCOMP_ALLOWED, SECRET_NAME_REFERENCE_ENDINGS, SECRET_NAME_WORDS, SOURCES, sourceUrl } from './data.js';
import { FILE_LIMITS, compareNames } from './files.js';
import { FINDINGS, ORDER, RANK, SEVERITIES, meetsThreshold, safeText } from './rules.js';
import { YAML_LIMITS, entryOf, get, isMap, isScalar, isSeq, readDocuments, resolveScalar } from './yaml.js';
import { collect, dig, lineOfPath, textOf } from './workloads.js';

export const LIMITS = { ...FILE_LIMITS, ...YAML_LIMITS };
export { FINDINGS, RANK, SEVERITIES, meetsThreshold, safeText };

const BY_ID = Object.fromEntries(FINDINGS.map((f) => [f.id, f]));
const sourceTitle = (id) => SOURCES.find((s) => s.id === id).title;

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

// The sentences of the pages that a finding quotes, and the field paths that the page lists for its control.
export function manualFor(id, extraFacts = []) {
  for (const key of extraFacts) if (!(BY_ID[id].optional ?? []).includes(key)) throw new Error(`${id} does not quote ${key}`);
  return [...BY_ID[id].facts, ...extraFacts].map((key) => {
    const fact = FACTS[key];
    return { page: sourceTitle(fact.source), section: fact.section, url: sourceUrl(fact.source), quote: fact.text };
  });
}

// ---- reading values of the manifest without printing them

// true, false, 'absent' (no key, or null) or 'unread' (a form the tool does not read as a boolean).
function readBool(node) {
  if (node === undefined) return 'absent';
  if (!isScalar(node)) return 'unread';
  const r = resolveScalar(node);
  if (r.kind === 'null') return 'absent';
  return r.kind === 'boolean' ? r.value : 'unread';
}

// An integer, 'absent' or 'unread'.
function readInt(node) {
  if (node === undefined) return 'absent';
  if (!isScalar(node)) return 'unread';
  const r = resolveScalar(node);
  if (r.kind === 'null') return 'absent';
  return r.kind === 'integer' ? r.value : 'unread';
}

const expand = (path, group) => path.split('{c}').join(group);

// ---- images

// Splits an image reference into its parts without a regular expression over the whole text: the digest after the last
// "@", the tag after the last ":" that follows the last "/". variable is true when the reference holds a placeholder.
export function parseImage(reference) {
  const ref = String(reference).trim();
  if (ref.includes('$') || ref.includes('{') || ref.includes('}')) return { variable: true, name: ref, tag: null, digest: null };
  let digest = null;
  let rest = ref;
  const at = ref.lastIndexOf('@');
  if (at !== -1) {
    const candidate = ref.slice(at + 1);
    const colon = candidate.indexOf(':');
    const algorithm = colon === -1 ? '' : candidate.slice(0, colon);
    const hash = colon === -1 ? '' : candidate.slice(colon + 1);
    if (algorithm !== '' && hash.length >= 32 && [...algorithm].every((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) && [...hash].every((c) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
      digest = candidate;
      rest = ref.slice(0, at);
    }
  }
  const slash = rest.lastIndexOf('/');
  const last = rest.slice(slash + 1);
  const colon = last.indexOf(':');
  const tag = colon === -1 ? null : last.slice(colon + 1);
  return { variable: false, name: colon === -1 ? rest : rest.slice(0, slash + 1 + colon), tag: tag === '' ? null : tag, digest };
}

// ---- environment variable names

// True when the name looks like the name of a secret. The words are the tool's own convention (docs/method.md); a name
// that ends like a reference (a file, a path, a name, an address) is not taken for the secret itself.
export function looksLikeSecretName(name) {
  const upper = String(name).toUpperCase().split('-').join('_').split('.').join('_');
  if (SECRET_NAME_REFERENCE_ENDINGS.some((e) => upper.endsWith(e))) return false;
  return SECRET_NAME_WORDS.some((w) => upper.includes(w));
}

// ---- the checks

const PROBE_KINDS = new Set(['Deployment', 'StatefulSet']);
const LIVENESS_NOTE_KINDS = new Set(['Pod', 'ReplicaSet', 'DaemonSet']);

// Reports on the manifest files of a source (diskSource or memorySource in files.js). Paths in the report are relative to
// the source, with forward slashes. target is the name shown at the top of the report.
export async function checkManifests(source, { target = '.', failOn = 'error', version = '0.0.0', limits = LIMITS } = {}) {
  const found = [];
  const notes = [];
  const fileList = [];
  const fileIndex = new Map();

  const emit = (id, ctx, line, fields) => {
    const def = BY_ID[id];
    found.push({
      id,
      severity: def.severity,
      file: ctx.file,
      fileIndex: fileIndex.get(ctx.file) ?? 0,
      line: Math.max(1, line || 1),
      kind: ctx.kind ?? '',
      name: ctx.name ?? '',
      container: ctx.container ?? '',
      profile: def.profile ?? null,
      field: fields.field ?? null,
      at: fields.at ? safeText(fields.at, 300) : null,
      message: fields.message,
      fix: fields.fix,
      manual: manualFor(id, fields.extraFacts ?? [])
    });
  };

  // ---- the files
  const listing = await source.list();
  for (const f of listing.files) {
    fileIndex.set(f.path, fileList.length);
    fileList.push({ path: safeText(f.path, 400), bytes: f.size, documents: 0 });
  }
  for (const problem of listing.problems) {
    const ctx = { file: safeText(problem.path, 400) };
    // A problem about something that is not a file read (a folder, a link) sorts after the files.
    if (!fileIndex.has(ctx.file)) fileIndex.set(ctx.file, listing.files.length + fileIndex.size);
    const limit = problem.reason.startsWith('more than') || problem.reason.includes('deeper than');
    emit(limit ? 'limit-reached' : 'file-not-read', ctx, 1, { message: `${safeText(problem.path, 300)} ${problem.reason}.`, fix: limit ? 'Check a smaller folder, or split the check into several runs.' : 'Fix the file or the link, or take it out of the folder.' });
  }
  for (const note of listing.notes) notes.push(safeText(note, 400));

  const read = [];
  let total = 0;
  let documents = 0;
  for (const f of listing.files) {
    const ctx = { file: safeText(f.path, 400) };
    const entry = fileList[fileIndex.get(ctx.file)];
    if (total + f.size > limits.maxTotalBytes) {
      emit('limit-reached', ctx, 1, { message: `The files read so far are ${limits.maxTotalBytes.toLocaleString('en-US')} bytes, the total limit, so ${ctx.file} and the files after it were not read.`, fix: 'Check a smaller folder, or split the check into several runs.' });
      break;
    }
    let buffer;
    try {
      buffer = await source.read(f.path, limits.maxFileBytes);
    } catch (error) {
      emit('file-not-read', ctx, 1, { message: `${ctx.file} was not read: ${safeText(error.reason ?? error.message, 200)}.`, fix: 'Fix the file, or take it out of the folder. A file that is not read is not checked.' });
      continue;
    }
    total += buffer.length;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      emit('file-not-read', ctx, 1, { message: `${ctx.file} is not valid UTF-8 text, so it was not read.`, fix: 'Save the file as UTF-8.' });
      continue;
    }
    const result = readDocuments(text, limits);
    entry.documents = result.documents.length;
    documents += result.documents.length;
    for (const error of result.errors) {
      emit('yaml-not-read', ctx, error.line, { message: `${safeText(error.message, 300)}. The rest of this document was not read, so nothing in it was checked.`, fix: 'Rewrite the line in the plain form of YAML (no anchors, aliases, tags or merge keys; spaces, not tabs). The other documents of the file are still read.' });
    }
    read.push({ path: ctx.file, documents: result.documents });
  }

  // ---- the workloads
  const { workloads, budgets, others, notes: collectNotes } = collect(read);
  for (const note of collectNotes) notes.push(safeText(note, 400));
  if (others.size > 0) {
    const list = [...others.entries()].sort((a, b) => compareNames(a[0], b[0])).map(([k, n]) => `${safeText(k, 60)} (${n})`).join(', ');
    notes.push(`Documents of other kinds are counted and not checked: ${list}.${others.has('Secret') ? ' A Secret is never opened.' : ''}`);
  }

  for (const w of workloads) checkWorkload(w, { emit, notes, budgets });

  // ---- the report
  found.sort((a, b) => a.fileIndex - b.fileIndex || a.line - b.line || ORDER[a.id] - ORDER[b.id] || compareNames(a.container, b.container) || compareNames(a.message, b.message));
  const findings = found.map(({ fileIndex: _drop, ...rest }) => rest);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const failing = findings.filter((f) => meetsThreshold(f.severity, failOn));
  const eCount = failing.filter((f) => f.severity === 'error').length;
  const wCount = failing.filter((f) => f.severity === 'warning').length;
  const reason = [eCount ? plural(eCount, 'error') : null, wCount ? plural(wCount, 'warning') : null].filter(Boolean).join(', ');

  return {
    tool: 'k8s-manifest-check',
    version,
    target: safeText(target, 400),
    input: { files: fileList, documents, workloads: workloads.length },
    findings,
    notes,
    counts,
    gate: { failOn, pass: failing.length === 0, reason }
  };
}

function checkWorkload(w, { emit, notes, budgets }) {
  const base = { file: w.file, kind: w.kind, name: w.name };
  const podSc = get(w.spec, 'securityContext');
  const os = textOf(dig(w.spec, 'os', 'name'));
  const windows = os === 'windows';
  if (windows) notes.push(`${w.file}:${w.line} ${w.kind} ${w.name}: spec.os.name is windows, so the Restricted controls that the Pod Security Standards page marks Linux only (privilege escalation, seccomp, capabilities) were not checked`);

  const unread = (ctx, line, at, name, wants = 'true or false') => emit('value-not-read', ctx, line, {
    message: `The value of ${name} is not written as ${wants}, so the check on it was not made.`,
    fix: 'Write the value as a plain YAML 1.2 value: true or false, or a whole number.',
    at
  });

  // ---- Pod level: host namespaces, host path volumes, pod-level seccomp and user
  const podCtx = { ...base, container: '' };
  for (const [key, field] of [['hostNetwork', 'spec.hostNetwork'], ['hostPID', 'spec.hostPID'], ['hostIPC', 'spec.hostIPC']]) {
    const entry = entryOf(w.spec, key);
    if (entry === undefined) continue;
    const v = readBool(entry.value);
    const at = `${w.specPath}.${key}`;
    if (v === true) emit('pss-host-namespaces', podCtx, entry.line, { field, at, message: `${key} is true, so the Pod shares the host's namespace. The Baseline profile of the Pod Security Standards disallows it.`, fix: `Remove ${key}, or set it to false.` });
    else if (v === 'unread') unread(podCtx, entry.line, at, key);
  }
  const volumes = get(w.spec, 'volumes');
  if (isSeq(volumes)) {
    volumes.items.forEach((vol, index) => {
      const entry = entryOf(vol, 'hostPath');
      if (entry === undefined || (isScalar(entry.value) && resolveScalar(entry.value).kind === 'null')) return;
      const vname = textOf(get(vol, 'name'));
      emit('pss-host-path', podCtx, entry.line, { field: PSS_CONTROLS.hostPath.fields[0], at: `${w.specPath}.volumes[${index}].hostPath`, message: `The volume ${vname === null ? '(unnamed)' : safeText(vname, 80)} is a hostPath volume, which mounts a path of the node into the Pod. The Baseline profile of the Pod Security Standards forbids it.`, fix: 'Use a persistentVolumeClaim, a configMap, a secret or an emptyDir instead of a path of the node.' });
    });
  }
  const podSeccomp = entryOf(dig(w.spec, 'securityContext', 'seccompProfile'), 'type');
  if (podSeccomp !== undefined && textOf(podSeccomp.value) === 'Unconfined') {
    emit('pss-seccomp-unconfined', podCtx, podSeccomp.line, { field: 'spec.securityContext.seccompProfile.type', at: `${w.specPath}.securityContext.seccompProfile.type`, message: 'The seccomp profile of the Pod is set to Unconfined. The Baseline profile of the Pod Security Standards does not allow it.', fix: 'Set the seccomp profile type to RuntimeDefault.' });
  }
  const podUser = entryOf(podSc, 'runAsUser');
  if (podUser !== undefined) {
    const v = readInt(podUser.value);
    if (v === 0 && !windows) emit('pss-run-as-user-root', podCtx, podUser.line, { field: 'spec.securityContext.runAsUser', at: `${w.specPath}.securityContext.runAsUser`, message: 'runAsUser of the Pod is 0, which is root. The Restricted profile of the Pod Security Standards does not allow it.', fix: 'Set runAsUser to a user id above 0.' });
    else if (v === 'unread') unread(podCtx, podUser.line, `${w.specPath}.securityContext.runAsUser`, 'runAsUser', 'a whole number');
  }

  // ---- containers
  for (const c of w.containers) {
    const ctx = { ...base, container: c.name };
    const at = `${w.specPath}.${c.group}[${c.index}]`;
    const sc = get(c.node, 'securityContext');
    const field = (key, which = 0) => expand(PSS_CONTROLS[key].fields[which], c.group);

    // privileged
    const privileged = entryOf(sc, 'privileged');
    if (privileged !== undefined) {
      const v = readBool(privileged.value);
      if (v === true) emit('pss-privileged', ctx, privileged.line, { field: field('privileged'), at: `${at}.securityContext.privileged`, message: 'The container runs privileged. The Baseline profile of the Pod Security Standards disallows it.', fix: 'Remove privileged, or set it to false, and add only the capabilities the container needs.' });
      else if (v === 'unread') unread(ctx, privileged.line, `${at}.securityContext.privileged`, 'privileged');
    }

    // host ports
    const ports = get(c.node, 'ports');
    if (isSeq(ports)) {
      ports.items.forEach((port, index) => {
        const entry = entryOf(port, 'hostPort');
        if (entry === undefined) return;
        const v = readInt(entry.value);
        if (typeof v === 'number' && v !== 0) emit('pss-host-port', ctx, entry.line, { field: field('hostPorts'), at: `${at}.ports[${index}].hostPort`, message: `The container binds the port of the node ${v} with hostPort. The Baseline profile of the Pod Security Standards says host ports should be disallowed entirely, or restricted to a known list.`, fix: 'Remove hostPort and reach the container through a Service.' });
        else if (v === 'unread') unread(ctx, entry.line, `${at}.ports[${index}].hostPort`, 'hostPort', 'a whole number');
      });
    }

    // capabilities
    const caps = get(sc, 'capabilities');
    const add = entryOf(caps, 'add');
    if (add !== undefined && isSeq(add.value)) {
      const names = add.value.items.map((n) => textOf(n)).filter((n) => n !== null);
      const beyond = names.filter((n) => !BASELINE_CAPABILITIES.includes(n));
      if (beyond.length > 0) emit('pss-capabilities-add', ctx, add.line, { field: field('capabilitiesAdd'), at: `${at}.securityContext.capabilities.add`, message: `The container adds ${beyond.map((n) => safeText(n, 40)).join(', ')}, which the Baseline profile of the Pod Security Standards does not list among the capabilities that may be added.`, fix: 'Remove these capabilities, or run the workload in a namespace that enforces the Privileged profile on purpose.' });
      if (!windows) {
        const extra = names.filter((n) => BASELINE_CAPABILITIES.includes(n) && n !== RESTRICTED_ADDED_CAPABILITY);
        if (extra.length > 0) emit('pss-capabilities-add-restricted', ctx, add.line, { field: field('capabilitiesAddRestricted'), at: `${at}.securityContext.capabilities.add`, message: `The container adds ${extra.map((n) => safeText(n, 40)).join(', ')}. The Restricted profile of the Pod Security Standards only permits adding back ${RESTRICTED_ADDED_CAPABILITY}.`, fix: `Drop ALL capabilities and add back only ${RESTRICTED_ADDED_CAPABILITY}, if the container needs it.` });
      }
    } else if (add !== undefined && !(isScalar(add.value) && resolveScalar(add.value).kind === 'null')) {
      unread(ctx, add.line, `${at}.securityContext.capabilities.add`, 'capabilities.add', 'a list');
    }

    // seccomp
    const cSeccomp = entryOf(dig(sc, 'seccompProfile'), 'type');
    const cType = cSeccomp === undefined ? null : textOf(cSeccomp.value);
    if (cType === 'Unconfined') {
      emit('pss-seccomp-unconfined', ctx, cSeccomp.line, { field: field('seccompBaseline', 1), at: `${at}.securityContext.seccompProfile.type`, message: 'The seccomp profile of the container is set to Unconfined. The Baseline profile of the Pod Security Standards does not allow it.', fix: 'Set the seccomp profile type to RuntimeDefault.' });
    }
    if (!windows) {
      const pType = podSeccomp === undefined ? null : textOf(podSeccomp.value);
      const effective = cType ?? pType;
      if (effective === null) emit('pss-seccomp-missing', ctx, lineOfPath(c.node, 'securityContext', 'seccompProfile', 'type'), { field: field('seccompRestricted', 1), at: `${at}.securityContext.seccompProfile.type`, message: 'No seccomp profile is set, on the container or on the Pod. The Restricted profile of the Pod Security Standards says that the absence of a profile is prohibited.', fix: `Set securityContext.seccompProfile.type to ${SECCOMP_ALLOWED[0]} (or ${SECCOMP_ALLOWED[1]}).` });
      else if (effective !== 'Unconfined' && !SECCOMP_ALLOWED.includes(effective)) emit('pss-seccomp-missing', ctx, cSeccomp === undefined ? podSeccomp.line : cSeccomp.line, { field: field('seccompRestricted', 1), at: `${at}.securityContext.seccompProfile.type`, message: `The seccomp profile type ${safeText(effective, 40)} is not one of ${SECCOMP_ALLOWED.join(' and ')}, the allowed values of the Restricted profile of the Pod Security Standards.`, fix: `Set securityContext.seccompProfile.type to ${SECCOMP_ALLOWED[0]} (or ${SECCOMP_ALLOWED[1]}).` });
    }

    // privilege escalation
    const escalation = entryOf(sc, 'allowPrivilegeEscalation');
    const esc = escalation === undefined ? 'absent' : readBool(escalation.value);
    if (esc === 'unread') unread(ctx, escalation.line, `${at}.securityContext.allowPrivilegeEscalation`, 'allowPrivilegeEscalation');
    else if (!windows && esc !== false) {
      emit('pss-privilege-escalation', ctx, escalation === undefined ? lineOfPath(c.node, 'securityContext') : escalation.line, { field: field('privilegeEscalation'), at: `${at}.securityContext.allowPrivilegeEscalation`, message: `allowPrivilegeEscalation is ${esc === true ? 'true' : 'not set to false'}. The Restricted profile of the Pod Security Standards allows only false.`, fix: 'Set securityContext.allowPrivilegeEscalation to false.' });
    }

    // run as non-root
    const cRoot = entryOf(sc, 'runAsNonRoot');
    const pRoot = entryOf(podSc, 'runAsNonRoot');
    const cv = cRoot === undefined ? 'absent' : readBool(cRoot.value);
    const pv = pRoot === undefined ? 'absent' : readBool(pRoot.value);
    if (cv === 'unread') unread(ctx, cRoot.line, `${at}.securityContext.runAsNonRoot`, 'runAsNonRoot');
    else if (cv === 'absent' && pv === 'unread') unread(ctx, pRoot.line, `${w.specPath}.securityContext.runAsNonRoot`, 'runAsNonRoot');
    else if (cv !== true && !(cv === 'absent' && pv === true)) {
      const where = cv === false ? cRoot.line : cv === 'absent' && pv === false ? pRoot.line : lineOfPath(c.node, 'securityContext', 'runAsNonRoot');
      emit('pss-run-as-non-root', ctx, where, { field: field('runAsNonRoot', 1), at: `${at}.securityContext.runAsNonRoot`, message: `runAsNonRoot is ${cv === false || (cv === 'absent' && pv === false) ? 'false' : 'not set to true, on the container or on the Pod'}. The Restricted profile of the Pod Security Standards requires containers to run as non-root users.`, fix: 'Set securityContext.runAsNonRoot to true, on the container or on the Pod, and make sure the image runs as a user other than root.' });
    }

    // run as user 0
    const user = entryOf(sc, 'runAsUser');
    if (user !== undefined) {
      const v = readInt(user.value);
      if (v === 0) emit('pss-run-as-user-root', ctx, user.line, { field: field('runAsUser', 1), at: `${at}.securityContext.runAsUser`, message: 'runAsUser is 0, which is root. The Restricted profile of the Pod Security Standards does not allow it.', fix: 'Set runAsUser to a user id above 0.' });
      else if (v === 'unread') unread(ctx, user.line, `${at}.securityContext.runAsUser`, 'runAsUser', 'a whole number');
    }

    // drop ALL
    if (!windows) {
      const drop = entryOf(caps, 'drop');
      const dropped = drop !== undefined && isSeq(drop.value) ? drop.value.items.map((n) => textOf(n)) : [];
      if (!dropped.includes('ALL')) emit('pss-capabilities-drop-all', ctx, drop === undefined ? lineOfPath(c.node, 'securityContext', 'capabilities', 'drop') : drop.line, { field: field('capabilitiesDrop'), at: `${at}.securityContext.capabilities.drop`, message: 'The container does not drop ALL capabilities. The Restricted profile of the Pod Security Standards says containers must drop ALL capabilities.', fix: 'Set securityContext.capabilities.drop to [ALL], and add back only what the container needs.' });
    }

    // images
    const image = entryOf(c.node, 'image');
    if (image !== undefined && isScalar(image.value) && textOf(image.value) !== null) {
      const parsed = parseImage(textOf(image.value));
      const shown = safeText(textOf(image.value), 120);
      if (parsed.variable) notes.push(`${w.file}:${image.line} ${w.kind} ${w.name}, container ${c.name}: the image is written with a placeholder, so its tag was not checked`);
      else if (parsed.digest === null && parsed.tag === 'latest') emit('image-tag-latest', ctx, image.line, { at: `${at}.image`, message: `The image ${shown} uses the tag latest. Kubernetes cannot tell which version of the image is running, and a rollback does not return to the version before.`, fix: 'Use a tag that names a version, or the digest of the image (name@sha256:...).', extraFacts: ['img-digest-pins'] });
      else if (parsed.digest === null && parsed.tag === null) emit('image-tag-missing', ctx, image.line, { at: `${at}.image`, message: `The image ${shown} has no tag and no digest, so Kubernetes uses the tag latest.`, fix: 'Use a tag that names a version, or the digest of the image (name@sha256:...).', extraFacts: ['img-digest-fixed'] });
    }

    // secrets as plain environment values
    const env = get(c.node, 'env');
    if (isSeq(env)) {
      env.items.forEach((item, index) => {
        const nameNode = get(item, 'name');
        const valueEntry = entryOf(item, 'value');
        const name = textOf(nameNode);
        if (name === null || valueEntry === undefined || !isScalar(valueEntry.value)) return;
        const value = textOf(valueEntry.value);
        if (value === null || value === '' || value.startsWith('$(')) return;
        if (!looksLikeSecretName(name)) return;
        emit('env-secret-plain', ctx, valueEntry.line, { at: `${at}.env[${index}].value`, message: `The environment variable ${safeText(name, 80)} is written in the manifest with a plain value, and its name says it holds a secret. The value is not shown here.`, fix: 'Keep the value in a Secret and read it with valueFrom.secretKeyRef.' });
      });
    }

    if (c.group !== 'containers') continue;

    // resources
    if (!isMap(get(w.spec, 'resources'))) {
      const resources = entryOf(c.node, 'resources');
      const requests = dig(resources?.value, 'requests');
      const limits = dig(resources?.value, 'limits');
      const has = (map, key) => {
        const v = get(map, key);
        return v !== undefined && !(isScalar(v) && resolveScalar(v).kind === 'null');
      };
      const noRequest = ['cpu', 'memory'].filter((r) => !has(requests, r) && !has(limits, r));
      const noLimit = ['cpu', 'memory'].filter((r) => !has(limits, r));
      const where = (key) => (entryOf(resources?.value, key) ?? resources ?? { line: c.node.line }).line;
      if (noRequest.length > 0) emit('resources-requests-missing', ctx, where('requests'), { at: `${at}.resources.requests`, message: `The container has no resource request for ${noRequest.join(' and ')}. The scheduler cannot place it by what it needs, and the node can evict it first when memory runs short.`, fix: 'Set resources.requests.cpu and resources.requests.memory to what the container uses in normal work.', extraFacts: noLimit.length < 2 ? ['res-limit-copied'] : [] });
      if (noLimit.length > 0) emit('resources-limits-missing', ctx, where('limits'), { at: `${at}.resources.limits`, message: `The container has no resource limit for ${noLimit.join(' and ')}, so nothing stops it from using more of it than it asked for.`, fix: 'Set resources.limits.memory (and resources.limits.cpu if you want a ceiling on CPU).' });
    } else if (!w.notedPodResources) {
      w.notedPodResources = true;
      notes.push(`${w.file}:${w.line} ${w.kind} ${w.name}: resources are set at the Pod level (${w.specPath}.resources), so the requests and limits of its containers were not compared`);
    }

    // probes
    const readiness = entryOf(c.node, 'readinessProbe');
    const hasReadiness = readiness !== undefined && !(isScalar(readiness.value) && resolveScalar(readiness.value).kind === 'null');
    const liveness = entryOf(c.node, 'livenessProbe');
    const hasLiveness = liveness !== undefined && !(isScalar(liveness.value) && resolveScalar(liveness.value).kind === 'null');
    if (PROBE_KINDS.has(w.kind) && !hasReadiness) {
      emit('readiness-probe-missing', ctx, c.node.line, { at: `${at}.readinessProbe`, message: `The container has no readinessProbe${hasLiveness ? ' (it has a livenessProbe, which does not wait for readiness)' : ''}, so the Pod receives traffic as soon as it starts, before the application can answer.`, fix: 'Add a readinessProbe (httpGet, tcpSocket, grpc or exec) that succeeds only when the application can answer.', extraFacts: hasLiveness ? ['probe-liveness-no-wait'] : [] });
    } else if (LIVENESS_NOTE_KINDS.has(w.kind) && hasLiveness && !hasReadiness) {
      emit('liveness-without-readiness', ctx, liveness.line, { at: `${at}.livenessProbe`, message: 'The container has a livenessProbe and no readinessProbe, so traffic goes to the Pod from the start, while the livenessProbe only restarts it.', fix: 'Add a readinessProbe, if the Pod is behind a Service.' });
    }
  }

  // ---- namespace
  const nsCtx = { ...base, container: '' };
  if (w.namespace === null) {
    emit('namespace-missing', nsCtx, w.metadataLine, { at: 'metadata.namespace', message: 'The manifest sets no namespace, so the object goes to the namespace of the current context, which is often default.', fix: 'Set metadata.namespace, or apply the files with a namespace on the command line and keep that in the pipeline.' });
  } else if (w.namespace.value === 'default') {
    emit('namespace-default', nsCtx, w.namespace.line, { at: 'metadata.namespace', message: 'The manifest puts the object in the default namespace.', fix: 'Use a namespace of its own for the application.' });
  }

  // ---- one replica without a disruption budget
  if (w.kind === 'Deployment') {
    const replicas = entryOf(get(w.root, 'spec'), 'replicas');
    if (replicas !== undefined) {
      const v = readInt(replicas.value);
      if (v === 'unread') unread(nsCtx, replicas.line, 'spec.replicas', 'replicas', 'a whole number');
      else if (v === 1) {
        const labels = labelsOf(dig(w.root, 'spec', 'template', 'metadata', 'labels'));
        const covered = budgets.some((b) => budgetCovers(b, w, labels, notes));
        if (!covered) emit('replicas-one-no-pdb', nsCtx, replicas.line, { at: 'spec.replicas', message: 'The Deployment runs one replica, and no PodDisruptionBudget in the files selects its Pods. A voluntary disruption, such as draining a node, takes the only Pod down.', fix: 'Run two or more replicas and add a PodDisruptionBudget, or accept the downtime on purpose.', extraFacts: ['pdb-selector'] });
      }
    }
  }
}

// The labels of a Pod template as a Map of name to text; a value that is not text is left out.
function labelsOf(node) {
  const labels = new Map();
  if (!isMap(node)) return labels;
  for (const e of node.entries) {
    const v = textOf(e.value);
    if (v !== null) labels.set(e.key, v);
  }
  return labels;
}

// Does the budget select the Pods of the workload? Same namespace (both unset counts as the same), and every matchLabels
// pair of its selector is among the labels of the Pod template. A selector with matchExpressions, or with nothing to
// compare, cannot be worked out, and is counted as a match with a note, so the info finding is never wrong by guessing.
function budgetCovers(budget, w, labels, notes) {
  const ns = (x) => (x.namespace === null ? '' : x.namespace.value ?? '');
  if (ns(budget) !== ns(w)) return false;
  const selector = dig(budget.root, 'spec', 'selector');
  const matchLabels = get(selector, 'matchLabels');
  if (get(selector, 'matchExpressions') !== undefined || !isMap(matchLabels) || matchLabels.entries.length === 0) {
    const text = `${budget.file}:${budget.line} PodDisruptionBudget ${budget.name}: its selector cannot be compared with the labels by this tool (matchExpressions, or no matchLabels), so it was taken as selecting the Deployments in its namespace`;
    if (!notes.includes(text)) notes.push(text);
    return true;
  }
  return matchLabels.entries.every((e) => labels.get(e.key) === textOf(e.value));
}
