/**
 * LRU Image Cache
 * Caches loaded image data with LRU eviction and strict size limits
 */

class ImageCache {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 20; // Maximum 20 cached images (只缓存当前可见的)
    this.cache = new Map(); // imageId -> { data, timestamp, blobUrl, accessCount }
    this.accessOrder = []; // LRU tracking: most recently used at the end
    
    // Statistics
    this.stats = {
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      totalSets: 0,
      totalGets: 0
    };
  }

  /**
   * Get cached image data
   * @param {string} imageId - Unique image identifier
   * @returns {Object|null} Cached image data or null if not found
   */
  get(imageId) {
    this.stats.totalGets++;
    
    const cached = this.cache.get(imageId);
    
    if (cached) {
      // Cache hit: update access order
      this.stats.hitCount++;
      this._updateAccessOrder(imageId);
      cached.accessCount = (cached.accessCount || 0) + 1;
      return cached;
    }
    
    // Cache miss
    this.stats.missCount++;
    return null;
  }

  /**
   * Set/update cached image data
   * @param {string} imageId - Unique image identifier
   * @param {Object} data - Image data to cache
   */
  set(imageId, data) {
    this.stats.totalSets++;
    
    // If cache is full and this is a new entry, evict LRU
    if (!this.cache.has(imageId) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    // Create blob URL if data contains blob
    let blobUrl = null;
    if (data.blob) {
      blobUrl = URL.createObjectURL(data.blob);
    }
    
    // Store in cache
    this.cache.set(imageId, {
      data,
      blobUrl,
      timestamp: Date.now(),
      accessCount: 1
    });
    
    // Update access order
    this._updateAccessOrder(imageId);
  }

  /**
   * Remove image from cache
   * @param {string} imageId - Image identifier to remove
   */
  remove(imageId) {
    const cached = this.cache.get(imageId);
    
    if (cached) {
      // Revoke blob URL to release memory
      if (cached.blobUrl) {
        URL.revokeObjectURL(cached.blobUrl);
      }
      
      this.cache.delete(imageId);
      
      // Remove from access order
      const index = this.accessOrder.indexOf(imageId);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    // Revoke all blob URLs
    for (const [imageId, cached] of this.cache.entries()) {
      if (cached.blobUrl) {
        URL.revokeObjectURL(cached.blobUrl);
      }
    }
    
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Evict least recently used entry
   */
  evictLRU() {
    if (this.accessOrder.length === 0) {
      return;
    }
    
    // First item in access order is least recently used
    const lruImageId = this.accessOrder[0];
    
    this.remove(lruImageId);
    this.stats.evictionCount++;
  }

  /**
   * Get current cache size
   * @returns {number} Number of cached entries
   */
  size() {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const hitRate = this.stats.totalGets > 0 
      ? (this.stats.hitCount / this.stats.totalGets * 100).toFixed(2)
      : 0;
    
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      evictionCount: this.stats.evictionCount,
      totalSets: this.stats.totalSets,
      totalGets: this.stats.totalGets,
      hitRate: parseFloat(hitRate)
    };
  }

  /**
   * Update access order for LRU tracking
   * @private
   */
  _updateAccessOrder(imageId) {
    // Remove from current position
    const index = this.accessOrder.indexOf(imageId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    
    // Add to end (most recently used)
    this.accessOrder.push(imageId);
  }

  /**
   * Check if image is cached
   * @param {string} imageId - Image identifier
   * @returns {boolean} True if cached
   */
  has(imageId) {
    return this.cache.has(imageId);
  }

  /**
   * Get all cached image IDs
   * @returns {Array<string>} Array of cached image IDs
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Log cache statistics (for debugging)
   */
  logStats() {
    const stats = this.getStats();
    // 仅在需要时输出统计信息
  }
}

// Export singleton instance
const imageCache = new ImageCache();

export default imageCache;
