'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');


const PORT     = process.env.PORT || 3000;
const BASE     = (process.env.BASE_PATH || '').replace(/\/$/, '');
const DATA_DIR = path.join(__dirname, 'data');
const app      = express();

// ── Load blogs from JSON ────────────────────────────────────────────────────

const blogs = fs.readdirSync(DATA_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => {
    const blog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
    blog.posts = blog.posts.map(p => ({
      ...p,
      published: new Date(p.published),
      updated:   new Date(p.updated ?? p.published),
    }));
    return blog;
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

const blogsBySlug = Object.fromEntries(blogs.map(b => [b.slug, b]));

// Static assets (images copied by build.js)
app.use(express.static(path.join(__dirname, 'public')));

// ── Design tokens & CSS ─────────────────────────────────────────────────────

const CSS = `
:root {
  --bg:     #fafaf8;
  --text:   #1a1a1a;
  --muted:  #8a8a85;
  --faint:  #b8b7b0;
  --border: #e4e3dc;
  --col:    660px;
  --sans:   -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  --serif:  Georgia, "Times New Roman", serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--serif);
  font-size: 16px;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
a:hover { opacity: .7; }

.topnav {
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: .04em;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 6px;
}
.topnav a { text-decoration: none; color: var(--muted); }
.topnav a:hover { color: var(--text); opacity: 1; }
.topnav .sep { color: var(--faint); }
.topnav .current { color: var(--text); }

.wrap { max-width: var(--col); margin: 0 auto; padding: 56px 24px 96px; }

.home-eyebrow {
  font-family: var(--sans);
  font-size: 11px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 40px;
}
.blog-list { list-style: none; }
.blog-entry { padding: 22px 0; border-bottom: 1px solid var(--border); }
.blog-entry:first-child { border-top: 1px solid var(--border); }
.blog-entry-name { font-size: 22px; font-weight: bold; line-height: 1.2; margin-bottom: 5px; }
.blog-entry-name a { text-decoration: none; }
.blog-entry-name a:hover { text-decoration: underline; opacity: 1; }
.blog-entry-meta { font-family: var(--sans); font-size: 11px; color: var(--muted); display: flex; gap: 10px; }
.blog-entry-desc { margin-top: 5px; font-size: 14px; font-style: italic; color: var(--muted); }

.blog-index-heading { margin-bottom: 44px; }
.blog-index-heading h1 { font-size: 30px; font-weight: bold; line-height: 1.2; margin-bottom: 8px; }
.blog-index-heading .desc { font-size: 14px; font-style: italic; color: var(--muted); }

.post-list { list-style: none; }
.year-group { margin-top: 36px; }
.year-label {
  font-family: var(--sans);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--faint);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
}
.post-item { display: grid; grid-template-columns: 96px 1fr; gap: 0 16px; padding: 10px 0; border-bottom: 1px solid var(--border); align-items: baseline; }
.post-item-date { font-family: var(--sans); font-size: 11px; color: var(--muted); padding-top: 2px; }
.post-item-title { font-size: 15px; }
.post-item-title a { text-decoration: none; }
.post-item-title a:hover { text-decoration: underline; opacity: 1; }
.post-item-title.untitled a { color: var(--muted); font-style: italic; }
.post-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 4px; }
.post-tag { font-family: var(--sans); font-size: 10px; color: var(--muted); border: 1px solid var(--border); padding: 1px 6px; border-radius: 2px; }

.post-header { margin-bottom: 28px; }
.post-title { font-size: 30px; font-weight: bold; line-height: 1.25; margin-bottom: 20px; }
.post-title.untitled { color: var(--muted); font-style: italic; }
.post-rule { border: none; border-top: 1px solid var(--border); margin-bottom: 16px; }
.post-byline { font-family: var(--sans); font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.post-byline-tags { display: flex; gap: 5px; flex-wrap: wrap; }
.post-body { font-size: 15px; line-height: 1.85; }
.post-body img { max-width: 100%; height: auto; display: block; margin: 8px 0; }

.post-nav { margin-top: 52px; padding-top: 20px; border-top: 1px solid var(--border); display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-family: var(--sans); }
.post-nav-newer { text-align: left; }
.post-nav-older  { text-align: right; }
.post-nav-label { display: block; font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); margin-bottom: 4px; }
.post-nav a { font-size: 13px; text-decoration: none; color: var(--text); display: block; }
.post-nav a:hover { text-decoration: underline; opacity: 1; }
`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function localise(html) {
  if (!BASE) return html;
  return html.replace(/(src|href)="(\/images\/)/g, `$1="${BASE}$2`);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmtShort = d => d.toISOString().slice(0, 10);
const fmtLong  = d => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

function shell(title, crumbs, body) {
  const nav = crumbs.map(([label, href], i) => {
    const el = (i === crumbs.length - 1)
      ? `<span class="current">${esc(label)}</span>`
      : `<a href="${href}">${esc(label)}</a>`;
    return i === 0 ? el : `<span class="sep">/</span>${el}`;
  }).join(' ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <style>${CSS}</style>
</head>
<body>
<nav class="topnav">${nav}</nav>
<main class="wrap">${body}</main>
</body>
</html>`;
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const items = blogs.map(blog => {
    const first = blog.posts[0];
    const last  = blog.posts[blog.posts.length - 1];
    const span  = first && last
      ? `${last.published.getFullYear()}–${first.published.getFullYear()}` : '';
    const desc  = blog.description
      ? `<p class="blog-entry-desc">${esc(blog.description)}</p>` : '';
    return `<li class="blog-entry">
  <p class="blog-entry-name"><a href="${BASE}/${blog.slug}">${esc(blog.name)}</a></p>
  <p class="blog-entry-meta"><span>${blog.posts.length} posts</span>${span ? `<span>${span}</span>` : ''}</p>
  ${desc}
</li>`;
  }).join('\n');

  res.send(shell('archive', [['archive', BASE + '/']],
    `<p class="home-eyebrow">Archive</p><ul class="blog-list">${items}</ul>`));
});

app.get('/:blogSlug', (req, res) => {
  const blog = blogsBySlug[req.params.blogSlug];
  if (!blog) return res.status(404).send('Blog not found');

  const desc = blog.description ? `<p class="desc">${esc(blog.description)}</p>` : '';
  let html = '', currentYear = null, inGroup = false;

  for (const post of blog.posts) {
    const year = post.published.getFullYear();
    if (year !== currentYear) {
      if (inGroup) html += '</ul></div>';
      currentYear = year; inGroup = true;
      html += `<div class="year-group"><p class="year-label">${year}</p><ul class="post-list">`;
    }
    const url          = `${BASE}/${blog.slug}${post.filename}`;
    const titleClass   = post.title ? 'post-item-title' : 'post-item-title untitled';
    const displayTitle = post.title || '[untitled]';
    const tags         = post.categories.length
      ? `<p class="post-tags">${post.categories.map(t => `<span class="post-tag">${esc(t)}</span>`).join('')}</p>` : '';
    html += `<li class="post-item">
  <span class="post-item-date">${fmtShort(post.published)}</span>
  <div><p class="${titleClass}"><a href="${url}">${esc(displayTitle)}</a></p>${tags}</div>
</li>`;
  }
  if (inGroup) html += '</ul></div>';

  res.send(shell(blog.name, [['archive', BASE + '/'], [blog.name, `${BASE}/${blog.slug}`]],
    `<div class="blog-index-heading"><h1>${esc(blog.name)}</h1>${desc}</div>${html}`));
});

app.get('/:blogSlug/:year/:month/:postFile', (req, res) => {
  const blog = blogsBySlug[req.params.blogSlug];
  if (!blog) return res.status(404).send('Blog not found');

  const filename = `/${req.params.year}/${req.params.month}/${req.params.postFile}`;
  const idx      = blog.posts.findIndex(p => p.filename === filename);
  if (idx === -1) return res.status(404).send('Post not found');

  const post  = blog.posts[idx];
  const newer = blog.posts[idx - 1];
  const older = blog.posts[idx + 1];

  const navNewer = newer
    ? `<div class="post-nav-newer"><span class="post-nav-label">newer</span><a href="${BASE}/${blog.slug}${newer.filename}">${esc(newer.title || '[untitled]')}</a></div>`
    : '<div class="post-nav-newer"></div>';
  const navOlder = older
    ? `<div class="post-nav-older"><span class="post-nav-label">older</span><a href="${BASE}/${blog.slug}${older.filename}">${esc(older.title || '[untitled]')}</a></div>`
    : '<div class="post-nav-older"></div>';

  const tags = post.categories.length
    ? `<span class="post-byline-tags">${post.categories.map(t => `<span class="post-tag">${esc(t)}</span>`).join('')}</span>` : '';

  const postTitle  = post.title || '[untitled]';
  const titleClass = post.title ? 'post-title' : 'post-title untitled';

  res.send(shell(
    `${postTitle} — ${blog.name}`,
    [['archive', BASE + '/'], [blog.name, `${BASE}/${blog.slug}`], [postTitle, '']],
    `<article>
  <header class="post-header">
    <h1 class="${titleClass}">${esc(postTitle)}</h1>
    <hr class="post-rule">
    <p class="post-byline">
      <span>${fmtLong(post.published)}</span>
      ${post.author ? `<span>${esc(post.author)}</span>` : ''}
      ${tags}
    </p>
  </header>
  <div class="post-body">${localise(post.content)}</div>
  <nav class="post-nav">${navNewer}${navOlder}</nav>
</article>`));
});

app.listen(PORT, () => {
  const total = blogs.reduce((n, b) => n + b.posts.length, 0);
  console.log(`listening on http://localhost:${PORT}  (${blogs.length} blogs, ${total} posts)`);
});
