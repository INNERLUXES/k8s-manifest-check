# k8s-manifest-check

Reads a folder of Kubernetes manifest files and reports the settings that make a workload unsafe or unreliable in production. You give it the folder (or one file). It reads every `.yaml` and `.yml` file, with several documents per file if you like, and for every problem it names the file and the line of the offending key, the workload and the container, the severity, a sentence on how to fix it, and the sentence of the official Kubernetes documentation that the finding rests on, with the address of the page.

A manifest fails in quiet ways. A container with `privileged: true` passes `kubectl apply` and a quick review, and the Pod Security Standards say that "Privileged Pods disable most security mechanisms". A Deployment without a readiness probe has no way to say that it is not ready for traffic yet. A container with no limit is not held to one: "the kubelet enforces those limits" only when they are set. An image on `:latest` is "harder to track which version of the image is running and more difficult to roll back properly". A password written as a plain `value:` in the Pod spec is the case that the Secrets page describes: such information "might otherwise be put in a Pod specification". All of these are visible in the files, before they reach a cluster. This tool reads them in a second, so the check can run on every pull request that touches the manifests.

- Every finding has an id, a severity (error, warning or info), the file and the line, the kind and name of the workload, the container, a plain message, a fix and the quoted sentences of the documentation with the page address.
- The Pod Security Standards findings say the profile that the standard puts the control under (Baseline or Restricted) and the field path exactly as the page lists it, for example `spec.containers[*].securityContext.privileged`.
- The quotes are quotes. The pages of the Kubernetes documentation are saved in [research/sources](research/sources), and a test compares every quoted sentence in [src/data.js](src/data.js), and every field path and list of names, with the saved text. Where a finding draws a conclusion that no page states, the message says that it is the tool's own.
- Nothing is skipped without a word. A file that could not be read, a document that the YAML reader refused, a limit that was reached and a value that is not in a form the tool reads are findings, never a pass.
- It reads files only. It never talks to a cluster, never fetches an address, never runs a program and opens no connection. It never prints the value of an environment variable, a command or a Secret.
- It has its own strict YAML reader for the subset that manifests use. Anchors, aliases, tags and merge keys are refused with a clear message, so no file can expand into gigabytes, and nesting, nodes, documents and scalars are bounded. See [docs/method.md](docs/method.md).
- It does not repeat its neighbours: it does not read mobile app settings, HTTP headers or lock files, see [Related](#related).
- Reports as text, Markdown, JSON and CSV, with an exit code for a pipeline gate. Info findings never fail the run.
- Plain JavaScript, no dependencies; the same files always give the same report.

```
npm test
```

```
ℹ tests 139
ℹ pass 138
ℹ fail 0
ℹ skipped 1
```

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/k8s-manifest-check.git
cd k8s-manifest-check
node bin/k8s-manifest-check.js examples/shop-api
```

Or without a clone, on the folder that holds your manifests:

```
npx --yes github:INNERLUXES/k8s-manifest-check deploy/
```

`examples/` holds the manifests of a made-up shop API. `examples/shop-api` has several problems, wrong on purpose: a Deployment on the host network with a privileged container, a host port, an added `SYS_ADMIN` capability, an image on `:latest`, a second container with no tag, a password written as a plain value, no requests, limits or readiness probe, one replica and no disruption budget, a worker that mounts a path of the node and runs as root, and a CronJob on `:latest`. `examples/shop-api-fixed` is the same application done properly, and passes the strictest gate.

## Usage

```
node bin/k8s-manifest-check.js examples/shop-api
```

```
k8s-manifest-check: examples/shop-api
read: 2 files, 4 documents, 3 workloads
findings: 5 error, 17 warning, 2 info

INFO     namespace-missing  api.yaml:4
         about: Deployment shop-api
         at: metadata.namespace
         The manifest sets no namespace, so the object goes to the namespace of the current context, which is often default.
         fix: Set metadata.namespace, or apply the files with a namespace on the command line and keep that in the pipeline.
         source (Namespaces, When to Use Multiple Namespaces): "For a production cluster, consider not using the default namespace. Instead, make other namespaces and use those."
           https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/

INFO     replicas-one-no-pdb  api.yaml:9
         about: Deployment shop-api
         at: spec.replicas
         The Deployment runs one replica, and no PodDisruptionBudget in the files selects its Pods. A voluntary disruption, such as draining a node, takes the only Pod down.
         fix: Run two or more replicas and add a PodDisruptionBudget, or accept the downtime on purpose.
         source (Disruptions, Pod disruption budgets): "As an application owner, you can create a PodDisruptionBudget (PDB) for each application. A PDB limits the number of Pods of a replicated application that are down simultaneously from voluntary disruptions."
           https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
         source (Disruptions, Dealing with disruptions): "Replicate your application if you need higher availability."
           https://kubernetes.io/docs/concepts/workloads/pods/disruptions/
         source (Specifying a Disruption Budget for your Application, Think about how your application reacts to disruptions): "Possible Solution 1: Do not use a PDB and tolerate occasional downtime."
           https://kubernetes.io/docs/tasks/run-application/configure-pdb/
         source (Specifying a Disruption Budget for your Application, Identify an Application to Protect): "In this case, make a note of the controller's .spec.selector; the same selector goes into the PDBs .spec.selector."
           https://kubernetes.io/docs/tasks/run-application/configure-pdb/

ERROR    pss-host-namespaces  api.yaml:18
         about: Deployment shop-api
         profile: Baseline, page field spec.hostNetwork
         at: spec.template.spec.hostNetwork
         hostNetwork is true, so the Pod shares the host's namespace. The Baseline profile of the Pod Security Standards disallows it.
         fix: Remove hostNetwork, or set it to false.
         source (Pod Security Standards, Baseline): "Sharing the host namespaces must be disallowed."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  resources-requests-missing  api.yaml:20
         about: Deployment shop-api, container api
         at: spec.template.spec.containers[0].resources.requests
         The container has no resource request for cpu and memory. The scheduler cannot place it by what it needs, and the node can evict it first when memory runs short.
         fix: Set resources.requests.cpu and resources.requests.memory to what the container uses in normal work.
         source (Resource Management for Pods and Containers): "When you specify the resource request for containers in a Pod, the kube-scheduler uses this information to decide which node to place the Pod on."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         source (Resource Management for Pods and Containers, How Pods with resource requests are scheduled): "The scheduler ensures that, for each resource type, the sum of the resource requests of the scheduled containers is less than the capacity of the node."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         source (Resource Management for Pods and Containers, How Kubernetes applies resource requests and limits): "If a container exceeds its memory request and the node that it runs on becomes short of memory overall, it is likely that the Pod the container belongs to will be evicted."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

WARNING  resources-limits-missing  api.yaml:20
         about: Deployment shop-api, container api
         at: spec.template.spec.containers[0].resources.limits
         The container has no resource limit for cpu and memory, so nothing stops it from using more of it than it asked for.
         fix: Set resources.limits.memory (and resources.limits.cpu if you want a ceiling on CPU).
         source (Resource Management for Pods and Containers): "When you specify a resource limit for a container, the kubelet enforces those limits so that the running container is not allowed to use more of that resource than the limit you set."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         source (Resource Management for Pods and Containers, Requests and limits): "memory limits are enforced by the kernel with out of memory (OOM) kills."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         source (Resource Management for Pods and Containers, Requests and limits): "cpu limits are enforced by CPU throttling."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

WARNING  readiness-probe-missing  api.yaml:20
         about: Deployment shop-api, container api
         at: spec.template.spec.containers[0].readinessProbe
         The container has no readinessProbe (it has a livenessProbe, which does not wait for readiness), so the Pod receives traffic as soon as it starts, before the application can answer.
         fix: Add a readinessProbe (httpGet, tcpSocket, grpc or exec) that succeeds only when the application can answer.
         source (Liveness, Readiness, and Startup Probes, Readiness probe): "Readiness probes determine when a container is ready to accept traffic."
           https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
         source (Liveness, Readiness, and Startup Probes, When should you use a readiness probe?): "To start sending traffic to a Pod only when a probe succeeds, specify a readiness probe."
           https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
         source (Liveness, Readiness, and Startup Probes, Readiness probe): "If the readiness probe returns a failed state, the EndpointSlice controller removes the Pod's IP address from the EndpointSlices of all Services that match the Pod."
           https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/
         source (Liveness, Readiness, and Startup Probes, Liveness probe): "Liveness probes do not wait for readiness probes to succeed."
           https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/

WARNING  image-tag-latest  api.yaml:21
         about: Deployment shop-api, container api
         at: spec.template.spec.containers[0].image
         The image registry.example/shop/api:latest uses the tag latest. Kubernetes cannot tell which version of the image is running, and a rollback does not return to the version before.
         fix: Use a tag that names a version, or the digest of the image (name@sha256:...).
         source (Images, Image pull policy): "You should avoid using the :latest tag when deploying containers in production as it is harder to track which version of the image is running and more difficult to roll back properly."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image pull policy): "Instead, specify a meaningful tag such as v1.42.0 and/or a digest."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Default image pull policy): "if you omit the imagePullPolicy field, and the tag for the container image is :latest, imagePullPolicy is automatically set to Always."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image pull policy): "An image digest uniquely identifies a specific version of the image, so Kubernetes runs the same code every time it starts a container with that image name and digest specified."
           https://kubernetes.io/docs/concepts/containers/images/

