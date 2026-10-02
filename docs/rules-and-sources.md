# Rules and sources

Every sentence, field path and name that the checks rely on comes from a page of the Kubernetes documentation that is saved in this repository. The first line of each saved file is the address of the page, and `test/data.test.js` compares this list, `src/data.js` and the saved text word for word. Nothing is written from memory. A conclusion that no page states is marked as the tool's own in [method.md](method.md) and in the message of the finding.

## Saved pages

| Page | Address | Saved text |
| --- | --- | --- |
| Pod Security Standards | https://kubernetes.io/docs/concepts/security/pod-security-standards/ | `research/sources/k8s-pod-security-standards.txt` |
| Resource Management for Pods and Containers | https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ | `research/sources/k8s-manage-resources-containers.txt` |
| Liveness, Readiness, and Startup Probes | https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/ | `research/sources/k8s-probes.txt` |
| Images | https://kubernetes.io/docs/concepts/containers/images/ | `research/sources/k8s-images.txt` |
| Disruptions | https://kubernetes.io/docs/concepts/workloads/pods/disruptions/ | `research/sources/k8s-disruptions.txt` |
| Specifying a Disruption Budget for your Application | https://kubernetes.io/docs/tasks/run-application/configure-pdb/ | `research/sources/k8s-configure-pdb.txt` |
| Namespaces | https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/ | `research/sources/k8s-namespaces.txt` |
| Secrets | https://kubernetes.io/docs/concepts/configuration/secret/ | `research/sources/k8s-secret.txt` |

## Pod Security Standards: the controls and their fields

The page lists each control under the profile Baseline or Restricted, with its "Restricted Fields" and "Allowed Values". The tool reports a control with the profile and the field path exactly as the page writes it; `{c}` stands for `containers` and for `initContainers`, which the page lists as separate paths.

| Control (as the page names it) | Profile | Fields |
| --- | --- | --- |
| Privileged Containers | Baseline | `spec.{c}[*].securityContext.privileged` |
| Host Namespaces | Baseline | `spec.hostNetwork`<br>`spec.hostPID`<br>`spec.hostIPC` |
| HostPath Volumes | Baseline | `spec.volumes[*].hostPath` |
| Host Ports | Baseline | `spec.{c}[*].ports[*].hostPort` |
| Capabilities | Baseline | `spec.{c}[*].securityContext.capabilities.add` |
| Seccomp | Baseline | `spec.securityContext.seccompProfile.type`<br>`spec.{c}[*].securityContext.seccompProfile.type` |
| Privilege Escalation (v1.8+) | Restricted | `spec.{c}[*].securityContext.allowPrivilegeEscalation` |
| Running as Non-root | Restricted | `spec.securityContext.runAsNonRoot`<br>`spec.{c}[*].securityContext.runAsNonRoot` |
| Running as Non-root user (v1.23+) | Restricted | `spec.securityContext.runAsUser`<br>`spec.{c}[*].securityContext.runAsUser` |
| Seccomp (v1.19+) | Restricted | `spec.securityContext.seccompProfile.type`<br>`spec.{c}[*].securityContext.seccompProfile.type` |
| Capabilities (v1.22+) | Restricted | `spec.{c}[*].securityContext.capabilities.drop` |
| Capabilities (v1.22+) | Restricted | `spec.{c}[*].securityContext.capabilities.add` |

The capabilities that the Baseline control Capabilities allows to be added: AUDIT_WRITE, CHOWN, DAC_OVERRIDE, FOWNER, FSETID, KILL, MKNOD, NET_BIND_SERVICE, SETFCAP, SETGID, SETPCAP, SETUID, SYS_CHROOT. The Restricted control allows only NET_BIND_SERVICE to be added back, after dropping ALL. The seccomp types that the Restricted control allows: RuntimeDefault, Localhost.

## Quoted sentences

### Pod Security Standards

https://kubernetes.io/docs/concepts/security/pod-security-standards/

| Key | Section | Sentence |
| --- | --- | --- |
| `pss-all-containers` | Baseline | If any of the listed containers fails to meet the requirements, the entire pod will fail validation. |
| `pss-privileged` | Baseline | Privileged Pods disable most security mechanisms and must be disallowed. |
| `pss-host-namespaces` | Baseline | Sharing the host namespaces must be disallowed. |
| `pss-host-path` | Baseline | HostPath volumes must be forbidden. |
| `pss-host-ports` | Baseline | HostPorts should be disallowed entirely (recommended) or restricted to a known list |
| `pss-capabilities-baseline` | Baseline | Adding additional capabilities beyond those listed below must be disallowed. |
| `pss-seccomp-baseline` | Baseline | Seccomp profile must not be explicitly set to Unconfined. |
| `pss-privilege-escalation` | Restricted | Privilege escalation (such as via set-user-ID or set-group-ID file mode) should not be allowed. |
| `pss-non-root` | Restricted | Containers must be required to run as non-root users. |
| `pss-non-root-pod-level` | Restricted | The container fields may be undefined/nil if the pod-level spec.securityContext.runAsNonRoot is set to true. |
| `pss-run-as-user` | Restricted | Containers must not set runAsUser to 0 |
| `pss-seccomp-restricted` | Restricted | Seccomp profile must be explicitly set to one of the allowed values. Both the Unconfined profile and the absence of a profile are prohibited. |
| `pss-seccomp-pod-level` | Restricted | The container fields may be undefined/nil if the pod-level spec.securityContext.seccompProfile.type field is set appropriately. |
| `pss-capabilities-restricted` | Restricted | Containers must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability. |

