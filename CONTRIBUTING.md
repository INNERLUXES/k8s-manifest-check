# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, with `!` for a breaking change.

## Changing a check

1. Describe the change in docs/method.md first: what the check reports, its severity, what it can see and what it cannot, and the sentence of the page it rests on. Where the tool makes a conclusion of its own (a severity, a list of names, a reading of what a field means), say so and say why, and say it in the message of the finding too. Keep the Pod Security Standards profiles apart: a control of the Baseline profile and a control of the Restricted profile are different findings with the page's own field paths.
2. Add a test with the manifest written inline, small enough that the result can be worked out by hand, and a near miss that must not match. Use made-up names.
3. Names from a file go through `safeText` before they reach a finding or a note, so control characters are removed. A finding shows a path, a name or a field that it is about, cut to a length, and never a value of the manifest: not the value of an environment variable, a command or an argument.
4. A finding id, once released, keeps its meaning: pipelines and other tools read it from the JSON and CSV reports.
5. A thing the tool cannot read is reported, never skipped. A finding that a file cannot settle says that it is a review item.

## Changing a quoted sentence, a field path or a list of names

The sentences, the field paths, the list of capabilities and the seccomp values in `src/data.js` come from the pages saved in `research/sources`. When a page changes, save the new text in `research/sources` (the address on the first line), change `src/data.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` compares every sentence, field path and name with the saved text, so changing one without the other fails.

Never add a fact, a requirement or a rule from memory or from a blog post. A new check needs the page, opened and saved, and the words of the page that give the sentence. If a page says that something differs by Kubernetes version, say so in docs/limits.md in the words of the page, and do not add a version that the page does not give.

## Changing the YAML reader

The reader in `src/yaml.js` is the base of every check.

1. Add a test for every form you add and one for the near miss. Keep the read linear: each line looked at a bounded number of times, each character of a scalar read once, no search that starts again from the beginning.
2. Anchors, aliases, tags and merge keys stay refused. Keep the limits on nesting, nodes, documents and the size of a scalar, and add a hostile-input test with a time limit for a new shape.
3. Line numbers are the line of the key in the file, counted from 1, also inside a flow collection or after a block scalar.
4. Paths are listed and opened in `src/files.js` only. Paths shown in a report are relative, with forward slashes. Names are compared by code unit, never by locale. Do not assume that a backslash is a separator on Linux or macOS.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files it is given and writes only to the screen. It fetches nothing, opens no network connection, talks to no cluster, runs no program, and never runs what it reads.
- Source files stay ASCII; build any other character from its number.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- The README and the documents carry no dates or years.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
