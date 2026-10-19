// Packs words into a W x H box: biggest first, each placed on the first free spot
// along an outward spiral (bounding-box collisions, no dependencies).
// words: [{text, count, ...}] -> placed: [{...word, size, x, y, w, h, vertical}]
// A word that cannot be placed is shrunk 10% at a time down to minSize, then dropped.
export function layoutCloud(words, W, H, { font = 'Lato, Helvetica, Arial, sans-serif', pad = 3 } = {}) {
  const minSize = Math.max(10, H * 0.026)
  const maxSize = H * 0.2
  const maxCount = Math.max(...words.map((w) => w.count))
  const ctx = document.createElement('canvas').getContext('2d')
  const placed = []
  const hits = (b) =>
    placed.some(
      (p) => b.x < p.x + p.w + pad && b.x + b.w + pad > p.x && b.y < p.y + p.h + pad && b.y + b.h + pad > p.y,
    )

  const sorted = [...words].sort((a, b) => b.count - a.count)
  sorted.forEach((word, i) => {
    const t = maxCount > 1 ? (word.count - 1) / (maxCount - 1) : 0
    const vertical = i > 2 && i % 4 === 0 // a few small words run vertically, like a classic word cloud
    for (let size = minSize + (maxSize - minSize) * Math.sqrt(t); size >= minSize; size *= 0.9) {
      ctx.font = `700 ${size}px ${font}`
      const textW = ctx.measureText(word.text).width
      const textH = size * 0.9
      const w = vertical ? textH : textW
      const h = vertical ? textW : textH
      for (let k = 0; k < 1500; k++) {
        const a = k * 0.12
        const r = 2.5 * a
        const b = {
          x: W / 2 + r * Math.cos(a) * (W / H) - w / 2,
          y: H / 2 + r * Math.sin(a) - h / 2,
          w,
          h,
        }
        if (b.x < 0 || b.y < 0 || b.x + w > W || b.y + h > H || hits(b)) continue
        placed.push({ ...word, ...b, size, vertical, t })
        return
      }
    }
  })
  return placed
}
