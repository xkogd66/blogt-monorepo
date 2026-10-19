<template>
  <div class="blog-search">
    <!-- Title -->
    <h3 v-if="searchTag" class="page-title">Search Results for Tag: {{ searchTag }}</h3>

    <!-- Default State -->
    <div v-if="!searchTag && !loading" class="text-center py-4 text-gray-600">
      <p>Enter a tag to start searching{{ cloud.length ? ', or pick one:' : '.' }}</p>
      <!-- Tag cloud: font size scales with post count -->
      <div class="tag-cloud mt-4">
        <router-link
          v-for="t in cloud"
          :key="t.tag"
          :to="{ name: 'search', query: { tag: t.tag } }"
          :title="`${t.count} post${t.count === 1 ? '' : 's'}`"
          class="text-black hover:text-blue-300 mx-2"
          :style="{ fontSize: cloudSize(t.count) }"
        >
          {{ t.tag }}
        </router-link>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="text-center py-4">Loading results...</div>

    <!-- Error State -->
    <div v-else-if="error" class="text-red-600 py-4">
      {{ error }}
    </div>

    <!-- Results Table -->
    <div v-else-if="searchResults.length" class="search-results">
      <table class="custom-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Post Title</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="post in paginatedResults" :key="post.date">
            <td>
              <a @click.prevent="loadPost(post.date)" class="link-style">
                {{ formatDate(post.date) }}
              </a>
            </td>
            <td>
              <a @click.prevent="loadPost(post.date)" class="link-style">
                {{ formatTitle(post.title) }}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- No Results State -->
    <div v-else-if="searchTag" class="text-center py-4 text-gray-600">
      No posts found for tag "{{ searchTag }}"
    </div>

    <!-- Pagination -->
    <div v-if="searchResults.length" class="pagination mt-4">
      <div class="pagination-info">
        Showing {{ startIndex + 1 }}-{{ endIndex }} of {{ searchResults.length }} results
      </div>
      <div class="pagination-controls">
        <button @click="currentPage--" :disabled="currentPage === 1" class="pagination-btn">
          Previous
        </button>
        <span class="pagination-page-info">Page {{ currentPage }} of {{ totalPages }}</span>
        <button @click="currentPage++" :disabled="currentPage === totalPages" class="pagination-btn">
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import moment from 'moment'
import { API_BASE } from '@/config'