### Resource Management for Pods and Containers

https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

| Key | Section | Sentence |
| --- | --- | --- |
| `res-scheduler` | Resource Management for Pods and Containers | When you specify the resource request for containers in a Pod, the kube-scheduler uses this information to decide which node to place the Pod on. |
| `res-limit-enforced` | Resource Management for Pods and Containers | When you specify a resource limit for a container, the kubelet enforces those limits so that the running container is not allowed to use more of that resource than the limit you set. |
| `res-evicted` | How Kubernetes applies resource requests and limits | If a container exceeds its memory request and the node that it runs on becomes short of memory overall, it is likely that the Pod the container belongs to will be evicted. |
| `res-capacity` | How Pods with resource requests are scheduled | The scheduler ensures that, for each resource type, the sum of the resource requests of the scheduled containers is less than the capacity of the node. |
| `res-memory-oom` | Requests and limits | memory limits are enforced by the kernel with out of memory (OOM) kills. |
| `res-cpu-throttle` | Requests and limits | cpu limits are enforced by CPU throttling. |
| `res-limit-copied` | Requests and limits | If you specify a limit for a resource, but do not specify any request, and no admission-time mechanism has applied a default request for that resource, then Kubernetes copies the limit you specified and uses it as the requested value for the resource. |

### Liveness, Readiness, and Startup Probes

https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/

| Key | Section | Sentence |
| --- | --- | --- |
| `probe-readiness-defn` | Readiness probe | Readiness probes determine when a container is ready to accept traffic. |
| `probe-readiness-endpoints` | Readiness probe | If the readiness probe returns a failed state, the EndpointSlice controller removes the Pod's IP address from the EndpointSlices of all Services that match the Pod. |
| `probe-readiness-traffic` | When should you use a readiness probe? | To start sending traffic to a Pod only when a probe succeeds, specify a readiness probe. |
| `probe-liveness-no-wait` | Liveness probe | Liveness probes do not wait for readiness probes to succeed. |
| `probe-liveness-cascade` | Liveness probe | Incorrect implementation of liveness probes can lead to cascading failures. |
| `probe-liveness-difference` | Liveness probe | Understand the difference between liveness and readiness probes and when to apply them for your app. |

### Images

https://kubernetes.io/docs/concepts/containers/images/

| Key | Section | Sentence |
| --- | --- | --- |
| `img-default-latest` | Image names | If you don't specify a tag, Kubernetes assumes you mean the tag latest. |
| `img-digest-fixed` | Image names | Digests are a unique identifier for a specific version of an image. Digests are hashes of the image's content, and are immutable. Tags can be moved to point to different images, but digests are fixed. |
| `img-avoid-latest` | Image pull policy | You should avoid using the :latest tag when deploying containers in production as it is harder to track which version of the image is running and more difficult to roll back properly. |
| `img-meaningful-tag` | Image pull policy | Instead, specify a meaningful tag such as v1.42.0 and/or a digest. |
| `img-digest-pins` | Image pull policy | An image digest uniquely identifies a specific version of the image, so Kubernetes runs the same code every time it starts a container with that image name and digest specified. |
| `img-policy-latest` | Default image pull policy | if you omit the imagePullPolicy field, and the tag for the container image is :latest, imagePullPolicy is automatically set to Always. |
| `img-policy-no-tag` | Default image pull policy | if you omit the imagePullPolicy field, and you don't specify the tag for the container image, imagePullPolicy is automatically set to Always. |

### Disruptions

https://kubernetes.io/docs/concepts/workloads/pods/disruptions/

| Key | Section | Sentence |
| --- | --- | --- |
| `pdb-intro` | Pod disruption budgets | As an application owner, you can create a PodDisruptionBudget (PDB) for each application. A PDB limits the number of Pods of a replicated application that are down simultaneously from voluntary disruptions. |
| `pdb-replicate` | Dealing with disruptions | Replicate your application if you need higher availability. |

### Specifying a Disruption Budget for your Application

https://kubernetes.io/docs/tasks/run-application/configure-pdb/

| Key | Section | Sentence |
| --- | --- | --- |
| `pdb-selector` | Identify an Application to Protect | In this case, make a note of the controller's .spec.selector; the same selector goes into the PDBs .spec.selector. |
| `pdb-single-instance` | Think about how your application reacts to disruptions | Possible Solution 1: Do not use a PDB and tolerate occasional downtime. |

