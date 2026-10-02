import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YAML_LIMITS, entryOf, get, isMap, isScalar, isSeq, readDocuments, resolveScalar, splitLines } from '../src/index.js';

const one = (text) => {
  const r = readDocuments(text);
  assert.deepEqual(r.errors, [], text);
  assert.equal(r.documents.length, 1, text);
  return r.documents[0].root;
};
const fails = (text) => {
  const r = readDocuments(text);
  assert.equal(r.documents.length, 0, text);
  assert.equal(r.errors.length, 1, text);
  return r.errors[0];
};
const plain = (node) => node.value;

test('yaml: block maps, nested maps and sequences, with the line of every key', () => {
  const root = one('a: 1\nb:\n  c: two\n  d:\n    - x\n    - y\n');
  assert.ok(isMap(root));
  assert.equal(plain(get(root, 'a')), '1');
  assert.equal(entryOf(root, 'b').line, 2);
  assert.equal(entryOf(get(root, 'b'), 'c').line, 3);
  assert.equal(entryOf(get(root, 'b'), 'd').line, 4);
  const d = get(get(root, 'b'), 'd');
  assert.ok(isSeq(d));
  assert.deepEqual(d.items.map(plain), ['x', 'y']);
  assert.equal(d.items[1].line, 6);
});

test('yaml: a sequence may sit at the same indent as its key, and a map may start on the dash line', () => {
  const root = one('containers:\n- name: a\n  image: x\n- name: b\n  image: y\nafter: 1\n');
  const list = get(root, 'containers');
  assert.equal(list.items.length, 2);
  assert.equal(plain(get(list.items[1], 'image')), 'y');
  assert.equal(entryOf(list.items[1], 'image').line, 5);
  assert.equal(plain(get(root, 'after')), '1');
});

test('yaml: a sequence of sequences and a dash with the item on the next line', () => {
  const root = one('m:\n  - - a\n    - b\n  -\n    k: v\n');
  const m = get(root, 'm');
  assert.deepEqual(m.items[0].items.map(plain), ['a', 'b']);
  assert.equal(plain(get(m.items[1], 'k')), 'v');
});

test('yaml: comments are ignored, also after a value and between keys', () => {
  const root = one('# top\na: 1 # one\n\n# between\nb: "x # not a comment"\nc: y#z\n');
  assert.equal(plain(get(root, 'a')), '1');
  assert.equal(plain(get(root, 'b')), 'x # not a comment');
  assert.equal(plain(get(root, 'c')), 'y#z');
});

test('yaml: plain scalars keep colons that are not followed by a space, and may continue on the next lines', () => {
  const root = one('image: registry.example:5000/app:1.2\nurl: http://a.example/x\ntext: one\n  two\n\n  three\nnext: 1\n');
  assert.equal(plain(get(root, 'image')), 'registry.example:5000/app:1.2');
  assert.equal(plain(get(root, 'url')), 'http://a.example/x');
  assert.equal(plain(get(root, 'text')), 'one two\nthree');
  assert.equal(plain(get(root, 'next')), '1');
});

test('yaml: single and double quoted scalars with their escapes', () => {
  const root = one(`a: 'it''s'\nb: "tab\\there \\u00e9 \\x41 \\" \\\\"\nc: ""\nd: ''\n`);
  assert.equal(plain(get(root, 'a')), "it's");
  assert.equal(plain(get(root, 'b')), 'tab\there \u00e9 A " \\');
  assert.equal(plain(get(root, 'c')), '');
  assert.equal(get(root, 'c').style, 'double');
  assert.equal(plain(get(root, 'd')), '');
});

test('yaml: quoted scalars over several lines fold a break to a space and a blank line to a break', () => {
  const root = one('a: "one\n  two\n\n  three"\nb: \'x\n  y\'\nc: "end\\\n  joined"\nd: 1\n');
  assert.equal(plain(get(root, 'a')), 'one two\nthree');
  assert.equal(plain(get(root, 'b')), 'x y');
  assert.equal(plain(get(root, 'c')), 'endjoined');
  assert.equal(entryOf(root, 'd').line, 9);
});

