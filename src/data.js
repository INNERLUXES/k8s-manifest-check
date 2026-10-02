// Every field path, every list of names and every quoted sentence that the checks rely on comes from a page of the
// Kubernetes documentation. The pages are saved as text in research/sources (the address is on the first line), and
// test/data.test.js compares this file with the saved text. Nothing here was written from memory: a sentence that is not
// on a saved page is not a fact of this file.

// id: used in FACTS; title: the heading of the saved page; file: the saved text in research/sources; url: the address.
export const SOURCES = [
  { id: 'pss', title: 'Pod Security Standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/', file: 'k8s-pod-security-standards.txt' },
  { id: 'resources', title: 'Resource Management for Pods and Containers', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/', file: 'k8s-manage-resources-containers.txt' },
  { id: 'probes', title: 'Liveness, Readiness, and Startup Probes', url: 'https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/', file: 'k8s-probes.txt' },
  { id: 'images', title: 'Images', url: 'https://kubernetes.io/docs/concepts/containers/images/', file: 'k8s-images.txt' },
  { id: 'disruptions', title: 'Disruptions', url: 'https://kubernetes.io/docs/concepts/workloads/pods/disruptions/', file: 'k8s-disruptions.txt' },
  { id: 'pdb', title: 'Specifying a Disruption Budget for your Application', url: 'https://kubernetes.io/docs/tasks/run-application/configure-pdb/', file: 'k8s-configure-pdb.txt' },
  { id: 'namespaces', title: 'Namespaces', url: 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/', file: 'k8s-namespaces.txt' },
  { id: 'secret', title: 'Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/', file: 'k8s-secret.txt' }
];

export const sourceUrl = (id) => SOURCES.find((s) => s.id === id).url;

// The Pod Security Standards. profile is the heading of the page that the control is listed under; control is the name
// that the page gives it; fields are the paths of the "Restricted Fields" of the control, exactly as the page writes
// them, where {c} stands for containers and for initContainers (the page lists both, and ephemeralContainers).
export const PSS_CONTROLS = {
  privileged: { profile: 'Baseline', control: 'Privileged Containers', fields: ['spec.{c}[*].securityContext.privileged'] },
  hostNamespaces: { profile: 'Baseline', control: 'Host Namespaces', fields: ['spec.hostNetwork', 'spec.hostPID', 'spec.hostIPC'] },
  hostPath: { profile: 'Baseline', control: 'HostPath Volumes', fields: ['spec.volumes[*].hostPath'] },
  hostPorts: { profile: 'Baseline', control: 'Host Ports', fields: ['spec.{c}[*].ports[*].hostPort'] },
  capabilitiesAdd: { profile: 'Baseline', control: 'Capabilities', fields: ['spec.{c}[*].securityContext.capabilities.add'] },
  seccompBaseline: { profile: 'Baseline', control: 'Seccomp', fields: ['spec.securityContext.seccompProfile.type', 'spec.{c}[*].securityContext.seccompProfile.type'] },
  privilegeEscalation: { profile: 'Restricted', control: 'Privilege Escalation (v1.8+)', fields: ['spec.{c}[*].securityContext.allowPrivilegeEscalation'] },
  runAsNonRoot: { profile: 'Restricted', control: 'Running as Non-root', fields: ['spec.securityContext.runAsNonRoot', 'spec.{c}[*].securityContext.runAsNonRoot'] },
  runAsUser: { profile: 'Restricted', control: 'Running as Non-root user (v1.23+)', fields: ['spec.securityContext.runAsUser', 'spec.{c}[*].securityContext.runAsUser'] },
  seccompRestricted: { profile: 'Restricted', control: 'Seccomp (v1.19+)', fields: ['spec.securityContext.seccompProfile.type', 'spec.{c}[*].securityContext.seccompProfile.type'] },
  capabilitiesDrop: { profile: 'Restricted', control: 'Capabilities (v1.22+)', fields: ['spec.{c}[*].securityContext.capabilities.drop'] },
  capabilitiesAddRestricted: { profile: 'Restricted', control: 'Capabilities (v1.22+)', fields: ['spec.{c}[*].securityContext.capabilities.add'] }
};

// The capabilities that the Baseline policy allows to be added: the "Allowed Values" of its Capabilities control.
export const BASELINE_CAPABILITIES = ['AUDIT_WRITE', 'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'FSETID', 'KILL', 'MKNOD', 'NET_BIND_SERVICE', 'SETFCAP', 'SETGID', 'SETPCAP', 'SETUID', 'SYS_CHROOT'];

// The one capability that the Restricted policy allows to be added back.
export const RESTRICTED_ADDED_CAPABILITY = 'NET_BIND_SERVICE';

// The values of the seccomp type that the Restricted policy allows.
export const SECCOMP_ALLOWED = ['RuntimeDefault', 'Localhost'];

// The Kubernetes kinds whose Pod template the tool reads, and the path to the Pod spec in each.
export const WORKLOAD_PATHS = {
  Pod: ['spec'],
  Deployment: ['spec', 'template', 'spec'],
  StatefulSet: ['spec', 'template', 'spec'],
  DaemonSet: ['spec', 'template', 'spec'],
  ReplicaSet: ['spec', 'template', 'spec'],
  Job: ['spec', 'template', 'spec'],
  CronJob: ['spec', 'jobTemplate', 'spec', 'template', 'spec']
};

// Names of environment variables that hold a secret, and the endings that mark a name as a reference to one. This is
// the tool's own convention: no page lists names. docs/method.md describes it.
export const SECRET_NAME_WORDS = ['PASSWORD', 'PASSWD', 'SECRET', 'TOKEN', 'API_KEY', 'APIKEY', 'ACCESS_KEY', 'PRIVATE_KEY', 'CREDENTIAL', 'AUTH_KEY'];
export const SECRET_NAME_REFERENCE_ENDINGS = ['_FILE', '_PATH', '_NAME', '_DIR', '_URL', '_ENABLED', '_ENDPOINT', '_REF'];

// The sentences that the findings quote. section is a heading of the saved page; text is copied from it.
export const FACTS = {
  // ---- Pod Security Standards
  'pss-all-containers': {
    source: 'pss',
    section: 'Baseline',
    text: 'If any of the listed containers fails to meet the requirements, the entire pod will fail validation.'
  },
  'pss-privileged': {
    source: 'pss',
    section: 'Baseline',
    text: 'Privileged Pods disable most security mechanisms and must be disallowed.'
  },
  'pss-host-namespaces': {
    source: 'pss',
    section: 'Baseline',
    text: 'Sharing the host namespaces must be disallowed.'
  },
  'pss-host-path': {
    source: 'pss',
    section: 'Baseline',
    text: 'HostPath volumes must be forbidden.'
  },
  'pss-host-ports': {
    source: 'pss',
    section: 'Baseline',
    text: 'HostPorts should be disallowed entirely (recommended) or restricted to a known list'
  },
  'pss-capabilities-baseline': {
    source: 'pss',
    section: 'Baseline',
    text: 'Adding additional capabilities beyond those listed below must be disallowed.'
  },
  'pss-seccomp-baseline': {
    source: 'pss',
    section: 'Baseline',
    text: 'Seccomp profile must not be explicitly set to Unconfined.'
  },
  'pss-privilege-escalation': {
    source: 'pss',
    section: 'Restricted',
    text: 'Privilege escalation (such as via set-user-ID or set-group-ID file mode) should not be allowed.'
  },
  'pss-non-root': {
    source: 'pss',
    section: 'Restricted',
    text: 'Containers must be required to run as non-root users.'
  },
  'pss-non-root-pod-level': {
    source: 'pss',
    section: 'Restricted',
    text: 'The container fields may be undefined/nil if the pod-level spec.securityContext.runAsNonRoot is set to true.'
  },
  'pss-run-as-user': {
    source: 'pss',
    section: 'Restricted',
    text: 'Containers must not set runAsUser to 0'
  },
  'pss-seccomp-restricted': {
    source: 'pss',
    section: 'Restricted',
    text: 'Seccomp profile must be explicitly set to one of the allowed values. Both the Unconfined profile and the absence of a profile are prohibited.'
  },
  'pss-seccomp-pod-level': {
    source: 'pss',
    section: 'Restricted',
    text: 'The container fields may be undefined/nil if the pod-level spec.securityContext.seccompProfile.type field is set appropriately.'
  },
  'pss-capabilities-restricted': {
    source: 'pss',
    section: 'Restricted',
    text: 'Containers must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability.'
  },

  // ---- resource management
  'res-scheduler': {
    source: 'resources',
    section: 'Resource Management for Pods and Containers',
    text: 'When you specify the resource request for containers in a Pod, the kube-scheduler uses this information to decide which node to place the Pod on.'
  },
  'res-limit-enforced': {
    source: 'resources',
    section: 'Resource Management for Pods and Containers',
    text: 'When you specify a resource limit for a container, the kubelet enforces those limits so that the running container is not allowed to use more of that resource than the limit you set.'
  },
  'res-evicted': {
    source: 'resources',
    section: 'How Kubernetes applies resource requests and limits',
    text: 'If a container exceeds its memory request and the node that it runs on becomes short of memory overall, it is likely that the Pod the container belongs to will be evicted.'
  },
  'res-capacity': {
    source: 'resources',
    section: 'How Pods with resource requests are scheduled',
    text: 'The scheduler ensures that, for each resource type, the sum of the resource requests of the scheduled containers is less than the capacity of the node.'
  },
  'res-memory-oom': {
    source: 'resources',
    section: 'Requests and limits',
    text: 'memory limits are enforced by the kernel with out of memory (OOM) kills.'
  },
  'res-cpu-throttle': {
    source: 'resources',
    section: 'Requests and limits',
    text: 'cpu limits are enforced by CPU throttling.'
  },
  'res-limit-copied': {
    source: 'resources',
    section: 'Requests and limits',
    text: 'If you specify a limit for a resource, but do not specify any request, and no admission-time mechanism has applied a default request for that resource, then Kubernetes copies the limit you specified and uses it as the requested value for the resource.'
  },

  // ---- probes
  'probe-readiness-defn': {
    source: 'probes',
    section: 'Readiness probe',
    text: 'Readiness probes determine when a container is ready to accept traffic.'
  },
  'probe-readiness-endpoints': {
    source: 'probes',
    section: 'Readiness probe',
    text: "If the readiness probe returns a failed state, the EndpointSlice controller removes the Pod's IP address from the EndpointSlices of all Services that match the Pod."
  },
  'probe-readiness-traffic': {
    source: 'probes',
    section: 'When should you use a readiness probe?',
    text: 'To start sending traffic to a Pod only when a probe succeeds, specify a readiness probe.'
  },
  'probe-liveness-no-wait': {
    source: 'probes',
    section: 'Liveness probe',
    text: 'Liveness probes do not wait for readiness probes to succeed.'
  },
  'probe-liveness-cascade': {
    source: 'probes',
    section: 'Liveness probe',
    text: 'Incorrect implementation of liveness probes can lead to cascading failures.'
  },
  'probe-liveness-difference': {
    source: 'probes',
    section: 'Liveness probe',
    text: 'Understand the difference between liveness and readiness probes and when to apply them for your app.'
  },

  // ---- images
  'img-default-latest': {
    source: 'images',
    section: 'Image names',
    text: "If you don't specify a tag, Kubernetes assumes you mean the tag latest."
  },
  'img-digest-fixed': {
    source: 'images',
    section: 'Image names',
    text: "Digests are a unique identifier for a specific version of an image. Digests are hashes of the image's content, and are immutable. Tags can be moved to point to different images, but digests are fixed."
  },
  'img-avoid-latest': {
    source: 'images',
    section: 'Image pull policy',
    text: 'You should avoid using the :latest tag when deploying containers in production as it is harder to track which version of the image is running and more difficult to roll back properly.'
  },
  'img-meaningful-tag': {
    source: 'images',
    section: 'Image pull policy',
    text: 'Instead, specify a meaningful tag such as v1.42.0 and/or a digest.'
  },
  'img-digest-pins': {
    source: 'images',
    section: 'Image pull policy',
    text: 'An image digest uniquely identifies a specific version of the image, so Kubernetes runs the same code every time it starts a container with that image name and digest specified.'
  },
  'img-policy-latest': {
    source: 'images',
    section: 'Default image pull policy',
    text: 'if you omit the imagePullPolicy field, and the tag for the container image is :latest, imagePullPolicy is automatically set to Always.'
  },
  'img-policy-no-tag': {
    source: 'images',
    section: 'Default image pull policy',
    text: "if you omit the imagePullPolicy field, and you don't specify the tag for the container image, imagePullPolicy is automatically set to Always."
  },

  // ---- disruptions, namespaces, Secrets
  'pdb-intro': {
    source: 'disruptions',
    section: 'Pod disruption budgets',
    text: 'As an application owner, you can create a PodDisruptionBudget (PDB) for each application. A PDB limits the number of Pods of a replicated application that are down simultaneously from voluntary disruptions.'
  },
  'pdb-replicate': {
    source: 'disruptions',
    section: 'Dealing with disruptions',
    text: 'Replicate your application if you need higher availability.'
  },
  'pdb-selector': {
    source: 'pdb',
    section: 'Identify an Application to Protect',
    text: "In this case, make a note of the controller's .spec.selector; the same selector goes into the PDBs .spec.selector."
  },
  'pdb-single-instance': {
    source: 'pdb',
    section: 'Think about how your application reacts to disruptions',
    text: 'Possible Solution 1: Do not use a PDB and tolerate occasional downtime.'
  },
  'ns-default': {
    source: 'namespaces',
    section: 'When to Use Multiple Namespaces',
    text: 'For a production cluster, consider not using the default namespace. Instead, make other namespaces and use those.'
  },
  'secret-defn': {
    source: 'secret',
    section: 'Secrets',
    text: 'A Secret is an object that contains a small amount of sensitive data such as a password, a token, or a key. Such information might otherwise be put in a Pod specification or in a container image.'
  },
  'secret-exposure': {
    source: 'secret',
    section: 'Secrets',
    text: 'Because Secrets can be created independently of the Pods that use them, there is less risk of the Secret (and its data) being exposed during the workflow of creating, viewing, and editing Pods.'
  },
  'secret-env': {
    source: 'secret',
    section: 'Using Secrets as environment variables',
    text: 'For each container in your Pod specification, add an environment variable for each Secret key that you want to use to the env[].valueFrom.secretKeyRef field.'
  }
};

// Sentences that the documents quote about what depends on the Kubernetes version. Each one is on a saved page, and the
// tool never decides on a version: it reads what the manifest says.
export const VERSION_NOTES = [
  { source: 'pss', section: 'Restricted', text: 'This is Linux only policy in v1.25+ (spec.os.name != windows)' },
  { source: 'pss', section: 'Restricted', text: 'Privilege Escalation (v1.8+)' },
  { source: 'pss', section: 'Restricted', text: 'Running as Non-root user (v1.23+)' },
  { source: 'pss', section: 'Restricted', text: 'Seccomp (v1.19+)' },
  { source: 'pss', section: 'Restricted', text: 'Capabilities (v1.22+)' },
  { source: 'pss', section: 'Baseline', text: 'container_engine_t (since Kubernetes 1.31)' },
  { source: 'pss', section: 'Baseline', text: 'Known list (not supported by the built-in Pod Security Admission controller)' },
  { source: 'resources', section: 'Pod-level resource specification', text: 'Provided your cluster has the PodLevelResources feature gate enabled, you can specify resource requests and limits at the Pod level.' },
  { source: 'pdb', section: 'Identify an Application to Protect', text: 'From version 1.15 PDBs support custom controllers where the scale subresource is enabled.' }
];
