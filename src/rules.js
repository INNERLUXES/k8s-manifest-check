// The checks: every finding id, its severity and the sentences of the saved pages that it quotes. docs/method.md gives
// the rule of each one, and docs/rules-and-sources.md lists every sentence. An id, once released, keeps its meaning,
// because pipelines read it from the JSON and CSV reports.
//
// facts: the keys of FACTS in data.js that the finding always quotes. optional: keys that a finding can add, depending
// on what the file shows. profile: the Pod Security Standards profile (the heading of the page) that the control is
// listed under; control: the key in PSS_CONTROLS. A finding without facts is about the file itself, or is a conclusion
// that no page states.
//
// Severity of the Pod Security Standards findings is the tool's own mapping: a control of the Baseline profile is an
// error, a control of the Restricted profile is a warning. The page states the controls, not a severity.

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 3, warning: 2, info: 1 };

export const FINDINGS = [
  // ---- errors
  { id: 'file-not-read', severity: 'error', facts: [] },
  { id: 'yaml-not-read', severity: 'error', facts: [] },
  { id: 'limit-reached', severity: 'error', facts: [] },
  { id: 'pss-privileged', severity: 'error', profile: 'Baseline', control: 'privileged', facts: ['pss-privileged', 'pss-all-containers'] },
  { id: 'pss-host-namespaces', severity: 'error', profile: 'Baseline', control: 'hostNamespaces', facts: ['pss-host-namespaces'] },
  { id: 'pss-host-path', severity: 'error', profile: 'Baseline', control: 'hostPath', facts: ['pss-host-path'] },
  { id: 'pss-host-port', severity: 'error', profile: 'Baseline', control: 'hostPorts', facts: ['pss-host-ports'] },
  { id: 'pss-capabilities-add', severity: 'error', profile: 'Baseline', control: 'capabilitiesAdd', facts: ['pss-capabilities-baseline'] },
  { id: 'pss-seccomp-unconfined', severity: 'error', profile: 'Baseline', control: 'seccompBaseline', facts: ['pss-seccomp-baseline'] },

  // ---- warnings
  { id: 'pss-privilege-escalation', severity: 'warning', profile: 'Restricted', control: 'privilegeEscalation', facts: ['pss-privilege-escalation'] },
  { id: 'pss-run-as-non-root', severity: 'warning', profile: 'Restricted', control: 'runAsNonRoot', facts: ['pss-non-root', 'pss-non-root-pod-level'] },
  { id: 'pss-run-as-user-root', severity: 'warning', profile: 'Restricted', control: 'runAsUser', facts: ['pss-run-as-user'] },
  { id: 'pss-seccomp-missing', severity: 'warning', profile: 'Restricted', control: 'seccompRestricted', facts: ['pss-seccomp-restricted', 'pss-seccomp-pod-level'] },
  { id: 'pss-capabilities-drop-all', severity: 'warning', profile: 'Restricted', control: 'capabilitiesDrop', facts: ['pss-capabilities-restricted'] },
  { id: 'pss-capabilities-add-restricted', severity: 'warning', profile: 'Restricted', control: 'capabilitiesAddRestricted', facts: ['pss-capabilities-restricted'] },
  { id: 'resources-requests-missing', severity: 'warning', facts: ['res-scheduler', 'res-capacity', 'res-evicted'], optional: ['res-limit-copied'] },
  { id: 'resources-limits-missing', severity: 'warning', facts: ['res-limit-enforced', 'res-memory-oom', 'res-cpu-throttle'] },
  { id: 'readiness-probe-missing', severity: 'warning', facts: ['probe-readiness-defn', 'probe-readiness-traffic', 'probe-readiness-endpoints'], optional: ['probe-liveness-no-wait'] },
  { id: 'image-tag-latest', severity: 'warning', facts: ['img-avoid-latest', 'img-meaningful-tag', 'img-policy-latest'], optional: ['img-digest-pins'] },
  { id: 'image-tag-missing', severity: 'warning', facts: ['img-default-latest', 'img-avoid-latest', 'img-policy-no-tag', 'img-meaningful-tag'], optional: ['img-digest-fixed'] },
  { id: 'env-secret-plain', severity: 'warning', facts: ['secret-defn', 'secret-exposure', 'secret-env'] },

  // ---- info: never fails the run
  { id: 'liveness-without-readiness', severity: 'info', facts: ['probe-liveness-no-wait', 'probe-liveness-cascade', 'probe-liveness-difference', 'probe-readiness-traffic'] },
  { id: 'replicas-one-no-pdb', severity: 'info', facts: ['pdb-intro', 'pdb-replicate', 'pdb-single-instance'], optional: ['pdb-selector'] },
  { id: 'namespace-missing', severity: 'info', facts: ['ns-default'] },
  { id: 'namespace-default', severity: 'info', facts: ['ns-default'] },
  { id: 'value-not-read', severity: 'info', facts: [] }
];

export const ORDER = Object.fromEntries(FINDINGS.map((f, i) => [f.id, i]));

export const meetsThreshold = (severity, failOn) => RANK[severity] >= RANK[failOn];

// C0 and C1 control characters, line and paragraph separators, and the Unicode direction controls.
const UNSAFE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');

// Text that comes from a file goes through this before it reaches a message: control, line separator and direction
// characters become a space, and the length is cut.
export function safeText(value, max = 200) {
  const text = String(value).replace(UNSAFE, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