export default {
  name: 'BlogSearch',
  data() {
    return {
      searchTag: this.$route.query.tag || '', // Set the initial tag from the route
      searchResults: [],
      cloud: [], // [{tag, count}] for the tag cloud
      loading: false,
      error: null,
      currentPage: 1,
      resultsPerPage: 10,
    }
  },
  computed: {
    totalPages() {
      return Math.ceil(this.searchResults.length / this.resultsPerPage)
    },
    paginatedResults() {
      const start = (this.currentPage - 1) * this.resultsPerPage
      const end = start + this.resultsPerPage
      return this.searchResults.slice(start, end)
    },
    startIndex() {
      return (this.currentPage - 1) * this.resultsPerPage
    },
    endIndex() {
      return Math.min(this.startIndex + this.resultsPerPage, this.searchResults.length)
    },
  },
  watch: {
    '$route.query.tag': function (newTag) {
      this.searchTag = newTag || ''
      if (this.searchTag) {
        this.performSearch()
      }
    },
  },
  created() {
    if (this.searchTag) {
      this.performSearch()
    }
    this.loadCloud()
  },
  methods: {
    async loadCloud() {
      try {
        const res = await fetch(`${API_BASE}/tags`)
        if (res.ok) this.cloud = await res.json()
      } catch (err) {
        console.error('Tag cloud error:', err) // cloud is optional; search still works
      }
    },
    // 0.9rem (rarest) .. 2.2rem (most used), linear in count
    cloudSize(count) {
      const max = Math.max(...this.cloud.map((t) => t.count))
      return `${0.9 + (1.3 * (count - 1)) / Math.max(max - 1, 1)}rem`
    },
    async performSearch() {
      this.loading = true;
      this.error = null;
      try {
        console.log('Performing search for tag:', this.searchTag);
        const response = await fetch(
          `${API_BASE}/tags/${encodeURIComponent(this.searchTag)}`,
        );
        console.log('Response:', response);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.searchResults = await response.json();

        // Sort the search results by date in ascending order
        this.searchResults.sort((a, b) => {
          // Use moment.js for reliable date parsing and comparison
          const dateA = moment(a.date, 'DDMMYYYY');
          const dateB = moment(b.date, 'DDMMYYYY');
          return dateA.valueOf() - dateB.valueOf(); // Sort in ascending order
        });

      } catch (err) {
        this.error = 'Failed to fetch search results. Please try again later.';
        console.error('Search error:', err);
      } finally {
        this.loading = false;
      }
    },

    formatDate(dateStr) {
      if (!dateStr) return '';
      const momentDate = moment(dateStr, 'DDMMYYYY');
      const dayWithSuffix = momentDate.format('Do'); // 'Do' gives the day with ordinal suffix
      const month = momentDate.format('MMMM');
      const year = momentDate.format('YYYY');
      console.log(`DATE FORMATED AS: ${dayWithSuffix} of ${month}, ${year}`)
      return `${dayWithSuffix} of ${month}, ${year}`;/*
      const day = dateStr.substring(0, 2) // DD
      const month = dateStr.substring(2, 4) // MM
      const year = dateStr.substring(4, 8) // YYYY
      return `${day}${month}${year}` // Return in DDMMYYYY format
      */
    },

    async loadPost(date) {
      console.log('Loading post for date:', date)
      this.$router.push({
        name: 'post', // Route name, case-sensitive
        params: { date }, // Pass the `date` parameter
      })
    },
    formatTitle(title) {
      return title
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
    },
  },
}
</script>

<style scoped>
/* Page header styling */
.page-title {
  width: 80%;
  margin: 0 auto 40px;
  font-size: 1.25rem; /* Changed from 20px to 1.25rem */
  font-weight: bold;
  text-align: center;
  color: #333;
}

/* Search input controls */
.manual-search {
  display: flex;
  justify-content: center;
  margin-bottom: 20px;
  gap: 10px;
}

.search-input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 250px;
}

.search-button {
  padding: 8px 16px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.search-button:hover {
  background-color: #0056b3;
}

/* Results table styling */
.custom-table {
  width: 80%;
  margin: 0 auto;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.75rem; /* Changed from 12px to 0.75rem */
}

.custom-table th,
.custom-table td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-table th {
  background-color: #d6d6d6;
  color: #333;
  font-weight: bold;
}

.custom-table tbody tr:hover {
  background-color: #f1f1f1;
}

.custom-table tbody tr:nth-child(odd) {
  background-color: #f9f9f9;
}

.custom-table tbody tr:nth-child(even) {
  background-color: #ffffff;
}

/* Pagination controls */
.pagination {
  width: 80%;
  margin: 20px auto 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.625rem; /* Changed from 10px to 0.625rem */
  color: #333;
}

.pagination-info {
  font-size: 0.875rem; /* Changed from 14px to 0.875rem */
  color: #555;
}

.pagination-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.pagination-btn {
  padding: 8px 16px;
  border: 1px solid #ccc;
  background-color: #f9f9f9;
  color: #333;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.pagination-btn:hover {
  background-color: #e2e2e2;
}

.pagination-btn:disabled {
  background-color: #f5f5f5;
  color: #aaa;
  cursor: not-allowed;
}

.pagination-page-info {
  font-weight: bold;
  color: #444;
}

/* Link styling */
.link-style {
  color: black;
  text-decoration: none;
  cursor: pointer; /* Moved up from hover state */
}

.link-style:hover {
  text-decoration: underline;
}

/* Responsive layout adjustments */
@media screen and (max-width: 768px) {
  .pagination {
    flex-direction: column;
    gap: 15px;
  }

  .pagination-info {
    text-align: center;
    width: 100%;
  }

  .pagination-controls {
    width: 100%;
    justify-content: center;
  }
}
</style>
