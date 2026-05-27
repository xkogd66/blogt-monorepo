#!/usr/bin/env node
'use strict';

// One-time build script. Run after downloading a new export: node build.js
//   Phase 1 – parse Blogger Atom feeds → data/*.json
//   Phase 2 – copy album images → public/images/<slug>/
//              rewrite CDN URLs in data/*.json to local paths

const fs   = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const ROOT       = path.join(__dirname, '..');
const DATA_DIR   = path.join(__dirname, 'data');
const PUBLIC_IMG = path.join(__dirname, 'public', 'images');

// ── Blog configuration ──────────────────────────────────────────────────────

const BLOGS = [
  {
    slug:        'white-weddings',
    name:        '[ white weddings ]',
    description: '',
    atomPath:    'tc-blogs/Blogger/Blogs/[ white weddings ]/feed.atom',
    albumPath:   'tc-blogs/Blogger/Albums/[ white weddings ]',
  },
  {
    slug:        'osboa',
    name:        'osboa',
    description: 'one song a week. for a year. cybernetically.',
    atomPath:    'tc-blogs/Blogger/Blogs/osboa/feed.atom',
    albumPath:   'tc-blogs/Blogger/Albums/osboa',
  },
  {
    slug:        'tayos-mobile-blog',
    name:        "tayo's mobile blog",
    description: '',
    atomPath:    "tc-blogs/Blogger/Blogs/Tayo_s Mobile Blog/feed.atom",
    albumPath:   "tc-blogs/Blogger/Albums/Tayo_s Mobile Blog",
  },
  {
    slug:        'mannequin-factory',
    name:        'the mannequin factory',
    description: '',
    atomPath:    'tc-blogs/Blogger/Blogs/the mannequin factory/feed.atom',
    albumPath:   'tc-blogs/Blogger/Albums/the mannequin factory',
  },
  {
    slug:        'a-mean-idea',
    name:        '[ a mean idea to call my own ]',
    description: '',
    atomPath:    'xingu-blogs/Blogger/Blogs/[ a mean idea to call my own ]/feed.atom',
    albumPath:   'xingu-blogs/Blogger/Albums/[ a mean idea to call my own ]',
  },
  {
    slug:        'sandgods-stoned',
    name:        'sandgods, stoned',
    description: '',
    atomPath:    'xingu-blogs/Blogger/Blogs/sandgods, stoned/feed.atom',
    albumPath:   'xingu-blogs/Blogger/Albums/sandgods, stoned',
  },
];

// Shared albums that may be referenced across any blog
const SHARED_ALBUM_PATHS = [
  'tc-blogs/Blogger/Albums/Blogger Pictures',
  'xingu-blogs/Blogger/Albums/Blogger Pictures',
  'tc-blogs/Blogger/Albums/mamom-xingu',
  'tc-blogs/Blogger/Albums/xhingu',
];

// ── Phase 1: parse Atom feeds ───────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray:             name => name === 'entry' || name === 'category',
  allowBooleanAttributes: true,
  processEntities:     false,
});

function decodeXmlEntities(str) {
  return String(str ?? '').replace(
    /&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#\d+);/g,
    (_, code) => {
      if (code === 'amp')  return '&';
      if (code === 'lt')   return '<';
      if (code === 'gt')   return '>';
      if (code === 'quot') return '"';
      if (code === 'apos') return "'";
      if (code.startsWith('#x')) return String.fromCharCode(parseInt(code.slice(2), 16));
      if (code.startsWith('#'))  return String.fromCharCode(parseInt(code.slice(1), 10));
      return `&${code};`;
    }
  );
}

function text(val) {
  const raw = val == null ? '' : typeof val === 'object' ? String(val['#text'] ?? '') : String(val);
  return decodeXmlEntities(raw);
}

function parseFeed(atomPath) {
  const xml  = fs.readFileSync(path.join(ROOT, atomPath), 'utf8');
  const feed = parser.parse(xml)?.feed ?? {};

  return (feed.entry ?? [])
    .filter(e => text(e['blogger:status']) === 'LIVE' && text(e['blogger:type']) === 'POST')
    .map(entry => {
      const filename      = text(entry['blogger:filename']);
      const [, year, month] = filename.match(/^\/(\d{4})\/(\d{2})\//) ?? [];
      const publishedRaw  = entry.published ?? entry['blogger:created'];
      const published     = publishedRaw ? new Date(text(publishedRaw)).toISOString() : null;
      const updated       = entry.updated ? new Date(text(entry.updated)).toISOString() : published;
      const categories    = (entry.category ?? [])
        .filter(c => c?.['@_term']).map(c => c['@_term']);

      return {
        title:      text(entry.title),
        filename,
        year:       year  ?? '',
        month:      month ?? '',
        published,
        updated,
        author:     text(entry.author?.name),
        categories,
        content:    text(entry.content),
      };
    })
    .sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));
}

// ── Phase 2: image index + URL rewriting ────────────────────────────────────