ERROR    pss-host-port  api.yaml:24
         about: Deployment shop-api, container api
         profile: Baseline, page field spec.containers[*].ports[*].hostPort
         at: spec.template.spec.containers[0].ports[0].hostPort
         The container binds the port of the node 8080 with hostPort. The Baseline profile of the Pod Security Standards says host ports should be disallowed entirely, or restricted to a known list.
         fix: Remove hostPort and reach the container through a Service.
         source (Pod Security Standards, Baseline): "HostPorts should be disallowed entirely (recommended) or restricted to a known list"
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  env-secret-plain  api.yaml:27
         about: Deployment shop-api, container api
         at: spec.template.spec.containers[0].env[0].value
         The environment variable DATABASE_PASSWORD is written in the manifest with a plain value, and its name says it holds a secret. The value is not shown here.
         fix: Keep the value in a Secret and read it with valueFrom.secretKeyRef.
         source (Secrets): "A Secret is an object that contains a small amount of sensitive data such as a password, a token, or a key. Such information might otherwise be put in a Pod specification or in a container image."
           https://kubernetes.io/docs/concepts/configuration/secret/
         source (Secrets): "Because Secrets can be created independently of the Pods that use them, there is less risk of the Secret (and its data) being exposed during the workflow of creating, viewing, and editing Pods."
           https://kubernetes.io/docs/concepts/configuration/secret/
         source (Secrets, Using Secrets as environment variables): "For each container in your Pod specification, add an environment variable for each Secret key that you want to use to the env[].valueFrom.secretKeyRef field."
           https://kubernetes.io/docs/concepts/configuration/secret/

