/**
 * Cleanup Manager
 * Executes routine and emergency memory cleanup procedures
 */

class CleanupManager {
  constructor(options = {}) {
    this.routineInterval = options.routineInterval || 5000; // 5 seconds
    this.dbPool = options.dbPool;
    this.caches = new Map(); // name -> cache object with clear() method
    
    this.routineIntervalId = null;
    this.isRunning = false;
    this.cleanupCount = 0;
    this.lastCleanupTime = 0;
  }

  /**
   * Start routine cleanup
   */
  startRoutineCleanup() {
    if (this.isRunning) {
      console.log('[CleanupManager] Routine cleanup already running');
      return;
    }

    console.log('[CleanupManager] Starting routine cleanup');
    console.log(`  Interval: ${this.routineInterval}ms`);

    this.isRunning = true;

    this.routineIntervalId = setInterval(() => {
      this.executeRoutineCleanup();
    }, this.routineInterval);
  }

  /**
   * Stop routine cleanup
   */
  stopRoutineCleanup() {
    if (!this.isRunning) {
      return;
    }

    console.log('[CleanupManager] Stopping routine cleanup');
    
    if (this.routineIntervalId) {
      clearInterval(this.routineIntervalId);
      this.routineIntervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Execute routine cleanup
   * - Clear registered caches
   * - Trigger garbage collection (if available)
   */
  executeRoutineCleanup() {
    const memoryBefore = this.getMemoryStats();
    const rssBefore = memoryBefore.rss / 1024 / 1024;
    
    try {
      // Clear all registered caches
      const cachesCleared = this.clearAllCaches();

      // 强制多次 GC（更激进）
      if (global.gc) {
        // 执行 5 次 GC 确保内存真正释放
        for (let i = 0; i < 5; i++) {
          global.gc();
        }
      }

      const memoryAfter = this.getMemoryStats();
      const rssAfter = memoryAfter.rss / 1024 / 1024;
      const memoryReclaimed = memoryBefore.heapUsed - memoryAfter.heapUsed;
      const rssReclaimed = rssBefore - rssAfter;

      this.cleanupCount++;
      this.lastCleanupTime = Date.now();

      // 总是显示日志（帮助诊断）
      console.log('[CleanupManager] Routine cleanup completed');
      console.log(`  Caches cleared: ${cachesCleared}`);
      console.log(`  Heap reclaimed: ${(memoryReclaimed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  RSS: ${rssBefore.toFixed(0)}MB → ${rssAfter.toFixed(0)}MB (${rssReclaimed > 0 ? '-' : '+'}${Math.abs(rssReclaimed).toFixed(0)}MB)`);

      return {
        memoryBefore,
        memoryAfter,
        memoryReclaimed,
        cachesCleared,
        connectionsCleared: 0
      };
    } catch (error) {
      console.error('[CleanupManager] Routine cleanup error:', error);
      return null;
    }
  }

  /**
   * Execute emergency cleanup
   * - Force close all database connections
   * - Clear all caches
   * - Force garbage collection multiple times (3+)
   */
  executeEmergencyCleanup() {
    console.log('[CleanupManager] 🚨 Executing EMERGENCY cleanup...');
    
    const memoryBefore = this.getMemoryStats();
    
    try {
      // 1. Force close all database connections
      let connectionsCleared = 0;
      if (this.dbPool) {
        try {
          this.dbPool.closeAll();
          connectionsCleared = 1;
          console.log('[CleanupManager]   ✓ Database connections closed');
        } catch (error) {
          console.error('[CleanupManager]   ✗ Failed to close connections:', error.message);
        }
      }

      // 2. Clear all registered caches
      const cachesCleared = this.clearAllCaches();
      console.log(`[CleanupManager]   ✓ ${cachesCleared} caches cleared`);

      // 3. Force garbage collection multiple times (minimum 3)
      this.forceGarbageCollection(3);

      const memoryAfter = this.getMemoryStats();
      const memoryReclaimed = memoryBefore.heapUsed - memoryAfter.heapUsed;

      console.log('[CleanupManager] Emergency cleanup completed');
      console.log(`  Memory before:  ${(memoryBefore.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Memory after:   ${(memoryAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Memory reclaimed: ${(memoryReclaimed / 1024 / 1024).toFixed(2)} MB`);

      return {
        memoryBefore,
        memoryAfter,
        memoryReclaimed,
        cachesCleared,
        connectionsCleared
      };
    } catch (error) {
      console.error('[CleanupManager] Emergency cleanup error:', error);
      return null;
    }
  }

  /**
   * Force garbage collection multiple times
   * @param {number} iterations - Number of GC iterations (minimum 3)
   */
  forceGarbageCollection(iterations = 3) {
    if (!global.gc) {
      console.warn('[CleanupManager] Garbage collection not available (run with --expose-gc)');
      return;
    }

    const actualIterations = Math.max(3, iterations);
    console.log(`[CleanupManager]   Running GC ${actualIterations} times...`);

    for (let i = 0; i < actualIterations; i++) {
      try {
        global.gc();
      } catch (error) {
        console.error(`[CleanupManager]   GC iteration ${i + 1} failed:`, error.message);
      }
    }

    console.log('[CleanupManager]   ✓ Garbage collection completed');
  }

  /**
   * Clear all registered caches
   * @returns {number} Number of caches cleared
   */
  clearAllCaches() {
    let cleared = 0;

    for (const [name, cache] of this.caches.entries()) {
      try {
        if (cache && typeof cache.clear === 'function') {
          cache.clear();
          cleared++;
        }
      } catch (error) {
        console.error(`[CleanupManager] Failed to clear cache "${name}":`, error.message);
      }
    }

    return cleared;
  }

  /**
   * Register a cache for cleanup
   * @param {string} name - Cache name
   * @param {Object} cache - Cache object with clear() method
   */
  registerCache(name, cache) {
    if (!cache || typeof cache.clear !== 'function') {
      console.warn(`[CleanupManager] Cache "${name}" does not have a clear() method`);
      return;
    }

    this.caches.set(name, cache);
    console.log(`[CleanupManager] Registered cache: ${name}`);
  }

  /**
   * Unregister a cache
   * @param {string} name - Cache name
   */
  unregisterCache(name) {
    this.caches.delete(name);
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats() {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      timestamp: Date.now()
    };
  }

  /**
   * Get cleanup manager status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      routineInterval: this.routineInterval,
      cleanupCount: this.cleanupCount,
      lastCleanupTime: this.lastCleanupTime,
      registeredCaches: Array.from(this.caches.keys())
    };
  }
}

module.exports = CleanupManager;