test('yaml: quoted keys', () => {
  const root = one('"a b": 1\n\'c: d\': 2\n');
  assert.equal(plain(get(root, 'a b')), '1');
  assert.equal(plain(get(root, 'c: d')), '2');
});

test('yaml: flow lists and flow maps, nested, on one line and over several lines, with a trailing comma', () => {
  const root = one('a: [x, "y z", \'w\', 3]\nb: {k: v, "q r": [1, 2], n: {m: 1},}\nc: [\n  one, # note\n  two\n]\nd: []\ne: {}\n');
  assert.deepEqual(get(root, 'a').items.map(plain), ['x', 'y z', 'w', '3']);
  const b = get(root, 'b');
  assert.equal(plain(get(b, 'k')), 'v');
  assert.deepEqual(get(b, 'q r').items.map(plain), ['1', '2']);
  assert.equal(plain(get(get(b, 'n'), 'm')), '1');
  const c = get(root, 'c');
  assert.deepEqual(c.items.map(plain), ['one', 'two']);
  assert.equal(c.items[1].line, 5);
  assert.equal(get(root, 'd').items.length, 0);
  assert.equal(get(root, 'e').entries.length, 0);
});

test('yaml: an apostrophe inside a plain flow value is not a quote, and a flow value may be the item of a block list', () => {
  const root = one('a: [don\'t, "b"]\nb:\n  - [1, 2]\n  - {x: 1}\n');
  assert.deepEqual(get(root, 'a').items.map(plain), ["don't", 'b']);
  assert.equal(get(root, 'b').items.length, 2);
});

test('yaml: literal and folded block scalars, with chomping and an indent indicator', () => {
  const root = one('a: |\n  line one\n  line two\n\nb: >\n  folded\n  text\n\n  next\nc: |-\n  strip\nd: |+\n  keep\n\ne: |2\n    indented\nf: 1\n');
  assert.equal(plain(get(root, 'a')), 'line one\nline two\n');
  assert.equal(plain(get(root, 'b')), 'folded text\nnext\n');
  assert.equal(plain(get(root, 'c')), 'strip');
  assert.equal(plain(get(root, 'd')), 'keep\n\n');
  assert.equal(plain(get(root, 'e')), '  indented\n');
  assert.equal(entryOf(root, 'f').line, 17);
});

test('yaml: a block scalar keeps a comment-looking line and lines that look like keys', () => {
  const root = one('script: |\n  # not a comment\n  key: value\n  - not a list\nnext: 1\n');
  assert.equal(plain(get(root, 'script')), '# not a comment\nkey: value\n- not a list\n');
  assert.equal(plain(get(root, 'next')), '1');
});

test('yaml: a block scalar as the item of a list', () => {
  const root = one('command:\n  - sh\n  - -c\n  - |\n    echo one\n    echo two\n  - last\n');
  const items = get(root, 'command').items;
  assert.deepEqual(items.map(plain), ['sh', '-c', 'echo one\necho two\n', 'last']);
});

test('yaml: documents are split at --- and a document of only comments is not one', () => {
  const r = readDocuments('# first\n---\na: 1\n---\n# nothing\n---\nb: 2\n...\n');
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.documents.map((d) => d.line), [3, 7]);
  assert.equal(plain(get(r.documents[1].root, 'b')), '2');
});

test('yaml: a bad document does not stop the documents after it', () => {
  const r = readDocuments('a: &x 1\n---\nb: 2\n---\nc: [1\n---\nd: 4\n');
  assert.equal(r.documents.length, 2);
  assert.deepEqual(r.errors.map((e) => e.line), [1, 5]);
});