WARNING  pss-privilege-escalation  api.yaml:30
         about: Deployment shop-api, container api
         profile: Restricted, page field spec.containers[*].securityContext.allowPrivilegeEscalation
         at: spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation
         allowPrivilegeEscalation is not set to false. The Restricted profile of the Pod Security Standards allows only false.
         fix: Set securityContext.allowPrivilegeEscalation to false.
         source (Pod Security Standards, Restricted): "Privilege escalation (such as via set-user-ID or set-group-ID file mode) should not be allowed."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-run-as-non-root  api.yaml:30
         about: Deployment shop-api, container api
         profile: Restricted, page field spec.containers[*].securityContext.runAsNonRoot
         at: spec.template.spec.containers[0].securityContext.runAsNonRoot
         runAsNonRoot is not set to true, on the container or on the Pod. The Restricted profile of the Pod Security Standards requires containers to run as non-root users.
         fix: Set securityContext.runAsNonRoot to true, on the container or on the Pod, and make sure the image runs as a user other than root.
         source (Pod Security Standards, Restricted): "Containers must be required to run as non-root users."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/
         source (Pod Security Standards, Restricted): "The container fields may be undefined/nil if the pod-level spec.securityContext.runAsNonRoot is set to true."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-seccomp-missing  api.yaml:30
         about: Deployment shop-api, container api
         profile: Restricted, page field spec.containers[*].securityContext.seccompProfile.type
         at: spec.template.spec.containers[0].securityContext.seccompProfile.type
         No seccomp profile is set, on the container or on the Pod. The Restricted profile of the Pod Security Standards says that the absence of a profile is prohibited.
         fix: Set securityContext.seccompProfile.type to RuntimeDefault (or Localhost).
         source (Pod Security Standards, Restricted): "Seccomp profile must be explicitly set to one of the allowed values. Both the Unconfined profile and the absence of a profile are prohibited."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/
         source (Pod Security Standards, Restricted): "The container fields may be undefined/nil if the pod-level spec.securityContext.seccompProfile.type field is set appropriately."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

