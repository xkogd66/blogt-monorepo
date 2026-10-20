<template>
  <div class="gemini-vision-viewer">
    <div v-if="error" class="error">
      {{ error }}
    </div>

    <div class="gemini-eye">
      <div v-if="loading" class="loading-container">
        <div class="loading-spinner"></div>
        <p class="loading-text">AI is analyzing the image...</p>
      </div>
      
      <div v-else-if="result" class="gemini-data">
        <div class="header-section">
          <h3>AI Analysis Result</h3>
          <span class="model-badge">Gemini 2.5 Flash</span>
          <button class="text-xs underline" @click.prevent="analyzeWithGemini(initialImageUrl)">Re-analyse</button>
        </div>

        <div class="data-group">
          <p><strong>Description:</strong> {{ result.description }}</p>
        </div>

        <div class="data-group collapsible">
          <div class="collapse-header" @click="showTags = !showTags">
            <p><strong>Tags:</strong></p>
            <span class="chevron" :class="{ 'open': showTags }">▼</span>
          </div>
          <div v-if="showTags" class="collapse-content">
            <div class="tag-cloud">
              <span v-for="tag in result.tags" :key="tag" class="tag">{{ tag }}</span>
            </div>
          </div>
        </div>

        <div v-if="result.objects && result.objects.length > 0" class="data-group collapsible">
          <div class="collapse-header" @click="showObjects = !showObjects">
            <p><strong>Detected Objects:</strong></p>
            <span class="chevron" :class="{ 'open': showObjects }">▼</span>
          </div>
          <div v-if="showObjects" class="collapse-content">
            <table>
              <thead>
                <tr>
                  <th>Object</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="obj in result.objects" :key="obj">
                  <td>{{ obj }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="result.text" class="data-group collapsible text-extraction">
          <div class="collapse-header" @click="showText = !showText">
            <p><strong>Extracted Text:</strong></p>
            <span class="chevron" :class="{ 'open': showText }">▼</span>
          </div>
          <div v-if="showText" class="collapse-content">
            <div class="extracted-text-box">
              {{ result.text }}
            </div>
          </div>
        </div>
      </div>
      
      <div v-else-if="!loading && !error" class="info-message">
        <div v-if="!result">
          <p class="mb-2">No analysis yet. Click to run AI analysis (on-demand only).</p>
          <div>
            <button
              class="px-3 py-1 sm:px-4 sm:py-2 bg-white text-black font-bold text-sm rounded border border-gray-300 hover:bg-gray-100"
              :disabled="loading || !initialImageUrl"
              @click.prevent="analyzeWithGemini(initialImageUrl)"
            >
              {{ loading ? 'Analyzing...' : 'Run AI Analysis' }}
            </button>
            <span v-if="!initialImageUrl" class="text-xs text-gray-500 ml-2">No image URL available.</span>
          </div>
        </div>
        <div v-else>
          <p class="mb-2">Analysis ready. Scroll up to view results.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { GoogleGenerativeAI } from '@google/generative-ai'
import { API_BASE } from '@/config'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || ''

export default {
  name: 'GeminiViewer',
  props: {
    date: {
      type: String,
      default: '',
    },
    initialImageUrl: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      result: null,
      loading: false,
      error: null,
      showObjects: false,
      showText: false,
      showTags: false,
    }
  },

  watch: {
    date: { immediate: true, handler: 'loadSaved' },
  },

  methods: {
    // Saved analysis lives in blogt-api; a miss (404) just means "not analysed yet".
    async loadSaved() {
      this.result = null
      if (!this.date) return
      try {
        const res = await fetch(`${API_BASE}/post/analysis/${this.date}`)
        if (res.ok) this.result = await res.json()
      } catch (e) {
        console.warn('Could not load saved analysis:', e)
      }
    },

    async analyzeWithGemini(url) {
      if (!API_KEY) {
        this.error = 'Gemini API Key is missing. Please set VITE_GEMINI_API_KEY in your environment.'
        return
      }

      this.loading = true
      this.error = null
      this.result = null
      this.showObjects = false
      this.showText = false
      this.showTags = false

      try {
        const genAI = new GoogleGenerativeAI(API_KEY)
        const model = genAI.getGenerativeModel({ 
          model: 'gemini-2.5-flash',
          generationConfig: { responseMimeType: "application/json" }
        })

        // Fetch the image and convert to base64
        const response = await fetch(url)
        const blob = await response.blob()
        const base64Data = await this.blobToData(blob)
        
        const prompt = `
          Analyze this image and provide a JSON response with:
          - "description": A natural, detailed description of what is happening in the image.
          - "tags": An array of at most 10 relevant keywords.
          - "objects": An array of main objects identified in the scene.
          - "text": Any text visible in the image (OCR). If none, an empty string.
          - "caption": A short, punchy one-sentence caption.
        `

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Data.split(',')[1],
              mimeType: blob.type && blob.type.includes('image') ? blob.type : 'image/jpeg'
            }
          }
        ])

        const textResponse = result.response.text()
        console.log('Gemini raw response:', textResponse)
        
        try {
          this.result = JSON.parse(textResponse)
        } catch (e) {
          // Fallback if JSON parsing fails
          this.result = {
            description: textResponse,
            tags: [],
            objects: [],
            text: ''
          }
        }

        // Persist so the next view skips Gemini; a failed save must not hide the result.
        if (this.date) {
          fetch(`${API_BASE}/post/analysis/${this.date}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.result),
          }).catch((e) => console.warn('Could not save analysis:', e))
        }

      } catch (err) {
        console.error('Gemini Analysis Error:', err)
        this.error = `Analysis failed: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    blobToData(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    },
  },
}
</script>

<style scoped>
.gemini-vision-viewer {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

.error {
  background-color: #fef2f2;
  color: #991b1b;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #fecaca;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-text {
  color: #6b7280;
  font-size: 0.875rem;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  padding-bottom: 0.5rem;
}

.header-section h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.model-badge {
  font-size: 0.75rem;
  background-color: #dbeafe;
  color: #1e40af;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-weight: 500;
}

.data-group {
  margin-bottom: 1.25rem;
}

.data-group p {
  margin: 0 0 0.5rem 0;
  font-size: 0.875rem;
  color: #374151;
}

.collapse-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 0.5rem 0;
}

.collapse-header:hover p {
  color: #3b82f6;
}

.chevron {
  font-size: 0.75rem;
  color: #9ca3af;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.collapse-content {
  padding-top: 0.5rem;
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag {
  background-color: #f3f4f6;
  color: #4b5563;
  padding: 0.25rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  border: 1px solid #e5e7eb;
}

.extracted-text-box {
  background-color: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  padding: 0.75rem;
  font-family: monospace;
  font-size: 0.8125rem;
  white-space: pre-wrap;
  color: #1f2937;
  max-height: 150px;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
  background: white;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

th {
  background-color: #f9fafb;
  text-align: left;
  padding: 0.625rem;
  border-bottom: 1px solid #e5e7eb;
  color: #4b5563;
  font-weight: 600;
}

dd
td {
  padding: 0.625rem;
  border-bottom: 1px solid #f3f4f6;
  color: #111827;
}

tr:last-child td {
  border-bottom: none;
}

.info-message {
  text-align: center;
  color: #9ca3af;
  font-size: 0.875rem;
  padding: 1rem;
}
</style>