// Google Takeout stores duplicates as name(1).ext, name(2).ext etc (no space).
// CDN URLs store the original uploaded filename, URL-encoded, with + for space.
// Normalise both sides the same way so they compare equal.
function normaliseName(raw) {
  let s = raw;
  // URL-decode up to twice (some filenames are double-encoded in CDN paths)
  try { s = decodeURIComponent(s); } catch {}
  try { s = decodeURIComponent(s); } catch {}
  return s
    .toLowerCase()
    .replace(/\+/g, ' ')   // + means space in Blogger CDN paths
    .replace(/ \(/g, '('); // "photo (1).jpg" → "photo(1).jpg" = Takeout convention
}

// Build a map  normalised-name → local filesystem path  for one directory.
function indexAlbum(relPath) {
  const dir = path.join(ROOT, relPath);
  if (!fs.existsSync(dir)) return new Map();
  const map = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.json')) continue;
    const full = path.join(dir, file);
    if (!fs.statSync(full).isFile()) continue;
    const key = normaliseName(file);
    if (!map.has(key)) map.set(key, full); // keep first match on collision
  }
  return map;
}

// Copy a file only if dest doesn't exist yet, return the dest path.
function copyOnce(src, destDir, filename) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, filename);
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  return dest;
}

const CDN_RE = /https?:\/\/blogger\.googleusercontent\.com\/[^\s"'<>)\\]+/g;

// Rewrite all CDN image URLs in an HTML string.
// Returns { html, matched, missed } where missed is an array of unresolved URLs.
function rewriteContent(html, imageIndex, destDir, urlBase) {
  let matched = 0, missed = [];
  const result = html.replace(CDN_RE, url => {
    const seg      = url.split('/').pop().split('?')[0]; // last path segment
    const normSeg  = normaliseName(seg);
    const srcPath  = imageIndex.get(normSeg);
    if (!srcPath) {
      missed.push(url);
      return url; // leave CDN URL intact
    }
    const outName = path.basename(srcPath); // keep original on-disk filename
    copyOnce(srcPath, destDir, outName);
    matched++;
    return `${urlBase}/${outName}`;
  });
  return { html: result, matched, missed };
}

// ── Main ────────────────────────────────────────────────────────────────────

fs.mkdirSync(DATA_DIR,   { recursive: true });
fs.mkdirSync(PUBLIC_IMG, { recursive: true });

// Build shared image index once
const sharedIndex = new Map();
for (const rel of SHARED_ALBUM_PATHS) {
  for (const [k, v] of indexAlbum(rel)) {
    if (!sharedIndex.has(k)) sharedIndex.set(k, v);
  }
}

console.log('\nPhase 1 — parsing Atom feeds');
let totalPosts = 0;
for (const blog of BLOGS) {
  const posts = parseFeed(blog.atomPath);
  const out   = { name: blog.name, slug: blog.slug, description: blog.description, posts };
  fs.writeFileSync(path.join(DATA_DIR, `${blog.slug}.json`), JSON.stringify(out, null, 2), 'utf8');
  console.log(`  ${blog.slug}.json  (${posts.length} posts)`);
  totalPosts += posts.length;
}
console.log(`  total: ${totalPosts} posts\n`);

console.log('Phase 2 — copying images & rewriting CDN URLs');
let totalMatched = 0, totalMissed = 0;

for (const blog of BLOGS) {
  // Build this blog's image index (own album first, then shared)
  const ownIndex = indexAlbum(blog.albumPath);
  const imageIndex = new Map([...sharedIndex, ...ownIndex]); // own takes priority

  const destDir = path.join(PUBLIC_IMG, blog.slug);
  const urlBase = `/images/${blog.slug}`;

  const jsonPath = path.join(DATA_DIR, `${blog.slug}.json`);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  let blogMatched = 0, blogMissed = 0;
  data.posts = data.posts.map(post => {
    const { html, matched, missed } = rewriteContent(post.content, imageIndex, destDir, urlBase);
    blogMatched += matched;
    blogMissed  += missed.length;
    return { ...post, content: html };
  });

  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

  // Also copy every image in the album regardless of whether it's referenced
  // in a post — so nothing is left behind in the original folders.
  for (const [, srcPath] of ownIndex) {
    copyOnce(srcPath, destDir, path.basename(srcPath));
  }

  const pct = blogMatched + blogMissed > 0
    ? Math.round(100 * blogMatched / (blogMatched + blogMissed)) : 100;
  console.log(`  ${blog.slug}:  ${blogMatched} URLs rewritten, ${blogMissed} unresolved  (${pct}% local)`);
  totalMatched += blogMatched;
  totalMissed  += blogMissed;
}

// Copy shared images too so they live in public/
const sharedDest = path.join(PUBLIC_IMG, 'shared');
for (const [, srcPath] of sharedIndex) {
  copyOnce(srcPath, sharedDest, path.basename(srcPath));
}

const totalPct = totalMatched + totalMissed > 0
  ? Math.round(100 * totalMatched / (totalMatched + totalMissed)) : 100;
console.log(`\n  overall: ${totalMatched} rewritten, ${totalMissed} still on CDN  (${totalPct}% local)`);
console.log('\ndone — images in server/public/images/');