ERROR    pss-privileged  api.yaml:31
         about: Deployment shop-api, container api
         profile: Baseline, page field spec.containers[*].securityContext.privileged
         at: spec.template.spec.containers[0].securityContext.privileged
         The container runs privileged. The Baseline profile of the Pod Security Standards disallows it.
         fix: Remove privileged, or set it to false, and add only the capabilities the container needs.
         source (Pod Security Standards, Baseline): "Privileged Pods disable most security mechanisms and must be disallowed."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/
         source (Pod Security Standards, Baseline): "If any of the listed containers fails to meet the requirements, the entire pod will fail validation."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-capabilities-drop-all  api.yaml:32
         about: Deployment shop-api, container api
         profile: Restricted, page field spec.containers[*].securityContext.capabilities.drop
         at: spec.template.spec.containers[0].securityContext.capabilities.drop
         The container does not drop ALL capabilities. The Restricted profile of the Pod Security Standards says containers must drop ALL capabilities.
         fix: Set securityContext.capabilities.drop to [ALL], and add back only what the container needs.
         source (Pod Security Standards, Restricted): "Containers must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

ERROR    pss-capabilities-add  api.yaml:33
         about: Deployment shop-api, container api
         profile: Baseline, page field spec.containers[*].securityContext.capabilities.add
         at: spec.template.spec.containers[0].securityContext.capabilities.add
         The container adds SYS_ADMIN, which the Baseline profile of the Pod Security Standards does not list among the capabilities that may be added.
         fix: Remove these capabilities, or run the workload in a namespace that enforces the Privileged profile on purpose.
         source (Pod Security Standards, Baseline): "Adding additional capabilities beyond those listed below must be disallowed."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  image-tag-missing  api.yaml:39
         about: Deployment shop-api, container log-shipper
         at: spec.template.spec.containers[1].image
         The image registry.example/shop/log-shipper has no tag and no digest, so Kubernetes uses the tag latest.
         fix: Use a tag that names a version, or the digest of the image (name@sha256:...).
         source (Images, Image names): "If you don't specify a tag, Kubernetes assumes you mean the tag latest."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image pull policy): "You should avoid using the :latest tag when deploying containers in production as it is harder to track which version of the image is running and more difficult to roll back properly."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Default image pull policy): "if you omit the imagePullPolicy field, and you don't specify the tag for the container image, imagePullPolicy is automatically set to Always."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image pull policy): "Instead, specify a meaningful tag such as v1.42.0 and/or a digest."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image names): "Digests are a unique identifier for a specific version of an image. Digests are hashes of the image's content, and are immutable. Tags can be moved to point to different images, but digests are fixed."
           https://kubernetes.io/docs/concepts/containers/images/

WARNING  pss-run-as-user-root  worker.yaml:17
         about: Deployment shop-worker
         profile: Restricted, page field spec.securityContext.runAsUser
         at: spec.template.spec.securityContext.runAsUser
         runAsUser of the Pod is 0, which is root. The Restricted profile of the Pod Security Standards does not allow it.
         fix: Set runAsUser to a user id above 0.
         source (Pod Security Standards, Restricted): "Containers must not set runAsUser to 0"
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

