<template>
  <div class="max-w-[800px] mx-auto px-4 sm:px-6 md:px-8 py-6">
    <div
      v-for="(post, index) in posts"
      :key="index"
      class="mb-10 bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.4)] overflow-hidden"
    >
      <!-- Title & Geotag (moved above image) -->
      <div class="px-4 sm:px-6 md:px-8 pt-6">
        <h2 class="text-lg sm:text-xl md:text-2xl uppercase font-bold mb-2 text-gray-900">
          {{ extractTitle(post) }}
        </h2>
        <p v-if="extractGeotag(post)" class="text-xs text-black mb-4">
          <a
            :href="extractGeotag(post)?.url"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:underline"
          >
            @ {{ extractGeotag(post)?.text }}
          </a>
        </p>
      </div>

      <!-- Image -->
      <div class="w-full aspect-square flex items-center justify-center p-4">
        <img
          :src="getImageUrl(post)"
          alt="Post Image"
          class="w-full h-auto max-w-full border border-gray-800 object-contain"
        />
      </div>
      <p class="text-xs text-center text-gray-600 px-4 pb-2">
        {{ calculateCaption(post) }}
      </p>

      <!-- Markdown Content -->
      <div
        class="px-4 sm:px-6 md:px-8 text-[0.85rem] sm:text-base md:text-[1.1em] leading-relaxed text-gray-800"
      >
        <div v-html="renderMarkdown(removeGeotag(removeMetadata(post)))"></div>
      </div>

      <!-- Tags -->
      <div
        class="mt-6 px-4 sm:px-6 md:px-8 pt-4 pb-6 border-t border-gray-200 text-[0.5rem] sm:text-xs flex flex-wrap items-center gap-2"
      >
        <router-link
          :to="{ name: 'post', params: { date: extractDate(post) } }"
          class="font-bold whitespace-nowrap hover:text-blue-300"
          @click="setPost(post)"
        >
          {{ extractDate(post) }}
        </router-link>

        <template v-for="(tag, i) in extractTags(post).split(',')" :key="i">
          <span class="uppercase font-bold mx-1 whitespace-nowrap">
            <router-link
              :to="{ name: 'search', query: { tag: tag.trim() } }"
              class="text-black hover:text-blue-300"
            >
              {{ tag.trim() }}
            </router-link>
          </span>
          <span v-if="i < extractTags(post).split(',').length - 1" class="text-gray-400 mx-1"
            >|</span
          >
        </template>
      </div>
    </div>

    <!-- Initial load indicator -->
    <div
      v-if="isLoading && posts.length === 0"
      class="flex justify-center items-center mt-10 mb-16"
    >
      <span class="text-sm text-gray-600">Loading posts...</span>
    </div>

    <!-- Error state -->
    <div v-if="error && posts.length === 0" class="flex flex-col items-center mt-10 mb-16 gap-4">
      <p class="text-sm text-red-600">{{ error }}</p>
      <button
        @click="fetchFirstPage"
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
      >
        Retry
      </button>
    </div>

    <!-- Infinite scroll sentinel: observed to trigger loading the next chunk -->
    <div ref="sentinel" class="h-px w-full" aria-hidden="true"></div>

    <!-- Load-more status -->
    <div v-if="posts.length > 0" class="flex justify-center items-center mt-10 mb-16">
      <div v-if="isLoading" class="flex items-center gap-2 text-sm text-gray-600">
        <span
          class="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"
        ></span>
        Loading more posts...
      </div>
      <p v-else-if="error" class="text-sm text-red-600 flex items-center gap-4">
        {{ error }}
        <button
          @click="loadMore"
          class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
        >
          Retry
        </button>
      </p>
      <p v-else-if="hasMore" class="text-sm text-gray-500">Scroll for more posts</p>
      <p v-else class="text-sm text-gray-500">You have reached the end.</p>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted, reactive, nextTick } from 'vue'
import { marked } from 'marked'
import { postStore } from '@/stores/posts'
import CryptoJS from 'crypto-js'
import { API_BASE, MEDIA_BASE } from '@/config'

