# Secure defaults

The default run is the safe run. Nothing below needs a flag, and none of it can be switched off.

## How the tool behaves by default

- **No network, no cluster.** The tool reads files and sends nothing anywhere. It never talks to a cluster, never fetches an address, does not download a page of the documentation, and does not check for updates. The pages that the findings quote are saved in the repository.
- **No code is run.** The YAML is read as text by a strict reader of its own. Nothing in it is evaluated, loaded or given to another program. The tool has no code path that calls `eval`, `new Function` or `import()` on input.
- **No commands.** The tool never runs a program, a shell, `kubectl` or `helm`. No name, path or value from a file is put on a command line.
- **No dependencies.** Node 22 or newer and nothing else, so a check that runs in a pipeline adds no supply chain of its own and there is no YAML library to keep up to date. There is no `node_modules` to install before it runs.
- **Anchors, aliases, tags and merge keys are refused.** A manifest that uses them is reported as not read, with the line. No file can make the reader expand a small input into a large one.
- **Reads only inside the folder.** The tool opens the files below the folder it is given. A link to a folder is not followed, and the real path of a link to a file is checked against the real path of the folder before it is opened.
- **Regular files only, bounded.** Each file is opened once, its type and size are taken from the open file, and anything that is not a regular file or is over its limit is refused before it is read. The total size, the number of files, the nesting, the number of nodes and the size of a scalar are bounded too.
- **No value is printed.** The report holds paths, line numbers, kinds, names, field paths, image names, capability names, the name of an environment variable and quoted sentences of the documentation. It never holds the value of an environment variable, a command, an argument or a Secret. A `Secret` document is never opened.
- **Control characters are removed.** Control, line separator and direction characters are replaced by a space before any text reaches a report or an error message, so a hostile name cannot rewrite the terminal or reorder what a reader sees.
- **Strict formats.** In the Markdown report, pipes, backslashes, angle brackets and ampersands are escaped. In the CSV report, every cell is quoted as RFC 4180 says, and a cell that starts with `=`, `+`, `-` or `@` gets a leading quote.
- **Linear time.** The reader reads each line a bounded number of times and each character of a scalar once. Tests run megabytes of hostile text for each shape.
- **Unread is never fine.** A file that could not be read, a document that the reader refused, a limit that was reached and a value that could not be read are findings and not skips, and a check that cannot judge a case says so in a note.
- **The gate is on.** Without any option, an error makes the run exit with `1`. A pipeline that adds the tool notices a privileged container, a host path volume, a host port and a manifest it cannot read from the first run.
- **Writes nothing to disk.** The report goes to the screen. Redirect it to a file or the job summary only when you need to keep it.

## Running it safely on manifests you do not know

1. A manifest is data, and the tool treats it as data. Still, run it as a user with read access to the folder and nothing else; it needs no account, no key, no kubeconfig and no network.
2. Read the notes and the info findings: they say what was not read (a Secret, a Service, an image written as a placeholder, a budget that cannot be compared) and what was cut, so a pass is not taken for more than it is.
3. Keep the files you check free of real secrets. The tool does not print a value, but the files may travel through other tools of your pipeline.
