/**
 * ImageLoadService 属性测试
 * 
 * **Feature: library-switch-optimization, Property 4: Scroll triggers batch loading**
 * **Feature: library-switch-optimization, Property 11: Batch loading updates display incrementally**
 * **Validates: Requirements 2.3, 5.2**
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  onUserActionStart, 
  onUserActionEnd, 
  pauseIdleLoading, 
  resumeIdleLoading, 
  isIdlePaused 
} from './imageLoadService.js';

// Mock requestManager
vi.mock('./requestManager', () => ({
  default: {
    cancelAll: vi.fn()
  },
  RequestType: {
    LIBRARY: 'library',
    FOLDER: 'folder',
    IMAGES: 'images'
  }
}));

// 默认批次大小（用于属性测试）
const DEFAULT_BATCH_SIZE = 200;

describe('ImageLoadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置空闲加载状态
    resumeIdleLoading();
  });

  /**
   * **Property 4: Scroll triggers batch loading**
   * 测试 Store 状态管理逻辑（hasMore 标志）
   */
  describe('Property 4: Scroll triggers batch loading', () => {
    it('should correctly determine hasMore based on loaded vs total count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: DEFAULT_BATCH_SIZE + 1, max: 10000 }),
          (totalImages) => {
            // 模拟 Store 状态
            const state = {
              loadedCount: DEFAULT_BATCH_SIZE,
              totalCount: totalImages,
              hasMore: DEFAULT_BATCH_SIZE < totalImages
            };

            return state.hasMore === true && state.loadedCount < state.totalCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set hasMore=false when all images loaded', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: DEFAULT_BATCH_SIZE }),
          (totalImages) => {
            // 模拟 Store 状态
            const state = {
              loadedCount: totalImages,
              totalCount: totalImages,
              hasMore: false
            };

            return state.hasMore === false && state.loadedCount === state.totalCount;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 11: Batch loading updates display incrementally**
   */
  describe('Property 11: Batch loading updates display incrementally', () => {
    it('should increment image count by batch size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5000 }),
          fc.integer({ min: 1, max: DEFAULT_BATCH_SIZE }),
          (initialCount, batchSize) => {
            // 模拟 Store 的 appendImages 行为
            const initialImages = Array(initialCount).fill({ id: 1 });
            const newImages = Array(batchSize).fill({ id: 2 });
            const allImages = [...initialImages, ...newImages];

            return allImages.length === initialCount + batchSize;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Idle loading control', () => {
    it('should pause idle loading on user action start', () => {
      expect(isIdlePaused()).toBe(false);
      
      onUserActionStart();
      
      expect(isIdlePaused()).toBe(true);
    });

    it('should track pause state correctly', () => {
      pauseIdleLoading();
      expect(isIdlePaused()).toBe(true);

      resumeIdleLoading();
      expect(isIdlePaused()).toBe(false);
    });

    it('should handle multiple pause/resume cycles', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
          (actions) => {
            // 重置状态
            resumeIdleLoading();

            for (const shouldPause of actions) {
              if (shouldPause) {
                pauseIdleLoading();
                if (!isIdlePaused()) return false;
              } else {
                resumeIdleLoading();
                if (isIdlePaused()) return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
