/**
 * DOM Cleanup Manager
 * Manages DOM resource cleanup to prevent memory leaks
 */

class DOMCleanupManager {
  constructor() {
    this.blobUrls = new Set();
    this.eventListeners = new Map(); // element -> [{ event, handler }]
    this.pendingLoads = new Set(); // Set of AbortControllers
  }

  /**
   * Register a blob URL for tracking
   * @param {string} url - Blob URL to track
   */
  registerBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
      this.blobUrls.add(url);
    }
  }

  /**
   * Revoke a specific blob URL
   * @param {string} url - Blob URL to revoke
   */
  revokeBlobUrl(url) {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
        this.blobUrls.delete(url);
      } catch (error) {
        console.warn('[DOMCleanup] Failed to revoke blob URL:', error);
      }
    }
  }

  /**
   * Revoke all tracked blob URLs
   */
  revokeAllBlobUrls() {
    let revokedCount = 0;
    
    for (const url of this.blobUrls) {
      try {
        URL.revokeObjectURL(url);
        revokedCount++;
      } catch (error) {
        console.warn('[DOMCleanup] Failed to revoke blob URL:', error);
      }
    }
    
    this.blobUrls.clear();
    
    if (revokedCount > 0) {
      console.log(`[DOMCleanup] Revoked ${revokedCount} blob URLs`);
    }
  }

  /**
   * Clear image sources in a container
   * @param {HTMLElement} container - Container element
   */
  clearImageSources(container) {
    if (!container) return;

    const images = container.querySelectorAll('img');
    let clearedCount = 0;

    images.forEach(img => {
      if (img.src) {
        // Revoke if it's a blob URL
        if (img.src.startsWith('blob:')) {
          this.revokeBlobUrl(img.src);
        }
        
        // Clear the src
        img.src = '';
        clearedCount++;
      }
    });

    if (clearedCount > 0) {
      console.log(`[DOMCleanup] Cleared ${clearedCount} image sources`);
    }
  }

  /**
   * Register an event listener for cleanup
   * @param {HTMLElement} element - Element with listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  registerEventListener(element, event, handler) {
    if (!this.eventListeners.has(element)) {
      this.eventListeners.set(element, []);
    }
    
    this.eventListeners.get(element).push({ event, handler });
  }

  /**
   * Remove all registered event listeners for an element
   * @param {HTMLElement} element - Element to clean up
   */
  removeEventListeners(element) {
    const listeners = this.eventListeners.get(element);
    
    if (listeners) {
      listeners.forEach(({ event, handler }) => {
        try {
          element.removeEventListener(event, handler);
        } catch (error) {
          console.warn('[DOMCleanup] Failed to remove event listener:', error);
        }
      });
      
      this.eventListeners.delete(element);
    }
  }

  /**
   * Remove all registered event listeners
   */
  removeAllEventListeners() {
    let removedCount = 0;
    
    for (const [element, listeners] of this.eventListeners.entries()) {
      listeners.forEach(({ event, handler }) => {
        try {
          element.removeEventListener(event, handler);
          removedCount++;
        } catch (error) {
          console.warn('[DOMCleanup] Failed to remove event listener:', error);
        }
      });
    }
    
    this.eventListeners.clear();
    
    if (removedCount > 0) {
      console.log(`[DOMCleanup] Removed ${removedCount} event listeners`);
    }
  }

  /**
   * Register a pending image load (AbortController)
   * @param {AbortController} controller - Abort controller for the load
   */
  registerPendingLoad(controller) {
    this.pendingLoads.add(controller);
  }

  /**
   * Cancel a specific pending load
   * @param {AbortController} controller - Controller to abort
   */
  cancelPendingLoad(controller) {
    if (this.pendingLoads.has(controller)) {
      try {
        controller.abort();
        this.pendingLoads.delete(controller);
      } catch (error) {
        console.warn('[DOMCleanup] Failed to cancel pending load:', error);
      }
    }
  }

  /**
   * Cancel all pending image loads
   */
  cancelPendingLoads() {
    let cancelledCount = 0;
    
    for (const controller of this.pendingLoads) {
      try {
        controller.abort();
        cancelledCount++;
      } catch (error) {
        console.warn('[DOMCleanup] Failed to cancel pending load:', error);
      }
    }
    
    this.pendingLoads.clear();
    
    if (cancelledCount > 0) {
      console.log(`[DOMCleanup] Cancelled ${cancelledCount} pending loads`);
    }
  }

  /**
   * Suggest browser garbage collection through memory pressure
   * Note: This is a hint to the browser, not a guarantee
   */
  suggestGarbageCollection() {
    // Create and immediately discard large objects to signal memory pressure
    try {
      const pressureSignal = new Array(1000).fill(new Array(1000).fill(0));
      // Let it be garbage collected
      if (pressureSignal.length > 0) {
        // Just a check to prevent optimization
      }
    } catch (error) {
      // Ignore errors
    }
    
    // Request idle callback for cleanup
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => {
        // Browser can perform GC during idle time
      });
    }
  }

  /**
   * Perform complete cleanup
   */
  cleanup() {
    console.log('[DOMCleanup] Performing complete cleanup...');
    
    this.revokeAllBlobUrls();
    this.removeAllEventListeners();
    this.cancelPendingLoads();
    this.suggestGarbageCollection();
    
    console.log('[DOMCleanup] Cleanup complete');
  }

  /**
   * Get cleanup manager status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      blobUrls: this.blobUrls.size,
      eventListeners: this.eventListeners.size,
      pendingLoads: this.pendingLoads.size
    };
  }
}

// Export singleton instance
const domCleanup = new DOMCleanupManager();

export default domCleanup;
