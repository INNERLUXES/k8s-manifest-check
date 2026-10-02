// Report formats: text for a terminal, Markdown for a pull request or job summary, JSON for other tools, CSV for a
// spreadsheet. Findings are listed in the order of the files read, then by line. A finding names the file, the line, the
// workload and the container; the sentences of the Kubernetes documentation that it quotes come with their addresses.
// No report holds a value of an environment variable or of a Secret.

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

function countsLine(c) {
  return `${c.error} error, ${c.warning} warning, ${c.info} info`;
}

function gateLine(r) {
  return r.gate.pass ? `GATE: PASS (--fail-on ${r.gate.failOn})` : `GATE: FAIL - ${r.gate.reason}`;
}

function inputLine(r) {
  return `${plural(r.input.files.length, 'file')}, ${plural(r.input.documents, 'document')}, ${plural(r.input.workloads, 'workload')}`;
}

const sectionOf = (m) => (m.section === m.page ? m.page : `${m.page}, ${m.section}`);

// Who a finding is about: "Deployment shop-api, container api", or the workload alone.
function aboutOf(f) {
  const who = [f.kind, f.name].filter(Boolean).join(' ');
  return f.container ? `${who}, container ${f.container}` : who;
}

export function toText(r) {
  const lines = [`k8s-manifest-check: ${r.target}`, `read: ${inputLine(r)}`, `findings: ${countsLine(r.counts)}`];
  if (!r.findings.length) lines.push('', 'no findings');
  for (const f of r.findings) {
    lines.push('', `${f.severity.toUpperCase().padEnd(7)}  ${f.id}  ${f.file}:${f.line}`);
    lines.push(`         about: ${aboutOf(f)}`);
    if (f.profile) lines.push(`         profile: ${f.profile}, page field ${f.field}`);
    if (f.at) lines.push(`         at: ${f.at}`);
    lines.push(`         ${f.message}`, `         fix: ${f.fix}`);
    for (const m of f.manual) lines.push(`         source (${sectionOf(m)}): "${m.quote}"`, `           ${m.url}`);
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`note: ${note}`);
  lines.push('', gateLine(r));
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes and pipes escaped, line breaks flattened, and <, > and & written as entities, so
// text from a file name or a manifest cannot break the table or be read as HTML.
export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r) {
  const lines = [`## k8s-manifest-check: ${countsLine(r.counts)}`, '', `${mdCell(r.target)}, ${mdCell(inputLine(r))}.`];
  if (!r.findings.length) lines.push('', 'No findings.');
  else {
    lines.push('', '| Severity | Check | Where | About | Profile | Message | Fix | Source |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const f of r.findings) {
      const source = f.manual.map((m) => `[${mdCell(sectionOf(m))}](${m.url}): "${mdCell(m.quote)}"`).join('<br>');
      const profile = f.profile ? `${f.profile} (${f.field})` : '-';
      lines.push(`| ${f.severity} | ${mdCell(f.id)} | ${mdCell(`${f.file}:${f.line}`)} | ${mdCell(aboutOf(f))} | ${mdCell(profile)} | ${mdCell(f.message)} | ${mdCell(f.fix)} | ${source || '-'} |`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`- ${mdCell(note)}`);
  lines.push('', r.gate.pass ? `**Gate passed** (--fail-on ${r.gate.failOn}).` : `**Gate failed:** ${mdCell(r.gate.reason)}.`);
  return lines.join('\n') + '\n';
}

export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}

// RFC 4180 quoting, and a leading quote on cells a spreadsheet would read as a formula.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per finding. source_section and source_url name the first sentence the finding quotes; the JSON report has all
// of them.
export function toCsv(r) {
  const rows = [['severity', 'id', 'file', 'line', 'kind', 'name', 'container', 'profile', 'field', 'message', 'fix', 'source_page', 'source_section', 'source_url']];
  for (const f of r.findings) {
    const m = f.manual[0];
    rows.push([f.severity, f.id, f.file, String(f.line), f.kind, f.name, f.container, f.profile ?? '', f.field ?? '', f.message, f.fix, m ? m.page : '', m ? m.section : '', m ? m.url : '']);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
