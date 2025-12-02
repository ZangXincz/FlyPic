/**
 * Memory Monitor
 * Continuously monitors memory usage and triggers cleanup when thresholds are exceeded
 */

class MemoryMonitor {
  constructor(options = {}) {
    this.warningThreshold = options.warningThreshold || 150 * 1024 * 1024; // 150MB
    this.dangerThreshold = options.dangerThreshold || 300 * 1024 * 1024;   // 300MB
    this.checkInterval = options.checkInterval || 2000; // 2 seconds
    this.cleanupManager = options.cleanupManager;
    this.devMode = options.devMode || process.env.NODE_ENV === 'development';
    this.devLogInterval = options.devLogInterval || 30000; // 30 seconds
    
    this.intervalId = null;
    this.devLogIntervalId = null;
    this.isRunning = false;
    this.lastWarningTime = 0;
    this.lastDangerTime = 0;
    this.warningCooldown = 10000; // 10 seconds between warnings
  }

  /**
   * Start monitoring memory usage
   */
  start() {
    if (this.isRunning) {
      console.log('[MemoryMonitor] Already running');
      return;
    }

    console.log('[MemoryMonitor] Starting memory monitoring');
    console.log(`  Warning threshold: ${(this.warningThreshold / 1024 / 1024).toFixed(0)}MB`);
    console.log(`  Danger threshold: ${(this.dangerThreshold / 1024 / 1024).toFixed(0)}MB`);
    console.log(`  Check interval: ${this.checkInterval}ms`);

    this.isRunning = true;

    // Start periodic memory checks
    this.intervalId = setInterval(() => {
      this.checkMemory();
    }, this.checkInterval);

    // Start development mode logging
    if (this.devMode) {
      console.log('[MemoryMonitor] Development mode: logging every 30 seconds');
      this.devLogIntervalId = setInterval(() => {
        const stats = this.getMemoryStats();
        this.logMemoryStats(stats, 'DEV');
      }, this.devLogInterval);
    }

    // Initial check
    this.checkMemory();
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('[MemoryMonitor] Stopping memory monitoring');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.devLogIntervalId) {
      clearInterval(this.devLogIntervalId);
      this.devLogIntervalId = null;
    }

    this.isRunning = false;
  }

  /**
   * Get current memory statistics
   * @returns {Object} Memory statistics
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
   * Check memory and trigger actions if thresholds exceeded
   */
  checkMemory() {
    const stats = this.getMemoryStats();
    const heapUsedMB = stats.heapUsed / 1024 / 1024;

    // Check danger threshold first
    if (stats.heapUsed > this.dangerThreshold) {
      this.handleDanger(stats);
    }
    // Check warning threshold
    else if (stats.heapUsed > this.warningThreshold) {
      this.handleWarning(stats);
    }

    return stats;
  }

  /**
   * Handle warning threshold exceeded
   */
  handleWarning(stats) {
    const now = Date.now();
    
    // Cooldown to avoid spam
    if (now - this.lastWarningTime < this.warningCooldown) {
      return;
    }

    this.lastWarningTime = now;
    
    console.warn('[MemoryMonitor] ⚠️  WARNING: Memory usage high');
    this.logMemoryStats(stats, 'WARNING');
  }

  /**
   * Handle danger threshold exceeded
   */
  handleDanger(stats) {
    const now = Date.now();
    
    // Cooldown to avoid spam (shorter for danger)
    if (now - this.lastDangerTime < 5000) {
      return;
    }

    this.lastDangerTime = now;
    
    console.error('[MemoryMonitor] 🚨 DANGER: Memory usage critical!');
    this.logMemoryStats(stats, 'DANGER');

    // Trigger emergency cleanup if cleanup manager is available
    if (this.cleanupManager) {
      console.log('[MemoryMonitor] Triggering emergency cleanup...');
      try {
        this.cleanupManager.executeEmergencyCleanup();
        
        // 等待一下再检查
        setTimeout(() => {
          const afterStats = this.getMemoryStats();
          const afterRSS = afterStats.rss / 1024 / 1024;
          console.log(`[MemoryMonitor] After emergency cleanup: RSS = ${afterRSS.toFixed(0)}MB`);
          
          // 如果 RSS 仍然很高，强制更多 GC
          if (afterRSS > 500) {
            console.log('[MemoryMonitor] RSS still high, forcing additional GC...');
            if (global.gc) {
              for (let i = 0; i < 10; i++) {
                global.gc();
              }
            }
          }
        }, 1000);
      } catch (error) {
        console.error('[MemoryMonitor] Emergency cleanup failed:', error);
      }
    } else {
      console.warn('[MemoryMonitor] No cleanup manager available');
    }
  }

  /**
   * Log memory statistics with detailed breakdown
   */
  logMemoryStats(stats, level = 'INFO') {
    const heapUsedMB = (stats.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (stats.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (stats.rss / 1024 / 1024).toFixed(2);
    const externalMB = (stats.external / 1024 / 1024).toFixed(2);
    const arrayBuffersMB = (stats.arrayBuffers / 1024 / 1024).toFixed(2);

    console.log(`[MemoryMonitor] ${level} - Memory Statistics:`);
    console.log(`  Heap Used:     ${heapUsedMB} MB`);
    console.log(`  Heap Total:    ${heapTotalMB} MB`);
    console.log(`  RSS:           ${rssMB} MB`);
    console.log(`  External:      ${externalMB} MB`);
    console.log(`  Array Buffers: ${arrayBuffersMB} MB`);
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      warningThreshold: this.warningThreshold,
      dangerThreshold: this.dangerThreshold,
      checkInterval: this.checkInterval,
      currentMemory: this.isRunning ? this.getMemoryStats() : null
    };
  }
}

module.exports = MemoryMonitor;
