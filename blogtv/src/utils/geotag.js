// A geotag is a lone [text](url) on the first non-blank line of the content
// (metadata already removed). Any URL is accepted.
const GEOTAG_RE = /^\s*\[([^\]]+)\]\(([^\s)]+)\)[ \t]*(?:\r?\n|$)/

export function splitGeotag(content) {
  const m = (content || '').match(GEOTAG_RE)
  if (!m) return { geotag: null, body: content || '' }
  return { geotag: { text: m[1], url: m[2] }, body: content.slice(m[0].length).trim() }
}
