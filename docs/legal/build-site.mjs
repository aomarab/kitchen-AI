#!/usr/bin/env node
// Renders the legal Markdown docs into a small static site for GitHub Pages.
// Dependency-free on purpose: it only needs Node's stdlib, so it runs offline
// and adds nothing to the workspace lockfile.
//
// Usage: node docs/legal/build-site.mjs [outDir]
//   outDir defaults to docs/legal/.site
//
// The generated files (privacy-policy.html, terms-of-service.html, index.html,
// style.css, .nojekyll) are what gets published on the gh-pages branch.

import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] ? process.argv[2] : join(here, '.site');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Inline Markdown -> HTML, applied to already-HTML-escaped text.
function inline(text) {
  let s = esc(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
  // autolinks written as <https://...> become &lt;https://...&gt; after esc()
  s = s.replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, (_, u) => `<a href="${u}">${u}</a>`);
  return s;
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const thead = `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function mdToHtml(md) {
  // strip HTML comments (may span lines)
  md = md.replace(/<!--[\s\S]*?-->/g, '');
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  const isTableSep = (l) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');

  while (i < lines.length) {
    let line = lines[i];

    if (line.trim() === '') {
      i++;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // table (a header line followed by a separator row)
    if (line.trimStart().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        rows.push(lines[i]);
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }

    // blockquote
    if (line.trimStart().startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(' ').trim())}</blockquote>`);
      continue;
    }

    // unordered list (items may soft-wrap across lines)
    if (/^\s*-\s+/.test(line)) {
      const items = [];
      while (i < lines.length && lines[i].trim() !== '') {
        const m = lines[i].match(/^\s*-\s+(.*)$/);
        if (m) {
          items.push(m[1].trim());
        } else if (items.length) {
          items[items.length - 1] += ' ' + lines[i].trim();
        } else {
          break;
        }
        i++;
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</ul>`);
      continue;
    }

    // paragraph (join soft-wrapped lines until a blank line or a block starter)
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*-\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('>') &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !lines[i].trimStart().startsWith('|')
    ) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const STYLE = `:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1c1b22;
  background: #faf8f6;
}
main { max-width: 760px; margin: 0 auto; padding: 40px 22px 96px; }
header.site {
  border-bottom: 1px solid #e7e2dc;
  background: #fffdfb;
}
header.site .bar { max-width: 760px; margin: 0 auto; padding: 16px 22px; display: flex; gap: 16px; align-items: baseline; }
header.site a { color: #6d4076; text-decoration: none; font-weight: 600; }
header.site .brand { font-weight: 700; color: #1c1b22; margin-inline-end: auto; }
h1 { font-size: 1.9rem; line-height: 1.25; margin: 0.4em 0 0.2em; }
h2 { font-size: 1.25rem; margin: 1.8em 0 0.4em; }
h3 { font-size: 1.05rem; margin: 1.4em 0 0.3em; }
p, li { color: #34313a; }
a { color: #6d4076; }
code { background: #efe9f0; padding: 0.1em 0.35em; border-radius: 4px; font-size: 0.92em; }
blockquote { margin: 1em 0; padding: 0.6em 1em; background: #f2ecf3; border-inline-start: 3px solid #b79dbf; border-radius: 6px; color: #4a3d50; font-size: 0.95em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.94em; }
th, td { border: 1px solid #e2dcd6; padding: 8px 10px; text-align: start; vertical-align: top; }
th { background: #f3ede9; }
ul { padding-inline-start: 1.3em; }
li { margin: 0.3em 0; }
footer { margin-top: 3em; padding-top: 1.4em; border-top: 1px solid #e7e2dc; font-size: 0.86rem; color: #7a7480; }
@media (prefers-color-scheme: dark) {
  body { color: #ececf0; background: #17151b; }
  header.site { background: #1f1c25; border-bottom-color: #2c2833; }
  header.site .brand { color: #ececf0; }
  p, li { color: #cfcad4; }
  code { background: #2a2531; }
  blockquote { background: #241f2c; color: #d5cbdb; border-inline-start-color: #7a5c86; }
  th { background: #241f2c; }
  th, td { border-color: #322c3b; }
  footer { border-top-color: #2c2833; color: #948da0; }
}`;

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Kitchen AI</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<header class="site"><div class="bar">
<span class="brand">Kitchen AI</span>
<a href="./index.html">Home</a>
<a href="./privacy-policy.html">Privacy</a>
<a href="./terms-of-service.html">Terms</a>
</div></header>
<main>
${bodyHtml}
<footer>© ${new Date().getFullYear()} Abdulraheem Omar · Kitchen AI · <a href="mailto:aomarab@outlook.com">aomarab@outlook.com</a></footer>
</main>
</body>
</html>
`;
}

const INDEX_BODY = `<h1>Kitchen AI — Legal</h1>
<p>Kitchen AI photographs your kitchen and returns meal plans grounded in what you actually have on hand. These are the app's current legal documents.</p>
<ul>
<li><a href="./privacy-policy.html">Privacy Policy</a></li>
<li><a href="./terms-of-service.html">Terms of Service</a></li>
</ul>
<p>Questions or requests: <a href="mailto:aomarab@outlook.com">aomarab@outlook.com</a>.</p>`;

// build
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const docs = [
  { src: 'privacy-policy.md', out: 'privacy-policy.html', title: 'Privacy Policy' },
  { src: 'terms-of-service.md', out: 'terms-of-service.html', title: 'Terms of Service' },
];

for (const d of docs) {
  const md = readFileSync(join(here, d.src), 'utf8');
  writeFileSync(join(outDir, d.out), page(d.title, mdToHtml(md)));
}
writeFileSync(join(outDir, 'index.html'), page('Legal', INDEX_BODY));
writeFileSync(join(outDir, 'style.css'), STYLE);
writeFileSync(join(outDir, '.nojekyll'), '');

console.log(`Built legal site into ${outDir}`);
for (const d of docs) console.log(`  ${d.out}`);
console.log('  index.html, style.css, .nojekyll');
