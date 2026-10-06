<template>
  <div class="max-w-[800px] mx-auto px-4 sm:px-6 md:px-[50px] py-6 sm:py-8 md:py-[50px] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.4)] text-gray-800">
    <div v-if="loading" class="flex items-center justify-center py-20 text-gray-500 text-sm">
      Loading…
    </div>
    <div v-else-if="post">
      <!-- Title -->
      <h2 class="text-xl sm:text-2xl uppercase font-bold mb-4 text-left">
        {{ post.title }}
      </h2>

      <!-- Geotag -->
      <div v-if="geotag" class="mb-2">
        <a
          :href="geotag.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-black no-underline hover:underline"
        >
          @ {{ geotag.text }}
        </a>
      </div>

      <!-- Image -->
      <div class="pt-6 sm:pt-8 md:pt-[50px]">
        <figure class="aspect-square text-center">
          <div v-if="imageLoading" class="flex items-center justify-center text-sm sm:text-base text-gray-700">
            Fetching Image...
          </div>
          <img
            :src="post.imageUrl"
            alt="Post Image"
            class="w-full h-auto max-w-full sm:max-w-[800px] border border-gray-800 cursor-pointer transition-transform duration-300 ease-in-out hover:scale-[1.02] hover:shadow-[0_5px_15px_rgba(0,0,0,0.3)]"
            @load="onImageLoaded"
            @error="onImageError"
            v-show="!imageLoading"
            @click="openImageModal"
          />
          <figcaption v-show="!imageLoading" class="mt-1 text-xs text-center">
            {{ caption }}
          </figcaption>
        </figure>
      </div>

      <!-- Image Modal -->
      <div
        v-if="showImageModal"
        class="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50"
        @click="closeImageModal"
      >
        <div class="relative max-w-[95%] max-h-[95%] flex flex-col items-center">
          <div class="w-full flex justify-end mb-2">
            <button
              class="px-3 py-1 sm:px-4 sm:py-2 bg-white text-black font-bold text-sm sm:text-base rounded hover:bg-gray-100"
              @click="closeImageModal"
            >
              Close
            </button>
          </div>
          <img
            :src="post.imageUrl"
            alt="Full Resolution Image"
            class="max-w-full max-h-[calc(100vh-100px)] object-contain"
          />
        </div>
      </div>

      <!-- Toggle Buttons -->
      <div class="mt-5 flex flex-wrap gap-2 justify-center">
        <button
          @click="toggleExifData"
          class="px-2 py-1 sm:px-3 sm:py-2 text-xs border border-gray-300 bg-gray-100 rounded hover:bg-gray-200"
        >
          {{ showExifData ? 'Hide EXIF Data' : 'Show EXIF Data' }}
        </button>
        <button
          @click="toggleGeminiData"
          class="px-2 py-1 sm:px-3 sm:py-2 text-xs border border-gray-300 bg-gray-100 rounded hover:bg-gray-200"
        >
          {{ showGeminiData ? 'Hide AI Analysis' : 'AI Analysis' }}
        </button>
      </div>

      <!-- EXIF Viewer -->
      <div v-if="showExifData" class="mt-5 mb-5 p-4 border border-gray-300 rounded bg-gray-200">
        <ExifViewer :initialImageUrl="post.imageUrl" />
      </div>

      <!-- Gemini AI Viewer -->
      <div v-if="showGeminiData" class="mt-5 mb-5 p-4 border border-gray-300 rounded bg-gray-200">
        <GeminiViewer :initialImageUrl="post.imageUrl" />
      </div>

      <!-- Markdown Content -->
      <div class="pt-8 text-base sm:text-[1.2em] md:text-[1.4em] leading-relaxed">
        <div v-html="renderedContent"></div>
      </div>

      <!-- Tags -->
      <div class="mt-5 pt-5 border-t border-gray-200 text-xs flex flex-wrap items-center gap-2">
        <span class="font-bold pr-6 hover:text-blue-300">
          {{ date }}
        </span>
        <template v-for="(tag, index) in post.tags" :key="index">
          <span class="font-bold uppercase mx-1">
            <router-link class="text-black hover:text-blue-300" :to="{ name: 'search', query: { tag: tag.trim() } }">
              {{ tag.trim() }}
            </router-link>
          </span>
          <span v-if="index < post.tags.length - 1" class="text-gray-400 mx-1">|</span>
        </template>
      </div>

      <!-- Pagination Controls -->
      <div class="flex flex-wrap justify-between mt-10 gap-2 px-2 sm:px-5">
        <button
          @click="navigateToPrev"
          class="px-3 py-1 sm:px-4 sm:py-2 min-w-[80px] border border-black bg-gray-100 rounded hover:bg-gray-200 text-xs sm:text-sm"
          :disabled="!post.prev"
        >
          {{ '< 1' }}
        </button>
        <button
          @click="navigateToPreviousYear"
          class="px-3 py-1 sm:px-4 sm:py-2 min-w-[80px] border border-black bg-gray-100 rounded hover:bg-gray-200 text-xs sm:text-sm"
        >
          {{ '< 365' }}
        </button>
        <button
          @click="navigateToNextYear"
          class="px-3 py-1 sm:px-4 sm:py-2 min-w-[80px] border border-black bg-gray-100 rounded hover:bg-gray-200 text-xs sm:text-sm"
        >
          {{ '> 365' }}
        </button>
        <button
          @click="navigateToNext"
          class="px-3 py-1 sm:px-4 sm:py-2 min-w-[80px] border border-black bg-gray-100 rounded hover:bg-gray-200 text-xs sm:text-sm"
          :disabled="!post.next"
        >
          {{ '> 1' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { postStore } from '@/stores/posts'
import { marked } from 'marked'
import CryptoJS from 'crypto-js'
import ExifViewer from './ExifViewer.vue'
import GeminiViewer from './GeminiViewer.vue'
import { API_BASE } from '@/config'
import { splitGeotag } from '@/utils/geotag'

export default {
  name: 'BlogPost',
  components: {
    ExifViewer,
    GeminiViewer,
  },
  data() {
    return {
      date: this.$route.params.date,
      post: null,
      showExifData: false,
      showGeminiData: false,
      showImageModal: false,
      loading: false,
      imageLoading: true,
    }
  },

  computed: {
    geotag() {
      return splitGeotag(this.post?.content).geotag
    },
    renderedContent() {
      if (!this.post?.content) return ''
      return marked(splitGeotag(this.post.content).body)
    },
    caption() {
      if (!this.post?.content) return ''
      return CryptoJS.MD5(this.post.content).toString()
    },
  },

  watch: {
    '$route.params.date': {
      immediate: true,
      async handler(newDate) {
        if (newDate) {
          this.date = newDate
          this.imageLoading = true
          await this.loadPost(newDate)
        } else {
          this.post = null
        }
      },
    },
  },

  methods: {
    openImageModal() {
      this.showImageModal = true
      document.body.classList.add('modal-open')
    },
    closeImageModal() {
      this.showImageModal = false
      document.body.classList.remove('modal-open')
    },
    toggleExifData() {
      this.showExifData = !this.showExifData
    },
    toggleGeminiData() {
      this.showGeminiData = !this.showGeminiData
    },
    onImageLoaded() {
      this.imageLoading = false
    },
    onImageError() {
      this.imageLoading = false
    },

    async loadPost(date) {
      try {
        this.loading = true
        this.imageLoading = true
        const response = await fetch(`${API_BASE}/post/details/${date}`)
        if (!response.ok) throw new Error('error fetching post')
        const data = await response.json()
        this.post = data
        postStore.setCurrentPost(data)
      } catch (error) {
        alert(error.message + ` >> no post for ${date}`)
      } finally {
        this.loading = false
      }
    },

    navigateToPrev() {
      if (this.post?.prev) {
        this.$router.push({ name: 'post', params: { date: this.post.prev } })
      }
    },
    navigateToNext() {
      if (this.post?.next) {
        this.$router.push({ name: 'post', params: { date: this.post.next } })
      }
    },

    parseDateString() {
      const day = parseInt(this.date.slice(0, 2))
      const month = parseInt(this.date.slice(2, 4)) - 1
      const year = parseInt(this.date.slice(4, 8))
      return new Date(year, month, day)
    },
    formatDateStr(date) {
      return `${('0' + date.getDate()).slice(-2)}${('0' + (date.getMonth() + 1)).slice(-2)}${date.getFullYear()}`
    },
    navigateToNextYear() {
      const d = this.parseDateString()
      d.setFullYear(d.getFullYear() + 1)
      this.$router.push({ name: 'post', params: { date: this.formatDateStr(d) } })
    },
    navigateToPreviousYear() {
      const d = this.parseDateString()
      d.setFullYear(d.getFullYear() - 1)
      this.$router.push({ name: 'post', params: { date: this.formatDateStr(d) } })
    },
  },
}
</script>
