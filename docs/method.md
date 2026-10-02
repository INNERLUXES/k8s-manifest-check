# Method

How a run works, what each check reports, its exact rule, and what it can and cannot see. A sentence in quotes is on a saved page of the Kubernetes documentation, listed in [rules-and-sources.md](rules-and-sources.md). A conclusion that no page states is called the tool's own, here and in the message of the finding.

## A run

1. The folder is walked, in code unit order, and every file that ends in `.yaml` or `.yml` is listed. A single file can be given instead of a folder.
2. Each file is read whole, as UTF-8 text, and cut into documents at the lines that start with `---`. Each document is read by the YAML reader below. A document that cannot be read is a `yaml-not-read` finding with the line, and the other documents of the file are still read.
3. A document with a `kind` of `Pod`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job` or `CronJob` is a workload, and the checks run on the containers in its Pod spec. A `kind: List` is opened and each item is read as a document of its own. A `PodDisruptionBudget` is kept for one check. A document of any other kind is counted in a note and not looked at. A `Secret` is counted and never opened.
4. Findings are sorted by file, then line, then the order of the checks in the list below.

The Pod spec is at `spec` for a Pod, at `spec.template.spec` for a Deployment, StatefulSet, DaemonSet, ReplicaSet and Job, and at `spec.jobTemplate.spec.template.spec` for a CronJob. The containers are the lists `containers` and `initContainers` of the Pod spec. `ephemeralContainers` are not part of a manifest that is applied and are not read.

## The YAML reader

The tool has its own reader for the part of YAML that manifests use, so that it needs no dependency and decides for itself what it accepts.

Read: block maps, block sequences (a sequence may sit at the same indent as its key), flow sequences and flow maps (nested, on one line or over several lines), plain, single-quoted and double-quoted scalars (on one line or over several lines), the block scalars `|` and `>` with their chomping and indent indicators, comments, and the separators `---` and `...`.

Refused, with the line and a message: anchors (`&name`), aliases (`*name`), tags (`!` and `!!`), merge keys (`<<`), complex keys (`?`), directives (`%`), tabs in indentation, control characters, duplicate keys, text after a closing quote or bracket, and content on the same line as `---`.

Why anchors, aliases and merge keys are refused: an alias is a second name for a node that already exists, so a file of a few hundred bytes can define a node that stands for billions of copies of a string (the "billion laughs" file). A reader that builds the copies runs out of memory, and a reader that keeps the aliases as references still has to decide how to compare, print and walk them. This reader never builds one. A manifest that uses them is reported as `yaml-not-read` with the line, and is not half read. Tags can ask a loader to build a value of a named type, which no check needs. Duplicate keys are refused because two readers can disagree about which one wins.

The reader reads each line a bounded number of times and each character of a scalar once. It stops with an error at a nesting of 64 levels, at 200,000 nodes in a document, at 500 documents in a file and at a scalar of 262,144 characters. A plain scalar is read as a boolean only as `true`, `false` (and their capitalized forms), as a whole number only in decimal digits, and as null as `null`, `~` or empty. The words `yes`, `no`, `on`, `off`, `y` and `n` are not read as booleans, and a field that needs one is reported as `value-not-read`; no saved page says how a cluster reads them, so the tool does not guess.

## Severity of the Pod Security Standards findings

The page lists controls under the profiles Baseline and Restricted, and says that the Restricted policy includes the Baseline one. It does not give a severity. The tool's own mapping: a control of the Baseline profile is an `error`, a control of the Restricted profile is a `warning`. Each finding names its profile and the field path exactly as the page writes it (`field`), and the path in the manifest (`at`). The page says: "If any of the listed containers fails to meet the requirements, the entire pod will fail validation." So a field that is allowed in one container and not in another is reported for the one that fails.

A container field that the page says may be undefined when the Pod-level field is set (`runAsNonRoot`, `seccompProfile.type`) is read as the container value when it is there and as the Pod value when it is not.

## Errors

### `file-not-read`

A file that could not be read: not UTF-8 text, over the size limit, not a regular file, a link that leads outside the folder, or a folder that could not be listed. A file that is not read is not checked, so the gate fails.

### `yaml-not-read`

A document that the YAML reader refused, with the line and the reason. The rest of that document is not read.

### `limit-reached`

A limit was reached (more manifest files than the limit, a folder tree that is too deep or too large, the total size of the files, more documents in a file than the limit). What is after the limit is not read.

### `pss-privileged`

`privileged: true` in the `securityContext` of a container or init container. Baseline control Privileged Containers: "Privileged Pods disable most security mechanisms and must be disallowed." The allowed values are undefined and `false`.

### `pss-host-namespaces`

`hostNetwork`, `hostPID` or `hostIPC` set to `true` in the Pod spec, one finding for each. Baseline control Host Namespaces: "Sharing the host namespaces must be disallowed."

### `pss-host-path`

A volume of the Pod with a `hostPath` that is not null. Baseline control HostPath Volumes: "HostPath volumes must be forbidden."

### `pss-host-port`

A container port with a `hostPort` other than 0. Baseline control Host Ports: "HostPorts should be disallowed entirely (recommended) or restricted to a known list". The page says the known list is not supported by the built-in Pod Security Admission controller, and the tool has no list, so every non-zero `hostPort` is reported.

### `pss-capabilities-add`

A capability in `capabilities.add` that is not on the list of the Baseline control Capabilities (AUDIT_WRITE, CHOWN, DAC_OVERRIDE, FOWNER, FSETID, KILL, MKNOD, NET_BIND_SERVICE, SETFCAP, SETGID, SETPCAP, SETUID, SYS_CHROOT): "Adding additional capabilities beyond those listed below must be disallowed." Names are compared as written, in capitals. `ALL` is not on the list.

### `pss-seccomp-unconfined`

A seccomp profile type of `Unconfined`, on the Pod or on a container. Baseline control Seccomp: "Seccomp profile must not be explicitly set to Unconfined."

## Warnings

### `pss-privilege-escalation`

`allowPrivilegeEscalation` that is `true` or not set in a container. Restricted control Privilege Escalation: the allowed value is `false`. There is no Pod-level field. Not checked for a Pod with `spec.os.name` of `windows`, because the page marks the control Linux only.

### `pss-run-as-non-root`

`runAsNonRoot` that is not `true` on the container, and not `true` on the Pod either. Restricted control Running as Non-root: "Containers must be required to run as non-root users." The tool does not look at the image, so it cannot know that an image runs as a non-root user without the field.

### `pss-run-as-user-root`

`runAsUser: 0` on a container or on the Pod. Restricted control Running as Non-root user: "Containers must not set runAsUser to 0". Any other number, and no value, are allowed.

### `pss-seccomp-missing`

No seccomp profile type on the container or on the Pod, or a type other than `RuntimeDefault` and `Localhost` (and other than `Unconfined`, which is the Baseline finding). Restricted control Seccomp: "Seccomp profile must be explicitly set to one of the allowed values. Both the Unconfined profile and the absence of a profile are prohibited." Not checked for a Windows Pod.

### `pss-capabilities-drop-all`

`capabilities.drop` that does not include `ALL`. Restricted control Capabilities: "Containers must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability." Not checked for a Windows Pod.

### `pss-capabilities-add-restricted`

A capability in `capabilities.add` that the Baseline list allows and the Restricted control does not: anything except `NET_BIND_SERVICE`. A capability that the Baseline list does not allow is `pss-capabilities-add`.

### `resources-requests-missing`

A container (not an init container) without a request for `cpu`, for `memory`, or for both. A resource counts as requested when `resources.requests` has it, or when `resources.limits` has it, because the page says: "If you specify a limit for a resource, but do not specify any request, and no admission-time mechanism has applied a default request for that resource, then Kubernetes copies the limit you specified and uses it as the requested value for the resource." The quoted reasons are that the scheduler uses the requests to choose a node and that a container above its memory request is likely to be evicted first. The tool cannot see a LimitRange or another admission-time default, so a container that gets its requests that way is reported. A Pod that sets `resources` at the Pod level is not compared; a note says so.

### `resources-limits-missing`

A container without a limit for `cpu`, for `memory`, or for both. The page says that the kubelet enforces a limit, that memory limits are enforced with out of memory kills and cpu limits by throttling. That a team may choose to run without a cpu limit is not something the page says, so the tool does not decide it for them; the message names what is missing and the fix leads with the memory limit.

### `readiness-probe-missing`

A container of a Deployment or a StatefulSet without a `readinessProbe` (or with a null one). The page: "To start sending traffic to a Pod only when a probe succeeds, specify a readiness probe." The tool does not check that a Service selects the Pod; it treats a Deployment or a StatefulSet as something that serves traffic. A Job and a CronJob are not asked for one. When the container has a `livenessProbe`, the message says so and quotes that liveness probes do not wait for readiness probes.

### `image-tag-latest`

An image with the tag `latest` and no digest. The page: "You should avoid using the :latest tag when deploying containers in production as it is harder to track which version of the image is running and more difficult to roll back properly." Only the exact tag `latest` is reported. An image with a digest is not reported, with or without a tag, because the page says that an image digest "uniquely identifies a specific version of the image". The tool does not read `imagePullPolicy`; it quotes what the page says the default is.

### `image-tag-missing`

An image with no tag and no digest. The page: "If you don't specify a tag, Kubernetes assumes you mean the tag latest." The tag is the part after the last colon that follows the last slash, so a registry port (`localhost:5000/app`) is not a tag. An image written with a placeholder (`${IMAGE}`, `$(IMAGE)`, `{{ ... }}`) is not checked, and a note says so.

### `env-secret-plain`

An environment variable of a container with a literal `value` whose name looks like the name of a secret. The page: "A Secret is an object that contains a small amount of sensitive data such as a password, a token, or a key. Such information might otherwise be put in a Pod specification or in a container image."

The name rule is the tool's own, because no page lists names. The name is read in capitals with `-` and `.` as `_`, and it counts when it contains `PASSWORD`, `PASSWD`, `SECRET`, `TOKEN`, `API_KEY`, `APIKEY`, `ACCESS_KEY`, `PRIVATE_KEY`, `CREDENTIAL` or `AUTH_KEY`. It does not count when it ends in `_FILE`, `_PATH`, `_NAME`, `_DIR`, `_URL`, `_ENABLED`, `_ENDPOINT` or `_REF`, because such a name points at a secret and is not one. A value that is empty, or that starts with `$(` (a reference to another variable), is not reported, and neither is an entry that uses `valueFrom`. The value is never read into a finding: the report holds the name of the variable and the line of the `value` key, and nothing of the value, not its length either. A secret in a variable with a name the rule does not know is not seen.

## Info

Info findings never fail a run, whatever `--fail-on` says.

### `liveness-without-readiness`

A container of a Pod, a ReplicaSet or a DaemonSet with a `livenessProbe` and no `readinessProbe`. The page: "Liveness probes do not wait for readiness probes to succeed." and: "Understand the difference between liveness and readiness probes and when to apply them for your app." For a Deployment and a StatefulSet the same situation is the warning `readiness-probe-missing`, so it is not reported twice.

### `replicas-one-no-pdb`

A Deployment with `spec.replicas: 1` written in the manifest, and no `PodDisruptionBudget` in the files that selects its Pods. A budget selects the Pods when it is in the same namespace (both unset counts as the same) and every pair of its `selector.matchLabels` is among the labels of the Pod template. A budget with `matchExpressions`, or with a selector that has nothing to compare, cannot be worked out by this tool, so it counts as a match and a note says so. A Deployment with no `replicas` field is not reported: the saved pages do not say what the default is. The page itself says that for a single-instance application a possible solution is: "Do not use a PDB and tolerate occasional downtime.", so this is an info and not a warning.

### `namespace-missing`

A workload with no `metadata.namespace`. The page: "For a production cluster, consider not using the default namespace. Instead, make other namespaces and use those." The tool cannot see the namespace that the files are applied with (`kubectl apply -n`, a kustomization, a Helm release), so it says what the file shows.

### `namespace-default`

A workload with `metadata.namespace: default`. Same page, same sentence.

### `value-not-read`

A value that a check needs is not written as `true` or `false`, or as a whole number: for example `privileged: yes`, or `runAsUser: "0"`. The check on that field was not made. Write the plain YAML 1.2 value.
