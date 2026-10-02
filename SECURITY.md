# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "k8s-manifest-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up manifest (or folder of manifests) that shows the problem, what you expected and what happened. Use made-up names, and no real data, credentials, internal addresses or customer information.

## Scope

In scope:

- an input that makes the tool fetch an address, open a network connection, talk to a cluster, open a file outside the folder it was given (through a `..` path, an absolute path, a symbolic link or a junction), run a program, or run anything that a manifest names
- an input that makes the tool print a value of a manifest: the value of an environment variable, a command or argument, or any part of a `Secret`
- an input that makes the tool hang, take very long, or use unbounded memory, such as an alias that expands, very deep nesting, a very long string, a long run of quotes, brackets, backslashes or dashes, very many documents or nodes, or a path that is not a regular file
- an input that the YAML reader accepts but should refuse (an anchor, an alias, a tag, a merge key, a duplicate key), or that it refuses but docs/method.md says it reads
- text from a name that breaks a Markdown table, injects a formula into a CSV report, or rewrites the terminal through control or direction characters
- a finding that docs/method.md says is reported, for an input the tool accepts, that the report leaves out, or a file that docs/method.md says is reported as not read that the report counts as checked

Out of scope: whether your cluster is secure (docs/limits.md lists what the files cannot show), the Kubernetes documentation and the behavior of a cluster itself, and how your pipeline stores the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