ERROR    pss-host-path  worker.yaml:20
         about: Deployment shop-worker
         profile: Baseline, page field spec.volumes[*].hostPath
         at: spec.template.spec.volumes[0].hostPath
         The volume spool is a hostPath volume, which mounts a path of the node into the Pod. The Baseline profile of the Pod Security Standards forbids it.
         fix: Use a persistentVolumeClaim, a configMap, a secret or an emptyDir instead of a path of the node.
         source (Pod Security Standards, Baseline): "HostPath volumes must be forbidden."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-privilege-escalation  worker.yaml:23
         about: Deployment shop-worker, container worker
         profile: Restricted, page field spec.containers[*].securityContext.allowPrivilegeEscalation
         at: spec.template.spec.containers[0].securityContext.allowPrivilegeEscalation
         allowPrivilegeEscalation is not set to false. The Restricted profile of the Pod Security Standards allows only false.
         fix: Set securityContext.allowPrivilegeEscalation to false.
         source (Pod Security Standards, Restricted): "Privilege escalation (such as via set-user-ID or set-group-ID file mode) should not be allowed."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-run-as-non-root  worker.yaml:23
         about: Deployment shop-worker, container worker
         profile: Restricted, page field spec.containers[*].securityContext.runAsNonRoot
         at: spec.template.spec.containers[0].securityContext.runAsNonRoot
         runAsNonRoot is not set to true, on the container or on the Pod. The Restricted profile of the Pod Security Standards requires containers to run as non-root users.
         fix: Set securityContext.runAsNonRoot to true, on the container or on the Pod, and make sure the image runs as a user other than root.
         source (Pod Security Standards, Restricted): "Containers must be required to run as non-root users."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/
         source (Pod Security Standards, Restricted): "The container fields may be undefined/nil if the pod-level spec.securityContext.runAsNonRoot is set to true."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-seccomp-missing  worker.yaml:23
         about: Deployment shop-worker, container worker
         profile: Restricted, page field spec.containers[*].securityContext.seccompProfile.type
         at: spec.template.spec.containers[0].securityContext.seccompProfile.type
         No seccomp profile is set, on the container or on the Pod. The Restricted profile of the Pod Security Standards says that the absence of a profile is prohibited.
         fix: Set securityContext.seccompProfile.type to RuntimeDefault (or Localhost).
         source (Pod Security Standards, Restricted): "Seccomp profile must be explicitly set to one of the allowed values. Both the Unconfined profile and the absence of a profile are prohibited."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/
         source (Pod Security Standards, Restricted): "The container fields may be undefined/nil if the pod-level spec.securityContext.seccompProfile.type field is set appropriately."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  pss-capabilities-drop-all  worker.yaml:23
         about: Deployment shop-worker, container worker
         profile: Restricted, page field spec.containers[*].securityContext.capabilities.drop
         at: spec.template.spec.containers[0].securityContext.capabilities.drop
         The container does not drop ALL capabilities. The Restricted profile of the Pod Security Standards says containers must drop ALL capabilities.
         fix: Set securityContext.capabilities.drop to [ALL], and add back only what the container needs.
         source (Pod Security Standards, Restricted): "Containers must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability."
           https://kubernetes.io/docs/concepts/security/pod-security-standards/

WARNING  resources-limits-missing  worker.yaml:25
         about: Deployment shop-worker, container worker
         at: spec.template.spec.containers[0].resources.limits
         The container has no resource limit for cpu and memory, so nothing stops it from using more of it than it asked for.
         fix: Set resources.limits.memory (and resources.limits.cpu if you want a ceiling on CPU).
         source (Resource Management for Pods and Containers): "When you specify a resource limit for a container, the kubelet enforces those limits so that the running container is not allowed to use more of that resource than the limit you set."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         source (Resource Management for Pods and Containers, Requests and limits): "memory limits are enforced by the kernel with out of memory (OOM) kills."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
         source (Resource Management for Pods and Containers, Requests and limits): "cpu limits are enforced by CPU throttling."
           https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

WARNING  image-tag-latest  worker.yaml:50
         about: CronJob nightly-report, container report
         at: spec.jobTemplate.spec.template.spec.containers[0].image
         The image registry.example/shop/report:latest uses the tag latest. Kubernetes cannot tell which version of the image is running, and a rollback does not return to the version before.
         fix: Use a tag that names a version, or the digest of the image (name@sha256:...).
         source (Images, Image pull policy): "You should avoid using the :latest tag when deploying containers in production as it is harder to track which version of the image is running and more difficult to roll back properly."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image pull policy): "Instead, specify a meaningful tag such as v1.42.0 and/or a digest."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Default image pull policy): "if you omit the imagePullPolicy field, and the tag for the container image is :latest, imagePullPolicy is automatically set to Always."
           https://kubernetes.io/docs/concepts/containers/images/
         source (Images, Image pull policy): "An image digest uniquely identifies a specific version of the image, so Kubernetes runs the same code every time it starts a container with that image name and digest specified."
           https://kubernetes.io/docs/concepts/containers/images/

