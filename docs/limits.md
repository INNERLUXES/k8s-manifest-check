# Limits

## What a static reading can know

- **It sees text, not a cluster.** The tool does not know which Kubernetes version a cluster runs, which admission controllers and policies are on, which defaults a LimitRange or a mutating webhook adds, which namespace a pipeline applies the files to, or what the images do. A finding says what the files show. A pass is not a hardened cluster: it means that the files hold none of the settings below, and the cluster can still change them.
- **A finding is a review item, not proof.** Several findings rest on a conclusion that the pages do not state, and the message says so. A missing request can be filled by a LimitRange, a missing namespace by `kubectl apply -n`, a container that runs as root by an image that sets a user, and a missing probe by a mesh or a controller outside the files.
- **Pod Security Admission is not the tool.** The Pod Security Standards say what a policy forbids. How a cluster enforces them (the namespace labels, the mode, the exemptions) is outside the files, and the tool does not read it. The page says that its own list of host ports is not supported by the built-in admission controller, so the tool reports every non-zero `hostPort`.
- **Severity of the Pod Security Standards controls is the tool's own.** A Baseline control is an error, a Restricted control a warning; the page gives the controls, not a severity.

## What the Pod Security Standards checks leave out

The page lists more controls than the tool reads. These are not checked: the HostProcess flag of Windows Pods, the host fields of probes and lifecycle hooks, AppArmor, SELinux, the `/proc` mount type, unsafe sysctls, and the volume types that the Restricted profile permits (the tool reports `hostPath`, and does not report a volume type that the Restricted list leaves out). `ephemeralContainers` are not part of a manifest that is applied. A control that is not on the list of checks is not a pass.

## What depends on the version

Some of what the Pod Security Standards page says is tied to a Kubernetes version. The tool reads the manifest and decides nothing from a version, and it quotes the page's own words:

- Four Restricted controls carry a version in their title on the page: "Privilege Escalation (v1.8+)", "Running as Non-root user (v1.23+)", "Seccomp (v1.19+)" and "Capabilities (v1.22+)". The page does not say what a cluster that is older than that version does with the control, and the tool does not know the version of a cluster, so it reports the control.
- The page says of the privilege escalation, seccomp and capabilities controls: "This is Linux only policy in v1.25+ (spec.os.name != windows)". The tool skips these Restricted controls for a Pod that sets `spec.os.name` to `windows`, and a note says so. For a Pod that sets no `os`, the controls are applied.
- The page says of one allowed SELinux type: "container_engine_t (since Kubernetes 1.31)". SELinux is not checked.
- The page says of host ports: "Known list (not supported by the built-in Pod Security Admission controller)".
- The resource page says: "Provided your cluster has the PodLevelResources feature gate enabled, you can specify resource requests and limits at the Pod level." The tool does not compare containers with Pod-level resources and reports a note instead.
- The page on disruption budgets says: "From version 1.15 PDBs support custom controllers where the scale subresource is enabled." The tool matches a budget with a Deployment by namespace and labels only.

## What the YAML reading cannot see

- **Only the plain forms.** Anchors, aliases, tags and merge keys are refused, so a manifest that uses them is not read at all (see [method.md](method.md) for why). Kustomize overlays, Helm templates and generated files must be rendered to plain YAML first.
- **Booleans and numbers.** `true` and `false` are read, and whole numbers in decimal. Words that older YAML readers take as booleans (`yes`, `on`) and numbers written in other ways are `value-not-read`. The quoted string `"0"` is a string, not the number 0.
- **Folded block scalars** are approximated: the value is not printed or judged by any check, so the approximation never changes a finding.
- **Whole-document view.** The checks look at one document at a time. They do not follow `ownerReferences`, a Service selector, or a Helm values file.

## What the tool does not check

- Services and Ingresses: no check needs them in this version, so they are counted and not read. Network policies, RBAC, ServiceAccounts, Pod priority, topology spread, anti-affinity and `terminationGracePeriodSeconds` are not read.
- The content of images, and whether a tag or digest exists in a registry. A digest is accepted when it has an algorithm name and 32 or more hexadecimal characters; whether it is the digest of a real image is not checked.
- ConfigMaps and the data of Secrets. A Secret document is never opened. A secret in a ConfigMap, or in a variable whose name the rule does not know, is not seen.
- Cluster-wide settings, and objects that are not in the files.

## Size and depth

- The limits of [inputs.md](inputs.md) apply, and a limit is reported, not skipped.
- The YAML reader stops at a nesting of 64 levels, at 200,000 nodes in a document, at 500 documents in a file and at a scalar of 262,144 characters, with a finding that names the line.
- The reader reads each line a bounded number of times and each character of a scalar once, so the time is linear in the size of the input.
