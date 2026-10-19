<template>
  <div v-if="tags.length" class="tag-cloud">
    <router-link
      v-for="t in tags"
      :key="t.tag"
      :to="{ name: 'search', query: { tag: t.tag } }"
      :title="`${t.count} post${t.count === 1 ? '' : 's'}`"
      class="text-black hover:text-blue-300 mx-1"
      :style="{ fontSize: size(t.count) }"
    >
      {{ t.tag }}
    </router-link>
  </div>
</template>

<script>
import { API_BASE } from '@/config'

// Tag cloud from GET /tags: font size scales with post count.
export default {
  name: 'TagCloud',
  data() {
    return { tags: [] } // [{tag, count}]
  },
  async created() {
    try {
      const res = await fetch(`${API_BASE}/tags`)
      if (res.ok) this.tags = await res.json()
    } catch (err) {
      console.error('Tag cloud error:', err) // optional widget; render nothing
    }
  },
  methods: {
    // 0.9rem (rarest) .. 2.2rem (most used), linear in count
    size(count) {
      const max = Math.max(...this.tags.map((t) => t.count))
      return `${0.9 + (1.3 * (count - 1)) / Math.max(max - 1, 1)}rem`
    },
  },
}
</script>