note: Documents of other kinds are counted and not checked: Service (1).

GATE: FAIL - 5 errors
```

The same files, fixed, with the strictest gate:

```
node bin/k8s-manifest-check.js examples/shop-api-fixed --fail-on warning
```

```
k8s-manifest-check: examples/shop-api-fixed
read: 2 files, 6 documents, 3 workloads
findings: 0 error, 0 warning, 0 info

no findings

note: Documents of other kinds are counted and not checked: Service (1).

GATE: PASS (--fail-on warning)
```

`npm run example` runs both, checks that they report what is shown here, and writes the report of the failing manifests in every format to [examples/output](examples/output).

## What is checked

Kinds: `Pod`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job` and `CronJob`, at their own Pod template paths, and the containers and init containers in them. A `List` is opened. A `PodDisruptionBudget` is read for one check. Other kinds are counted and not checked; a `Secret` is never opened.

| Check | Severity | What it reports |
| --- | --- | --- |
| `file-not-read` | error | a file that is not UTF-8 text, is over the size limit, is not a regular file or is a link that leads outside the folder |
| `yaml-not-read` | error | a document that the YAML reader refused: an anchor, an alias, a tag, a merge key, a duplicate key, a tab, or a mistake in the file |
| `limit-reached` | error | a limit was reached (files, folders, size, documents) and the rest was not read |
| `pss-privileged` | error | `privileged: true` (Baseline: Privileged Containers) |
| `pss-host-namespaces` | error | `hostNetwork`, `hostPID` or `hostIPC` true (Baseline: Host Namespaces) |
| `pss-host-path` | error | a `hostPath` volume (Baseline: HostPath Volumes) |
| `pss-host-port` | error | a `hostPort` other than 0 (Baseline: Host Ports) |
| `pss-capabilities-add` | error | a capability added that the Baseline list does not allow (Baseline: Capabilities) |
| `pss-seccomp-unconfined` | error | a seccomp profile of `Unconfined` (Baseline: Seccomp) |
| `pss-privilege-escalation` | warning | `allowPrivilegeEscalation` not false (Restricted: Privilege Escalation) |
| `pss-run-as-non-root` | warning | `runAsNonRoot` not true on the container or the Pod (Restricted: Running as Non-root) |
| `pss-run-as-user-root` | warning | `runAsUser: 0` (Restricted: Running as Non-root user) |
| `pss-seccomp-missing` | warning | no seccomp profile of `RuntimeDefault` or `Localhost` (Restricted: Seccomp) |
| `pss-capabilities-drop-all` | warning | capabilities not dropped with `ALL` (Restricted: Capabilities) |
| `pss-capabilities-add-restricted` | warning | a capability added back other than `NET_BIND_SERVICE` (Restricted: Capabilities) |
| `resources-requests-missing` | warning | no request for cpu or memory |
| `resources-limits-missing` | warning | no limit for cpu or memory |
| `readiness-probe-missing` | warning | a container of a Deployment or StatefulSet without a `readinessProbe` |
| `image-tag-latest` | warning | an image on the tag `latest` |
| `image-tag-missing` | warning | an image with no tag and no digest |
| `env-secret-plain` | warning | a variable named like a secret with a plain `value`; the value is never printed |
| `liveness-without-readiness` | info | a `livenessProbe` and no `readinessProbe` on a Pod, ReplicaSet or DaemonSet |
| `replicas-one-no-pdb` | info | a Deployment with one replica and no PodDisruptionBudget that selects it |
| `namespace-missing` | info | no `metadata.namespace` |
| `namespace-default` | info | `metadata.namespace: default` |
| `value-not-read` | info | a value that is not written as `true`, `false` or a whole number where a check needs one |

[docs/method.md](docs/method.md) gives each check, its exact rule, what it can see and what it cannot. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence and field path with the saved page it comes from.