export default {
  name: 'BlogPosts',
  setup() {
    const posts = ref([])
    const nextCursor = ref(null)
    const isLoading = ref(false)
    const hasMore = ref(true)
    const error = ref('')
    const sentinel = ref(null)
    const flippedCards = reactive({}) // Track flipped state for each card

    let observer = null

    const toggleFlip = (index) => {
      flippedCards[index] = !flippedCards[index]
      console.log(`Toggled card ${index} to ${flippedCards[index] ? 'flipped' : 'unflipped'}`)
    }

    const extractTitle = (post) => {
      const titleMatch = post.match(/^Title:\s*(.+)$/m)
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled'
      return title
    }

    const calculateCaption = (post) => {
      const MD5Caption = CryptoJS.MD5(post).toString()
      return MD5Caption
    }
    const removeMetadata = (post) => {
      const cleanedPost = post.replace(/^(Date:.*|Tags:.*|Title:.*)$/gm, '').trim()
      return cleanedPost
    }

    const extractTags = (post) => {
      const tagsMatch = post.match(/^Tags:\s*(.+)$/m)
      const tags = tagsMatch ? tagsMatch[1].trim() : 'No Tags'
      return tags
    }

    const extractGeotag = (post) => {
      const cleanedPost = removeMetadata(post)
      const geotagMatch = cleanedPost.match(/\[(.*?)\]\((https:\/\/maps\.app\.goo\.gl\/[^\s)]+)\)/)
      return geotagMatch
        ? {
            text: geotagMatch[1],
            url: geotagMatch[2],
          }
        : null
    }

    const removeGeotag = (content) => {
      return content
        .replace(/\[.*?\]\(https:\/\/maps\.app\.goo\.gl\/[^\s)]+\)\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    const extractDate = (post) => {
      const dateMatch = post.match(/^Date:\s*(\d{2})(\d{2})(\d{4})$/m)
      return dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : null
    }

    const renderMarkdown = (markdown) => {
      return marked(markdown)
    }

    const getImageUrl = (post) => {
      const dateMatch = post.match(/^Date:\s*(\d{2})(\d{2})(\d{4})$/m)
      if (dateMatch) {
        const day = dateMatch[1]
        const month = dateMatch[2]
        const year = dateMatch[3]
        let dateUrl = `${MEDIA_BASE}/blotpix/${year}/${month}/${day}.jpeg`
        return dateUrl
      }
      console.error('Invalid Date format in metadata:', post)
      return ''
    }

    /**
     * Loads the latest 10 posts, replacing any posts already rendered.
     */
    const fetchFirstPage = async () => {
      isLoading.value = true
      error.value = ''
      hasMore.value = true

      try {
        console.log('fetch latest posts...')
        const response = await fetch(`${API_BASE}/post`)
        if (!response.ok) {
          throw new Error('Failed to fetch first page posts')
        }
        const data = await response.json()
        posts.value = data
        // Cursor for the next batch: the second-to-last post, i.e. a real post date that
        // is strictly older than the newest post on screen (see `loadMore`).
        const cursorPost = data[data.length - 2] ?? data[data.length - 1]
        if (cursorPost) {
          nextCursor.value = extractDate(cursorPost)
          console.log('first page > Next cursor:', nextCursor.value)
        } else {
          hasMore.value = false
        }
      } catch (err) {
        console.error('Error fetching first page posts:', err)
        error.value = 'Could not load posts. Please try again.'
      } finally {
        isLoading.value = false
      }
    }

    /**
     * Appends the next batch of posts, walking backwards through the archive.
     *
     * `GET /posts/from/:ddmmyyyy` returns up to 10 posts starting at that date and
     * stepping back through *existing* post dates only (blogt-api `getPostsArray` +
     * `getPrev`). Two consequences drive the cursor handling below:
     *
     *  - A cursor must be a date that actually has a post. The API feeds the cursor
     *    through `getPrev`, which returns nothing for a date it cannot find, ending the
     *    batch immediately — hence never walk by calendar arithmetic.
     *  - The cursor must be strictly older than the newest loaded post, otherwise the
     *    batch starts on a post already on screen and yields a single, duplicate entry.
     *
     * The cursor is therefore the second-to-last loaded post's date, which is both a
     * real post date and guaranteed older than the last one. Posts already rendered are
     * filtered out so the boundary entry is never duplicated.
     */
    const loadMore = async () => {
      if (isLoading.value || !hasMore.value || !nextCursor.value) return

      isLoading.value = true
      error.value = ''

      try {
        const dateToFetch = nextCursor.value
        console.log('loadMore > Will Fetch:', dateToFetch)

        const response = await fetch(`${API_BASE}/posts/from/${dateToFetch}`)
        if (!response.ok) {
          throw new Error('Failed to fetch next posts')
        }
        const data = await response.json()

        const existing = new Set(posts.value)
        const newPosts = data.filter((post) => !existing.has(post))

        if (newPosts.length === 0) {
          hasMore.value = false
          return
        }

        posts.value = [...posts.value, ...newPosts]

        // Step the cursor back to an older, existing post date.
        const previousDate = posts.value[posts.value.length - 2]
        const cursor = previousDate ? extractDate(previousDate) : null

        if (!cursor || cursor === nextCursor.value) {
          // No older post to anchor on: the archive is exhausted.
          hasMore.value = false
          return
        }

        nextCursor.value = cursor
        console.log('loadMore > Next cursor:', nextCursor.value)
      } catch (err) {
        console.error('Error fetching next posts:', err)
        error.value = 'Could not load more posts. Please try again.'
      } finally {
        isLoading.value = false
      }
    }

    const stopObserver = () => {
      if (observer) {
        observer.disconnect()
        observer = null
      }
    }

    const startObserver = async () => {
      stopObserver()
      await nextTick()
      if (!sentinel.value) return

      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            loadMore()
          }
        },
        { rootMargin: '600px 0px' },
      )
      observer.observe(sentinel.value)
    }

    onMounted(async () => {
      await fetchFirstPage()
      startObserver()
    })

    onUnmounted(stopObserver)

    return {
      posts,
      extractTitle,
      removeMetadata,
      extractTags,
      renderMarkdown,
      getImageUrl,
      extractGeotag,
      removeGeotag,
      fetchFirstPage,
      loadMore,
      extractDate,
      isLoading,
      hasMore,
      error,
      sentinel,
      calculateCaption,
      flippedCards,
      toggleFlip,
    }
  },

  methods: {
    setPost(post) {
      postStore.setCurrentPost(post)
    },
  },
}
</script>
