# Inputs

The tool takes one path: a folder of Kubernetes manifest files, or one manifest file. It reads the files whose name ends in `.yaml` or `.yml` (letter case ignored) below the folder, and nothing else. It follows no address, opens no file outside the folder, and never talks to a cluster.

## The folder

- **Walk.** Folders are read in code unit order of their names, so the order of the files, and of the report, is the same on Linux, macOS and Windows. The folders `.git` and `node_modules` are skipped.
- **Links.** A symbolic link to a file is read only when the real path of the file is inside the real path of the folder; a link that leads outside is a `file-not-read` finding. A symbolic link to a folder is not followed, and a note says so, so a link cannot make the walk loop or leave the folder.
- **Regular files only.** The type is looked at before the file is opened and again on the open file. A pipe, a device or a folder that has a manifest name is refused.
- **Size.** A file over 1 MB is refused from the size of the open file, before it is read, and is a `file-not-read` finding; the other files are still read. The files together are limited to 20 MB, at most 500 manifest files are read, folders are followed to a depth of 20, and at most 20,000 entries are looked at. A limit is a `limit-reached` finding, never a silent cut.
- **Encoding.** The text is read as UTF-8. A byte order mark at the start of a file is ignored. A file that is not valid UTF-8 is a `file-not-read` finding. Line ends can be LF, CRLF or CR.
- **One file.** Given a file, the tool reads that file; its name is the path in the report.

## The documents

A file can hold several documents separated by lines that start with `---`. A document that holds only comments is not counted. At most 500 documents are read from one file. The YAML reader is described in [method.md](method.md); it reads the YAML that manifests use and refuses anchors, aliases, tags and merge keys, and a document it refuses is a `yaml-not-read` finding with the line.

A file that is not plain YAML, for example a Helm template with `{{ ... }}`, is reported as `yaml-not-read`. Render the chart first (`helm template`) and check the files that it writes; the tool does not run Helm or any other program.

## What is read from a document

- `apiVersion` is not looked at. `kind` decides what the document is: a workload (`Pod`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job`, `CronJob`), a `PodDisruptionBudget`, a `List` (its `items` are read as documents), or something else, which is counted and not looked at.
- `metadata.name` and `metadata.namespace` of the document.
- In the Pod spec: `containers` and `initContainers`, `securityContext`, `hostNetwork`, `hostPID`, `hostIPC`, `volumes[*].hostPath`, `os.name` and `resources`. In each container: `name`, `image`, `ports[*].hostPort`, `env[*]` (the name, and whether there is a `value`), `resources`, `readinessProbe`, `livenessProbe` and `securityContext`.
- In a Deployment: `spec.replicas` and the labels of the Pod template. In a `PodDisruptionBudget`: `metadata.namespace` and `spec.selector`.
- The files of a `Secret` and of a ConfigMap are not read, and no value of an environment variable is ever kept.

## Paths in the report

A path in the report is relative to the folder that was given, with forward slashes, so a report written on Windows and one written on Linux are the same. A path given with backslashes is shown with forward slashes in the first line of the report.
