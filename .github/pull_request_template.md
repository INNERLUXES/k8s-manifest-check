## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a check or to the YAML reader is described in docs/method.md, says what the check can and cannot see, and has a test with the manifest written inline and a near miss that must not match
- [ ] A change to a quoted sentence, a field path or a list of names follows the source: the new page text is saved in research/sources, `src/data.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] A conclusion that no source states is worded as the tool's own, in the message and in docs/method.md
- [ ] Names from a file go through `safeText`, and the report never prints a value of an environment variable, a Secret or any other value of a manifest
- [ ] The YAML reader still refuses anchors, aliases, tags and merge keys, and every size and depth limit still holds
- [ ] The tool still fetches nothing, opens no connection, runs no program and never talks to a cluster
- [ ] A thing the tool cannot read is reported as a finding or a note, never skipped and never shown as passed
- [ ] Paths are shown relative with forward slashes, so the result is the same on Linux, macOS and Windows
- [ ] No real secret in fixtures or examples
- [ ] The commit messages of this pull request follow Conventional Commits
