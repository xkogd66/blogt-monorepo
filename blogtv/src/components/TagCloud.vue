<template>
  <div ref="box" class="tag-cloud" :style="{ height: height + 'px' }">
    <span
      v-for="p in placed"
      :key="p.text"
      class="word"
      :style="{ left: p.x + 'px', top: p.y + 'px', width: p.w + 'px', height: p.h + 'px' }"
    >
      <router-link
        :to="{ name: 'search', query: { tag: p.text } }"
        :title="`${p.count} post${p.count === 1 ? '' : 's'}`"
        class="hover:text-blue-300"
        :style="{
          fontSize: p.size + 'px',
          color: shade(p.t),
          transform: p.vertical ? 'translate(-50%, -50%) rotate(-90deg)' : undefined,
        }"
      >
        {{ p.text }}
      </router-link>
    </span>
  </div>
</template>

<script>
import { API_BASE } from '@/config'
import { layoutCloud } from '@/utils/cloudLayout'

// Word cloud from GET /tags: the `limit` most-used tags packed into the box,
// size and darkness scale with post count.
export default {
  name: 'TagCloud',
  props: {
    limit: { type: Number, default: 60 },
    height: { type: Number, default: 420 },
  },
  data() {
    return { tags: [], placed: [], width: 0 } // tags: [{text, count}]
  },
  async mounted() {
    try {
      const res = await fetch(`${API_BASE}/tags`)
      if (res.ok) this.tags = (await res.json()).map((t) => ({ text: t.tag, count: t.count }))
    } catch (err) {
      console.error('Tag cloud error:', err) // optional widget; render nothing
    }
    await document.fonts.load('700 20px Lato').catch(() => {}) // measure with the real font
    this.observer = new ResizeObserver(() => {
      if (this.$refs.box.offsetWidth !== this.width) this.relayout()
    })
    this.observer.observe(this.$refs.box)
  },
  beforeUnmount() {
    this.observer?.disconnect()
  },
  methods: {
    relayout() {
      this.width = this.$refs.box.offsetWidth
      const top = [...this.tags].sort((a, b) => b.count - a.count).slice(0, this.limit)
      this.placed = top.length && this.width ? layoutCloud(top, this.width, this.height) : []
    },
    // light grey (rare) -> black (most used), matching the blog's black-on-white look
    shade(t) {
      return `hsl(0 0% ${62 - 54 * Math.sqrt(t)}%)`
    },
  },
}
</script>

<style scoped>
.tag-cloud {
  position: relative;
  width: 100%;
}
.word {
  position: absolute;
}
.word a {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  white-space: nowrap;
  line-height: 1;
  font-weight: 700;
  text-decoration: none;
}
</style>
