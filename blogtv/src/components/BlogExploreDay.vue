<template>
  <div class="explore-day">
    <h1>Explore Images by Day</h1>
    <div class="date-selector">
      <label>Select a day and month:</label>
      <div class="date-picker">
        <select v-model="selectedDay" class="day-picker">
          <option v-for="day in 31" :key="day" :value="day">{{ day.toString().padStart(2, '0') }}</option>
        </select>
        <select v-model="selectedMonth" class="month-picker">
          <option v-for="(month, index) in months" :key="index" :value="index + 1">{{ month }}</option>
        </select>
        <button class="explore-button" @click="fetchImages">Explore</button>
      </div>
    </div>

    <div class="loading" v-if="loading">Loading images...</div>

    <div v-if="!loading && images.length === 0 && hasSearched" class="no-images">
      <p>No images found for this date.</p>
    </div>

    <div class="images-grid" v-if="images.length > 0">
      <div class="image-card" v-for="(image, index) in images" :key="index" @click="openImage(image)">
        <div class="image-container">
          <img :src="image.url" crossorigin="anonymous" :alt="`Image from ${image.day}/${image.month}/${image.year}`" class="grid-image" />
        </div>
        <div class="image-year">{{ image.year }}</div>
      </div>
    </div>

    <!-- Pagination Controls -->
    <div class="pagination-controls" v-if="hasSearched">
      <button @click="goToPreviousDay" class="pagination-button">
        &lt; 1
      </button>
      <span class="current-date">{{ formattedCurrentDate }}</span>
      <button @click="goToNextDay" class="pagination-button">
        1 &gt;
      </button>
    </div>

    <!-- Image Modal -->
    <div v-if="showImageModal" class="image-modal" @click="closeImageModal">
      <div class="modal-content" @click.stop>
        <div class="close-button-container">
          <button class="close-modal-button" @click="closeImageModal">Close</button>
        </div>
        <img :src="selectedImage.url" crossorigin="anonymous" :alt="`Image from ${selectedImage.day}/${selectedImage.month}/${selectedImage.year}`" class="full-resolution-image" />
        <div class="image-date">
          <router-link :to="{ name: 'post', params: { date: formatDateForRoute(selectedImage) }}" class="view-post-link">
            View post from {{ selectedImage.day }}/{{ selectedImage.month }}/{{ selectedImage.year }}
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { MEDIA_BASE } from '@/config'

export default {
  name: 'BlogExploreDay',
  data() {
    return {
      selectedDay: new Date().getDate(),
      selectedMonth: new Date().getMonth() + 1,
      months: [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ],
      images: [],
      loading: false,
      hasSearched: false,
      showImageModal: false,
      selectedImage: null
    }
  },
  mounted() {
    // Initialize with today's day and month
    const today = new Date();
    this.selectedDay = today.getDate();
    this.selectedMonth = today.getMonth() + 1;

    // If day and month are provided in the URL query parameters, use them
    if (this.$route.query.day && this.$route.query.month) {
      this.selectedDay = parseInt(this.$route.query.day);
      this.selectedMonth = parseInt(this.$route.query.month);
      this.fetchImages();
    }
  },
  methods: {
    async fetchImages() {
      this.loading = true;
      this.hasSearched = true;
      this.images = [];

      try {
        // Calculate the range of years to check
        const currentYear = new Date().getFullYear();
        const startYear = 2010; // Assuming blog starts from 2010

        // Format day and month as two digits
        const day = this.selectedDay.toString().padStart(2, '0');
        const month = this.selectedMonth.toString().padStart(2, '0');

        // Update the URL query parameters for sharing
        this.$router.push({
          query: { day: this.selectedDay, month: this.selectedMonth }
        });

        // Process years one by one and display images as they load
        const allYears = [];
        for (let year = startYear; year <= currentYear; year++) {
          allYears.push(year);
        }

        // Process all years concurrently, but add to display as they complete
        const checkPromises = allYears.map(async (year) => {
          try {
            const result = await this.checkImageExists(day, month, year);
            if (result) {
              // Add the image to the display as soon as it's found
              this.images.push(result);
              // Sort images by year (newest first) whenever a new one is added
              this.images.sort((a, b) => b.year - a.year);
            }
          } catch (error) {
            console.error(`Error checking year ${year}:`, error);
          }
        });

        // Still wait for all checks to complete to remove the loader
        await Promise.all(checkPromises);
      } catch (error) {
        console.error('Error fetching images:', error);
      } finally {
        this.loading = false;
      }
    },

    async checkImageExists(day, month, year) {
      const imageUrl = `${MEDIA_BASE}/blotpix/${year}/${month}/${day}.jpeg`;

      try {
        // Create a new Image object to check if the image exists
        const img = new Image();
        img.crossOrigin = "anonymous";
        const imageLoadPromise = new Promise((resolve, reject) => {
          img.onload = () => resolve(true);
          img.onerror = () => reject(false);
        });

        img.src = imageUrl;

        // If the image loads successfully, return the image info
        await imageLoadPromise;
        return {
          url: imageUrl,
          day: day,
          month: month,
          year: year,
        };
      } catch (error) {
        // If the image doesn't exist, return null
        return null;
      }
    },

    openImage(image) {
      this.selectedImage = image;
      this.showImageModal = true;
      document.body.classList.add('modal-open');
    },

    closeImageModal() {
      this.showImageModal = false;
      document.body.classList.remove('modal-open');
    },

    formatDateForRoute(image) {
      return `${image.day}${image.month}${image.year}`;
    },

    goToPreviousDay() {
      // Create a date object from the current selection
      // Note: Month in JavaScript Date is 0-indexed, so we subtract 1
      const currentDate = new Date(new Date().getFullYear(), this.selectedMonth - 1, this.selectedDay);
      // Subtract one day
      currentDate.setDate(currentDate.getDate() - 1);
      // Update the selected values
      this.selectedDay = currentDate.getDate();
      this.selectedMonth = currentDate.getMonth() + 1; // Convert back to 1-indexed month
      this.fetchImages();
    },

    goToNextDay() {
      // Create a date object from the current selection
      // Note: Month in JavaScript Date is 0-indexed, so we subtract 1
      const currentDate = new Date(new Date().getFullYear(), this.selectedMonth - 1, this.selectedDay);
      // Add one day
      currentDate.setDate(currentDate.getDate() + 1);
      // Update the selected values
      this.selectedDay = currentDate.getDate();
      this.selectedMonth = currentDate.getMonth() + 1; // Convert back to 1-indexed month
      this.fetchImages();
    }
  },
  computed: {
    formattedCurrentDate() {
      const day = this.selectedDay;
      const monthName = this.months[this.selectedMonth - 1];

      // Add ordinal suffix to day
      let suffix = 'th';
      if (day % 10 === 1 && day !== 11) {
        suffix = 'st';
      } else if (day % 10 === 2 && day !== 12) {
        suffix = 'nd';
      } else if (day % 10 === 3 && day !== 13) {
        suffix = 'rd';
      }

      return `${day}${suffix} of ${monthName}`;
    }
  }
}
</script>

