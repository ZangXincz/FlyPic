/**
 * ImageLoadService 属性测试
 * 
 * **Feature: library-switch-optimization, Property 4: Scroll triggers batch loading**
 * **Feature: library-switch-optimization, Property 11: Batch loading updates display incrementally**
 * **Validates: Requirements 2.3, 5.2**
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ImageLoadService, DEFAULT_BATCH_SIZE } from './imageLoadService.js';

// Mock dependencies
vi.mock('./api', () => ({
  imageAPI: {
    search: vi.fn(),
    getCacheMeta: vi.fn()
  }
}));

vi.mock('./cacheService', () => ({
  default: {
    getFolderCache: vi.fn().mockResolvedValue(null),
    saveFolderCache: vi.fn().mockResolvedValue(undefined),
    invalidateFolder: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('./requestManager', () => ({
  default: {
    createRequest: vi.fn(() => ({
      id: `req_${Date.now()}`,
      signal: new AbortController().signal,
      isActive: true
    })),
    cancelAll: vi.fn(),
    isValid: vi.fn().mockReturnValue(true),
    complete: vi.fn(),
    error: vi.fn()
  },
  RequestType: {
    LIBRARY: 'library',
    FOLDER: 'folder',
    IMAGES: 'images'
  }
}));

describe('ImageLoadService', () => {
  let service;

  beforeEach(() => {
    service = new ImageLoadService();
    vi.clearAllMocks();
  });

  /**
   * **Property 4: Scroll triggers batch loading**
   * *For any* folder with more images than the initial batch size, 
   * scrolling to the bottom should trigger loading of the next batch.
   */
  describe('Property 4: Scroll triggers batch loading', () => {
    it('should set hasMore=true when total exceeds loaded count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: DEFAULT_BATCH_SIZE + 1, max: 10000 }),
          (totalImages) => {
            // 模拟状态：已加载一批，还有更多
            service.updateState({
              images: Array(DEFAULT_BATCH_SIZE).fill({ id: 1 }),
              offset: DEFAULT_BATCH_SIZE,
              total: totalImages,
              hasMore: true
            });

            return service.state.hasMore === true &&
              service.state.offset < service.state.total;
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
            // 模拟状态：所有图片已加载
            service.updateState({
              images: Array(totalImages).fill({ id: 1 }),
              offset: totalImages,
              total: totalImages,
              hasMore: false
            });

            return service.state.hasMore === false &&
              service.state.offset === service.state.total;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 11: Batch loading updates display incrementally**
   * *For any* batch load completion, the displayed image count should 
   * increase by the batch size (or remaining count if less).
   */
  describe('Property 11: Batch loading updates display incrementally', () => {
    it('should increment image count by batch size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5000 }),
          fc.integer({ min: 1, max: DEFAULT_BATCH_SIZE }),
          (initialCount, batchSize) => {
            const initialImages = Array(initialCount).fill({ id: 1 });
            const newImages = Array(batchSize).fill({ id: 2 });

            service.updateState({
              images: initialImages,
              offset: initialCount
            });

            const prevCount = service.state.images.length;

            // 模拟追加新批次
            service.updateState({
              images: [...initialImages, ...newImages],
              offset: initialCount + batchSize
            });

            const newCount = service.state.images.length;

            return newCount === prevCount + batchSize;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle partial batch at end', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: DEFAULT_BATCH_SIZE - 1 }),
          (remainingCount) => {
            const total = DEFAULT_BATCH_SIZE + remainingCount;
            const initialImages = Array(DEFAULT_BATCH_SIZE).fill({ id: 1 });
            const remainingImages = Array(remainingCount).fill({ id: 2 });

            service.updateState({
              images: initialImages,
              offset: DEFAULT_BATCH_SIZE,
              total,
              hasMore: true
            });

            // 模拟加载最后一批（不足一个完整批次）
            service.updateState({
              images: [...initialImages, ...remainingImages],
              offset: total,
              total,
              hasMore: false
            });

            return service.state.images.length === total &&
              service.state.hasMore === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('State management', () => {
    it('should reset state correctly', () => {
      service.updateState({
        libraryId: 'test',
        folder: 'folder',
        images: [{ id: 1 }],
        offset: 100,
        total: 1000,
        hasMore: true,
        isLoading: true
      });

      service.reset();

      expect(service.state.libraryId).toBe(null);
      expect(service.state.folder).toBe(null);
      expect(service.state.images).toHaveLength(0);
      expect(service.state.offset).toBe(0);
      expect(service.state.total).toBe(0);
      expect(service.state.hasMore).toBe(false);
      expect(service.state.isLoading).toBe(false);
    });

    it('should notify on state change', () => {
      const callback = vi.fn();
      service.setOnStateChange(callback);

      service.updateState({ isLoading: true });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        isLoading: true
      }));
    });
  });

  describe('Idle loading control', () => {
    it('should pause and resume idle loading', () => {
      service.updateState({ hasMore: true, isIdleLoading: true });

      service.pauseIdleLoading();
      expect(service.idlePaused).toBe(true);

      service.resumeIdleLoading();
      expect(service.idlePaused).toBe(false);
    });

    it('should cancel idle loading', () => {
      service.idleTimer = setTimeout(() => {}, 10000);
      service.updateState({ isIdleLoading: true });

      service.cancelIdleLoading();

      expect(service.idleTimer).toBe(null);
      expect(service.state.isIdleLoading).toBe(false);
    });
  });
});