test('yaml: line ends of LF, CRLF and CR, and a byte order mark', () => {
  for (const nl of ['\n', '\r\n', '\r']) {
    const root = one(`a: 1${nl}b:${nl}  c: 2${nl}`);
    assert.equal(entryOf(get(root, 'b'), 'c').line, 3);
  }
  assert.equal(plain(get(one('\ufeffa: 1\n'), 'a')), '1');
  assert.deepEqual(splitLines('a\r\nb\rc\n'), ['a', 'b', 'c']);
});

test('yaml: plain scalars resolve as the YAML 1.2 core schema says, and quoted ones are strings', () => {
  const kind = (text) => resolveScalar(one(`v: ${text}\n`).entries[0].value).kind;
  assert.equal(kind('true'), 'boolean');
  assert.equal(kind('False'), 'boolean');
  assert.equal(kind('0'), 'integer');
  assert.equal(kind('-12'), 'integer');
  assert.equal(kind('1.5'), 'float');
  assert.equal(kind('null'), 'null');
  assert.equal(kind('~'), 'null');
  assert.equal(kind('yes'), 'ambiguous');
  assert.equal(kind('"true"'), 'string');
  assert.equal(kind('1.2.3'), 'string');
  assert.equal(resolveScalar(one('v:\n').entries[0].value).kind, 'null');
});

test('yaml: anchors are refused with a clear message, in every place they can stand', () => {
  for (const text of ['a: &x 1\n', '&x a: 1\n', 'a:\n  - &x 1\n', 'a: [&x 1]\n', '&x\na: 1\n', 'a: {b: &x 1}\n']) {
    const e = fails(text);
    assert.match(e.message, /anchor \(&name\) is refused/, text);
  }
});

test('yaml: aliases are refused, so an expansion bomb is never built', () => {
  const bomb = 'a: &a [x, x, x, x, x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]\nd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c]\n';
  const e = fails(bomb);
  assert.match(e.message, /refused/);
  assert.equal(e.line, 1);
  for (const text of ['a: *x\n', '- *x\n', 'a: [*x]\n', '*x : 1\n']) assert.match(fails(text).message, /alias \(\*name\) is refused/, text);
});

test('yaml: tags and merge keys are refused', () => {
  for (const text of ['a: !!str 1\n', 'a: !Custom x\n', '!!map\na: 1\n', 'a: [!!str 1]\n']) assert.match(fails(text).message, /tag \(! or !!\) is refused/, text);
  assert.match(fails('base: 1\n<<: x\n').message, /merge key \(<<\) is refused/);
  assert.match(fails('a: {<<: x}\n').message, /merge key/);
  assert.match(one('"<<": 1\n').entries[0].key, /<</);
});

test('yaml: complex keys, directives, tabs, control characters and text after a value are errors with a line', () => {
  assert.match(fails('? a\n: b\n').message, /complex key/);
  assert.match(fails('%YAML 1.2\n').message, /directive/);
  const tab = fails('a:\n\tb: 1\n');
  assert.match(tab.message, /tab/);
  assert.equal(tab.line, 2);
  assert.match(fails('a: 1\nb: \u0001\n').message, /control character/);
  assert.match(fails('a: "x" y\n').message, /unexpected text/);
  assert.match(fails('a: [1] 2\n').message, /unexpected text/);
  assert.match(fails('--- a: 1\n').message, /same line as ---/);
  assert.match(fails('a: b: c\n').message, /not allowed here/);
});

test('yaml: duplicate keys are an error that names both lines', () => {
  const e = fails('a: 1\nb: 2\na: 3\n');
  assert.match(e.message, /duplicate key "a"/);
  assert.match(e.message, /line 1/);
  assert.equal(e.line, 3);
  assert.match(fails('a: {b: 1, b: 2}\n').message, /duplicate key "b"/);
});

test('yaml: wrong indentation is an error and not a guess', () => {
  assert.match(fails('a:\n  b: 1\n    c: 2\n').message, /indentation/);
  assert.match(fails('a:\n  b: 1\n c: 2\n').message, /indentation/);
  assert.match(fails('a: 1\n  b: 2\n').message, /not allowed here|indentation/);
});

