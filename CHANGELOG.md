# Changes

## 1.0.1

- Tests: the check that a Windows-style path with a backslash gives a report path with forward slashes now runs only on Windows. On Linux and macOS a backslash is an ordinary character in a file name, so that folder does not exist there. The tool itself is unchanged.

## 1.0.0

First release.

- Reads a folder of Kubernetes manifest files (`.yaml` and `.yml`, several documents per file) and reports the settings that make a workload unsafe or unreliable in production, for Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job and CronJob. Never talks to a cluster, never fetches anything, never runs a program, never prints the value of an environment variable.
- Pod Security Standards, with the profile and the field path of the page: Baseline controls are errors (`pss-privileged`, `pss-host-namespaces`, `pss-host-path`, `pss-host-port`, `pss-capabilities-add`, `pss-seccomp-unconfined`) and Restricted controls are warnings (`pss-privilege-escalation`, `pss-run-as-non-root`, `pss-run-as-user-root`, `pss-seccomp-missing`, `pss-capabilities-drop-all`, `pss-capabilities-add-restricted`).
- Resources, probes, images and secrets: `resources-requests-missing`, `resources-limits-missing`, `readiness-probe-missing`, `image-tag-latest`, `image-tag-missing`, `env-secret-plain`.
- Info findings, which never fail a run: `liveness-without-readiness`, `replicas-one-no-pdb`, `namespace-missing`, `namespace-default`, `value-not-read`.
- Nothing is skipped silently: a file that could not be read, a document the reader refused and a limit that was reached are findings (`file-not-read`, `yaml-not-read`, `limit-reached`), and what was counted and not checked is in the notes.
- A strict YAML reader of its own for the subset that manifests use: block maps and sequences, flow collections, plain and quoted scalars, block scalars, comments and document separators, with the line of every key. Anchors, aliases, tags, merge keys and duplicate keys are refused, and nesting, nodes, documents and scalars are bounded, so no input expands or runs for long.
- Every finding has an id, a severity (error, warning, info), the file and line, the workload kind and name, the container, the profile and field path for the Pod Security Standards, a message, a fix and the sentences of the Kubernetes documentation it rests on, with the address of the page.
- The pages of the sources are saved in `research/sources`; a test compares every quoted sentence, field path, capability name and seccomp value with the saved text.
- Safe input: only regular files below the folder are read, links to folders are not followed, links to files must stay inside the folder, files over their size limit are refused, and control characters are removed from every text shown.
- Reports as text, Markdown, JSON and CSV; `--fail-on` for a pipeline gate; info never fails the run; exit code `2` for a usage or input error.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