<style scoped>
.explore-day {
  max-width: 1200px;
  margin: 80px auto 0;
  padding: 20px;
}

h1 {
  text-align: center;
  margin-bottom: 30px;
}

.date-selector {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
}

.date-picker {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.day-picker, .month-picker {
  padding: 8px;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.explore-button {
  padding: 8px 16px;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

.explore-button:hover {
  background-color: #555;
}

.loading {
  text-align: center;
  font-size: 18px;
  margin: 30px 0;
}

.no-images {
  text-align: center;
  margin: 30px 0;
  font-size: 18px;
  color: #666;
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 20px;
}

.image-card {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
  border: 1px solid black;
}

.image-card:hover {
  transform: scale(1.03);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}

.image-container {
  width: 100%;
  aspect-ratio: 1/1;
  overflow: hidden;
  box-sizing: border-box;
}

.grid-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-year {
  padding: 8px 0;
  text-align: center;
  font-weight: bold;
  font-size: 1rem;
  background-color: #f5f5f5;
}

/* Pagination Controls */
.pagination-controls {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  padding: 0 20px;
}

.pagination-button {
  padding: 8px 16px;
  background-color: #f0f0f0;
  border: 1px solid black;
  border-radius: 4px;
  cursor: pointer;
  min-width: 80px;
  font-size: 1rem;
  transition: background-color 0.2s;
}

.pagination-button:hover {
  background-color: #e0e0e0;
}

.pagination-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.current-date {
  font-size: 18px;
  font-weight: bold;
}

/* Image Modal Styles */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  position: relative;
  max-width: 95%;
  max-height: 95%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.full-resolution-image {
  max-width: 100%;
  max-height: calc(100vh - 150px);
  object-fit: contain;
}

.close-button-container {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.close-modal-button {
  background-color: white;
  color: black;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  font-size: 16px;
}

.close-modal-button:hover {
  background-color: #f0f0f0;
}

.image-date {
  margin-top: 15px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 8px 16px;
  border-radius: 4px;
  text-align: center;
}

.view-post-link {
  color: #333;
  font-weight: bold;
  text-decoration: none;
}

.view-post-link:hover {
  text-decoration: underline;
}

body.modal-open {
  overflow: hidden;
}

@media (max-width: 768px) {
  .date-picker {
    flex-direction: column;
    align-items: center;
  }

  .images-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .explore-day {
    margin-top: 70px;
    padding: 15px;
  }

  h1 {
    font-size: 1.5rem;
    margin-bottom: 20px;
  }

  .date-picker {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .day-picker, .month-picker {
    width: 100%;
    max-width: 200px;
    font-size: 14px;
  }

  .explore-button {
    width: 100%;
    max-width: 200px;
    margin-top: 5px;
  }

  .images-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
  }

  .image-card {
    border-radius: 6px;
  }

  .image-year {
    padding: 5px 0;
    font-size: 0.9rem;
  }

  .close-modal-button {
    font-size: 14px;
    padding: 6px 12px;
  }

  .image-date {
    font-size: 14px;
    padding: 6px 12px;
    margin-top: 10px;
  }
}
</style>
