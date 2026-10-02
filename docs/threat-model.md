# Threat model

## What the tool touches

- It reads the folder (or the file) that is named on the command line: it lists the folders below it and opens the files whose name ends in `.yaml` or `.yml`. Nothing else on the disk is opened.
- It does not follow a link to a folder. A link to a file is followed only when its real target is a regular file inside the real path of the folder.
- It writes only to the screen (standard output and standard error).
- It opens no network connection, talks to no cluster and runs no program: not `kubectl`, not `helm`, not a shell.

## What the input may hold

A folder of manifests is often checked in a pipeline that runs on pull requests, including pull requests from people outside the team. The tool treats every file as possibly hostile. A file can be huge, hold millions of brackets, quotes or dashes, nest a million levels deep, never close a quote or a bracket, use an alias to expand into gigabytes, hold a name made of control characters, hold a duplicate key that two readers would read differently, or be a link to a file elsewhere on the disk. A manifest can also hold a real secret by mistake. The tool reads the secret as little as it can and never prints it.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| An alias or a merge key expands a few bytes into gigabytes (the "billion laughs" file) | Anchors, aliases, tags and merge keys are refused with a clear message. The reader never builds an alias, so there is no expansion to bound |
| Deep nesting exhausts the stack | The reader stops at a nesting of 64 levels, in blocks, in flow collections and in a line of dashes, and recursion never goes deeper |
| A huge file, many files, many documents, many nodes or a huge scalar exhaust memory or time | A file over 1 MB is refused from the size of the open file before it is read, the files together are limited to 20 MB, the number of files, folders and entries is bounded, and a document stops at 200,000 nodes, a file at 500 documents and a scalar at 262,144 characters. Each is a finding |
| A crafted run of quotes, brackets, backslashes, comments or blank lines makes the reader slow | Each line is read a bounded number of times and each character of a scalar once. Tests run megabytes of each hostile shape and set a time limit |
| A quote or a bracket is never closed, so the rest of the file is ignored | It is an error finding, `yaml-not-read`, with the line, so the gate fails |
| A file is skipped, and a check passes without having run | A file that cannot be read is `file-not-read`, a limit is `limit-reached`, a document the reader refuses is `yaml-not-read`, a value that cannot be read is `value-not-read`, and the notes say what was counted and not checked |
| A link makes the tool read a file outside the folder, or loop | A link to a folder is not followed, and the real path of a link to a file is checked against the real path of the folder. A file that is not a regular file is refused |
| A pipe or a device in place of a file makes the tool hang | The type is looked at before the file is opened and again on the open file |
| A secret in a manifest reaches the report or the log of a pipeline | No value of an environment variable, a Secret, a command or an argument is copied into a finding: the report holds the name of the variable and a line number, and nothing of the value, not its length either. A `Secret` document is counted and never opened. Tests search every format for the values |
| A name rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators and Unicode direction controls are replaced by a space before any text reaches a report or an error message, and the length is capped |
| A name breaks the Markdown table in the job summary, or hides text as an HTML tag | Pipes, backslashes, line breaks, `<`, `>` and `&` are escaped in every table cell |
| A CSV report runs a formula when opened in a spreadsheet | Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`; every cell is quoted as RFC 4180 says |
| A duplicate key shows one reader a safe value and another reader an unsafe one | A duplicate key is an error that names both lines, so the file is not read |
| A key such as `__proto__` changes how objects behave | Maps are held in `Map` objects, and no object is built from a key of the input |
| The order or the result differs between systems | Names are compared by code unit, never by locale, and shown with forward slashes on every system |
| The tool runs something that the manifest names | It does not: the tool has no code that runs a program, evaluates text or loads a module from the input. A test checks that its source names no such call |

## What the tool does not defend against

The person who runs the tool is trusted: the paths they give are read. A report written to a shared place is as sensitive as its names: workload names, container names, image names and namespaces can be confidential even though no value is printed. The tool does not say that the files are what a cluster runs.
