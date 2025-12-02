/**
 * Pagination Manager
 * Manages paginated image loading with memory windowing
 */

class PaginationManager {
  constructor(options = {}) {
    this.pageSize = options.pageSize || 50; // 50-100 images per page
    this.windowSize = options.windowSize || 200; // Keep 200 images max in memory
    this.currentPage = 0;
    this.loadedImages = [];
    this.totalCount = 0;
    this.hasMore = true;
    this.isLoading = false;
  }

  /**
   * Load next page of images
   * @param {Function} fetchFunction - Function to fetch images (libraryId, offset, limit)
   * @param {string} libraryId - Library ID
   * @returns {Promise<Array>} Loaded images
   */
  async loadNextPage(fetchFunction, libraryId) {
    if (this.isLoading || !this.hasMore) {
      return [];
    }

    this.isLoading = true;

    try {
      const offset = this.currentPage * this.pageSize;
      const response = await fetchFunction(libraryId, offset, this.pageSize);

      const { images, total, hasMore } = response;

      // Update state
      this.loadedImages = [...this.loadedImages, ...images];
      this.totalCount = total;
      this.hasMore = hasMore;
      this.currentPage++;

      // Apply memory windowing if needed
      this.applyMemoryWindow();

      console.log(`[PaginationManager] Loaded page ${this.currentPage}, total: ${this.loadedImages.length}/${this.totalCount}`);

      return images;
    } catch (error) {
      console.error('[PaginationManager] Error loading page:', error);
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Apply memory windowing: release old images when exceeding window size
   */
  applyMemoryWindow() {
    if (this.loadedImages.length > this.windowSize) {
      const toRemove = this.loadedImages.length - this.windowSize;
      const removed = this.loadedImages.splice(0, toRemove);
      
      console.log(`[PaginationManager] Memory window: removed ${removed.length} old images (${this.loadedImages.length} remaining)`);
      
      // 立即清理缓存（真正释放内存）
      const imageCache = require('./imageCache').default;
      removed.forEach(img => {
        if (img.id) {
          imageCache.remove(img.id);
        }
      });
      
      // Return removed images for cleanup
      return removed;
    }
    
    return [];
  }

  /**
   * Reset pagination state
   */
  reset() {
    this.currentPage = 0;
    this.loadedImages = [];
    this.totalCount = 0;
    this.hasMore = true;
    this.isLoading = false;
    
    console.log('[PaginationManager] Pagination reset');
  }

  /**
   * Get current pagination state
   * @returns {Object} Pagination state
   */
  getCurrentState() {
    // Estimate memory usage: ~50KB per image metadata
    const memoryEstimate = this.loadedImages.length * 50 * 1024;
    
    return {
      currentPage: this.currentPage,
      loadedCount: this.loadedImages.length,
      totalCount: this.totalCount,
      hasMore: this.hasMore,
      isLoading: this.isLoading,
      memoryEstimate,
      pageSize: this.pageSize,
      windowSize: this.windowSize
    };
  }

  /**
   * Get loaded images
   * @returns {Array} Loaded images
   */
  getLoadedImages() {
    return this.loadedImages;
  }

  /**
   * Set loaded images (for external updates)
   * @param {Array} images - Images to set
   */
  setLoadedImages(images) {
    this.loadedImages = images;
  }

  /**
   * Check if should load next page based on scroll position
   * @param {number} scrollTop - Current scroll position
   * @param {number} scrollHeight - Total scroll height
   * @param {number} clientHeight - Visible height
   * @param {number} threshold - Distance from bottom to trigger load (default: 200px)
   * @returns {boolean} True if should load next page
   */
  shouldLoadNextPage(scrollTop, scrollHeight, clientHeight, threshold = 200) {
    if (this.isLoading || !this.hasMore) {
      return false;
    }

    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    return distanceFromBottom < threshold;
  }

  /**
   * Log pagination state (for debugging)
   */
  logState() {
    const state = this.getCurrentState();
    console.log('[PaginationManager] State:', state);
  }
}

export default PaginationManager;