## Pod Security Standards

The Pod Security Standards page lists its controls under the profiles Baseline and Restricted, and says that the Restricted policy includes the Baseline one. The page gives the controls and no severity, so the severity is the tool's own: a Baseline control is an error, a Restricted control is a warning. Each finding says the profile and the page's field path, and the path in your manifest. The tool checks the controls listed in [docs/rules-and-sources.md](docs/rules-and-sources.md); [docs/limits.md](docs/limits.md) names the controls it leaves out and the places where the page ties a control to a Kubernetes version, in the page's own words.

## Where the facts come from

| Fact | Source |
| --- | --- |
| The Baseline and Restricted controls, their field paths and allowed values | https://kubernetes.io/docs/concepts/security/pod-security-standards/ |
| Requests and limits, scheduling and eviction | https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ |
| Readiness and liveness probes | https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/ |
| Image names, tags, digests and the pull policy | https://kubernetes.io/docs/concepts/containers/images/ |
| Disruption budgets | https://kubernetes.io/docs/concepts/workloads/pods/disruptions/ and https://kubernetes.io/docs/tasks/run-application/configure-pdb/ |
| Namespaces | https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/ |
| Secrets and environment variables | https://kubernetes.io/docs/concepts/configuration/secret/ |

## Formats

- `text`: for a terminal: the files read, the counts, then each finding with its file and line, who it is about, the profile and field for a Pod Security Standards control, message, fix and the quoted sentences with their addresses.
- `markdown`: the same as a table for a pull request comment or the job summary. Pipes, line breaks and angle brackets from the input are escaped, so a name from a file cannot break the table.
- `json`: the whole report: the files read, the counts, every finding with id, severity, file, line, kind, name, container, profile, field, path in the manifest, message, fix and source sentences, the notes and the gate.
- `csv`: one row per finding, quoted as RFC 4180 says. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet does not run it as a formula.

To put the report in the job summary of a GitHub Actions run:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Manifest report
    run: npx --yes github:INNERLUXES/k8s-manifest-check deploy/ --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: Manifest gate
    run: npx --yes github:INNERLUXES/k8s-manifest-check deploy/ --fail-on warning
```

It needs no cluster, no kubeconfig, no secrets and no network access of its own; a Linux runner is enough, and it runs on the files in the repository, or on the output of `helm template` or `kustomize build` written to a folder. Start with the default gate (errors only), and move to `--fail-on warning` when the first report is clean.

## Options and exit codes

`k8s-manifest-check <folder-or-file> [--format <name>] [--fail-on <level>]`. `--format <name>` is `text` (the default), `markdown`, `json` or `csv`. `--fail-on <level>` is `error` (the default) or `warning`; info never fails the run. `--help` and `--version` print and exit with `0`.

`0` no finding at the `--fail-on` level, `1` at least one such finding (by default: an error), `2` a usage or input error (a missing path, a folder with no `.yaml` or `.yml` file, an unknown option, a URL in place of a path).

A file that cannot be read is not exit code `2`: it is a finding (`file-not-read`, `yaml-not-read`), so the run still checks everything else.

## Limits

The tool reads what the files say, not what a cluster does. It does not see admission policies, a LimitRange, the namespace a pipeline applies the files to, a Helm values file, or what the images do, and it reads only plain YAML: a manifest with anchors, aliases, tags or merge keys, or a Helm template, is reported as not read. A finding says what the files show. A pass is not a hardened cluster. [docs/limits.md](docs/limits.md) lists the rest, and [docs/threat-model.md](docs/threat-model.md) and [docs/secure-defaults.md](docs/secure-defaults.md) say how the tool treats a hostile folder.

## Related

The tool covers Kubernetes manifests. It does not repeat its neighbours in the same organization: `app-manifest-check` reads the settings files of a native mobile app (`AndroidManifest.xml`, `Info.plist`), `security-headers-check` reads the security headers of saved HTTP responses, and `lockfile-check` reads npm lock files. This tool reads the YAML of workloads, which none of them reads.

## Background

- How cloud native systems are designed, built, deployed and run on Kubernetes, with checks like this one in the pipeline: [cloud native application development services](https://innerluxes.dev/software-development/cloud-native-development).

## License

MIT