### Namespaces

https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/

| Key | Section | Sentence |
| --- | --- | --- |
| `ns-default` | When to Use Multiple Namespaces | For a production cluster, consider not using the default namespace. Instead, make other namespaces and use those. |

### Secrets

https://kubernetes.io/docs/concepts/configuration/secret/

| Key | Section | Sentence |
| --- | --- | --- |
| `secret-defn` | Secrets | A Secret is an object that contains a small amount of sensitive data such as a password, a token, or a key. Such information might otherwise be put in a Pod specification or in a container image. |
| `secret-exposure` | Secrets | Because Secrets can be created independently of the Pods that use them, there is less risk of the Secret (and its data) being exposed during the workflow of creating, viewing, and editing Pods. |
| `secret-env` | Using Secrets as environment variables | For each container in your Pod specification, add an environment variable for each Secret key that you want to use to the env[].valueFrom.secretKeyRef field. |

## Sentences about versions

These are quoted in [limits.md](limits.md). The tool decides nothing from a version.

| Page | Section | Sentence |
| --- | --- | --- |
| Pod Security Standards | Restricted | This is Linux only policy in v1.25+ (spec.os.name != windows) |
| Pod Security Standards | Restricted | Privilege Escalation (v1.8+) |
| Pod Security Standards | Restricted | Running as Non-root user (v1.23+) |
| Pod Security Standards | Restricted | Seccomp (v1.19+) |
| Pod Security Standards | Restricted | Capabilities (v1.22+) |
| Pod Security Standards | Baseline | container_engine_t (since Kubernetes 1.31) |
| Pod Security Standards | Baseline | Known list (not supported by the built-in Pod Security Admission controller) |
| Resource Management for Pods and Containers | Pod-level resource specification | Provided your cluster has the PodLevelResources feature gate enabled, you can specify resource requests and limits at the Pod level. |
| Specifying a Disruption Budget for your Application | Identify an Application to Protect | From version 1.15 PDBs support custom controllers where the scale subresource is enabled. |

## Checks and the sentences they quote

| Check | Severity | Profile | Sentences (keys above) | Added when the file shows it |
| --- | --- | --- | --- | --- |
| `file-not-read` | error | - | none: about the file itself | - |
| `yaml-not-read` | error | - | none: about the file itself | - |
| `limit-reached` | error | - | none: about the file itself | - |
| `pss-privileged` | error | Baseline | `pss-privileged`, `pss-all-containers` | - |
| `pss-host-namespaces` | error | Baseline | `pss-host-namespaces` | - |
| `pss-host-path` | error | Baseline | `pss-host-path` | - |
| `pss-host-port` | error | Baseline | `pss-host-ports` | - |
| `pss-capabilities-add` | error | Baseline | `pss-capabilities-baseline` | - |
| `pss-seccomp-unconfined` | error | Baseline | `pss-seccomp-baseline` | - |
| `pss-privilege-escalation` | warning | Restricted | `pss-privilege-escalation` | - |
| `pss-run-as-non-root` | warning | Restricted | `pss-non-root`, `pss-non-root-pod-level` | - |
| `pss-run-as-user-root` | warning | Restricted | `pss-run-as-user` | - |
| `pss-seccomp-missing` | warning | Restricted | `pss-seccomp-restricted`, `pss-seccomp-pod-level` | - |
| `pss-capabilities-drop-all` | warning | Restricted | `pss-capabilities-restricted` | - |
| `pss-capabilities-add-restricted` | warning | Restricted | `pss-capabilities-restricted` | - |
| `resources-requests-missing` | warning | - | `res-scheduler`, `res-capacity`, `res-evicted` | `res-limit-copied` |
| `resources-limits-missing` | warning | - | `res-limit-enforced`, `res-memory-oom`, `res-cpu-throttle` | - |
| `readiness-probe-missing` | warning | - | `probe-readiness-defn`, `probe-readiness-traffic`, `probe-readiness-endpoints` | `probe-liveness-no-wait` |
| `image-tag-latest` | warning | - | `img-avoid-latest`, `img-meaningful-tag`, `img-policy-latest` | `img-digest-pins` |
| `image-tag-missing` | warning | - | `img-default-latest`, `img-avoid-latest`, `img-policy-no-tag`, `img-meaningful-tag` | `img-digest-fixed` |
| `env-secret-plain` | warning | - | `secret-defn`, `secret-exposure`, `secret-env` | - |
| `liveness-without-readiness` | info | - | `probe-liveness-no-wait`, `probe-liveness-cascade`, `probe-liveness-difference`, `probe-readiness-traffic` | - |
| `replicas-one-no-pdb` | info | - | `pdb-intro`, `pdb-replicate`, `pdb-single-instance` | `pdb-selector` |
| `namespace-missing` | info | - | `ns-default` | - |
| `namespace-default` | info | - | `ns-default` | - |
| `value-not-read` | info | - | none: about the file itself | - |