test('yaml: a quoted value or a flow collection that is never closed is an error at the line it opens', () => {
  assert.equal(fails('a: 1\nb: "never closed\nc: 2\n').line, 2);
  assert.equal(fails('a: [1, 2\nb: 2\n').line, 1);
  assert.match(fails('a: {b: 1\n').message, /never closed/);
  assert.match(fails('a: "bad \\q escape"\n').message, /escape/);
});

test('hostile yaml: nesting is limited, in blocks, in flow collections and on one line of dashes', () => {
  const block = Array.from({ length: 200 }, (_, i) => `${' '.repeat(i)}k${i}:`).join('\n') + '\n';
  assert.match(fails(block).message, /deeper than 64/);
  assert.match(fails(`a: ${'['.repeat(10000)}${']'.repeat(10000)}\n`).message, /deeper than 64/);
  assert.match(fails(`${'- '.repeat(10000)}x\n`).message, /deeper than 64/);
  assert.match(fails(`a: ${'{b: '.repeat(1000)}1${'}'.repeat(1000)}\n`).message, /deeper than 64/);
  const ok = Array.from({ length: 60 }, (_, i) => `${' '.repeat(i)}k${i}:`).join('\n') + ' 1\n';
  assert.equal(readDocuments(ok).documents.length, 1);
});

test('hostile yaml: a huge scalar is refused at the limit, in every form', () => {
  const big = 'x'.repeat(YAML_LIMITS.maxScalarChars + 10);
  for (const text of [`a: ${big}\n`, `a: "${big}"\n`, `a: '${big}'\n`, `a: [${big}]\n`, `a: |\n  ${big}\n`]) assert.match(fails(text).message, /longer than|too long/, text.slice(0, 12));
  const folded = Array.from({ length: 5000 }, () => 'y'.repeat(100)).join('\n  ');
  assert.match(fails(`a: ${folded}\n`).message, /longer than/);
  assert.equal(readDocuments(`a: ${'x'.repeat(YAML_LIMITS.maxScalarChars - 1)}\n`).documents.length, 1);
});

test('hostile yaml: millions of characters of every shape are read in linear time', () => {
  const started = Date.now();
  const shapes = [
    Array.from({ length: 150000 }, (_, i) => `key${i}: ${i}`).join('\n') + '\n',
    `a: [${'1,'.repeat(500000)}1]\n`,
    `a: 1\n${'\n'.repeat(2000000)}b: 2\n`,
    `a: "start\n${'  more words here\n'.repeat(50000)}`,
    `${'# comment\n'.repeat(300000)}a: 1\n`,
    `a: |\n${'  block text\n'.repeat(60000)}`,
    `a: 1\n${'---\n'.repeat(200000)}`,
    `a: ${"'".repeat(1000000)}\n`,
    `a: ${'\\'.repeat(1000000)}\n`
  ];
  for (const text of shapes) readDocuments(text);
  assert.ok(Date.now() - started < 15000, `took ${Date.now() - started} ms`);
});

test('hostile yaml: more nodes than the limit and more documents than the limit stop the read with a message', () => {
  const nodes = Array.from({ length: 130000 }, (_, i) => `k${i}: [1, 2]`).join('\n');
  assert.match(fails(nodes).message, /more than 200000 nodes/);
  const docs = Array.from({ length: 700 }, (_, i) => `a${i}: 1`).join('\n---\n');
  const r = readDocuments(docs);
  assert.equal(r.documents.length, 500);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /more than 500 documents/);
});

test('hostile yaml: the keys __proto__ and constructor are plain keys and change nothing', () => {
  const root = one('__proto__: 1\nconstructor: 2\ntoString: 3\n');
  assert.equal(plain(get(root, '__proto__')), '1');
  assert.equal(plain(get(root, 'constructor')), '2');
  assert.equal(Object.getPrototypeOf(root.index), Map.prototype);
  assert.equal(({}).polluted, undefined);
  assert.equal(isScalar(get(root, 'toString')), true);
});
