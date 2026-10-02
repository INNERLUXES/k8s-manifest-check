# 1. A strict YAML reader of our own

## Context

The tool needs to read Kubernetes manifests and say what in them is unsafe or unreliable, with the line of the key. A YAML library does the first part and rarely the second: most of them give the data without the lines, and the ones that keep the lines are large, resolve anchors and aliases by default, and read more of YAML than manifests use, including tags that name types. A manifest folder is often checked in a pipeline that runs on pull requests from people outside the team, so the reader is the first thing that touches hostile input.

Aliases are the sharp edge. An alias is a second name for a node, and a few hundred bytes of nested aliases stand for billions of nodes. Any reader that builds or walks them needs a bound, and a bound that is wrong is an outage in the pipeline. Kubernetes manifests do not need aliases to be read: a manifest that uses them can be rendered to plain YAML first.

## Decision

The tool has no dependencies and reads the YAML itself, for the subset that manifests use: block maps and sequences, flow collections, plain and quoted scalars, block scalars, comments and document separators. It refuses anchors, aliases, tags and merge keys with a message and the line, refuses duplicate keys and tabs in indentation, and bounds the nesting, the number of nodes and documents, and the size of a scalar. A document that is refused is a finding (`yaml-not-read`), and the other documents of the file are still read. It keeps the line of every key.

The reader does not resolve more than the YAML 1.2 core schema for plain scalars: `true`, `false`, whole numbers and null. A word that older readers took as a boolean is reported as a value that was not read, instead of being guessed, because no saved page says how a cluster reads it.

## Consequences

A hostile file cannot make the reader expand or run for long, and the time is linear in the size of the input. The tool has no supply chain of its own. The price is that the reader refuses valid YAML that manifests rarely use (anchors, tags, complex keys, content on the line of `---`), so a manifest built with anchors must be rendered first, and that a reader of our own can have bugs that a library has already fixed. The tests cover each form it reads, each form it refuses, and megabytes of each hostile shape with a time limit, and a change to the reader is described in docs/method.md first.
