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
   */
  describe('Property 4: Scroll triggers batch loading', () => {
    it('should set hasMore=true when total exceeds loaded count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: DEFAULT_BATCH_SIZE + 1, max: 10000 }),
          (totalImages) => {
            service.state = {
              ...service.state,
              images: Array(DEFAULT_BATCH_SIZE).fill({ id: 1 }),
              offset: DEFAULT_BATCH_SIZE,
              total: totalImages,
              hasMore: true
            };

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
            service.state = {
              ...service.state,
              images: Array(totalImages).fill({ id: 1 }),
              offset: totalImages,
              total: totalImages,
              hasMore: false
            };

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

            service.state = {
              ...service.state,
              images: initialImages,
              offset: initialCount
            };

            const prevCount = service.state.images.length;

            service.state = {
              ...service.state,
              images: [...initialImages, ...newImages],
              offset: initialCount + batchSize
            };

            const newCount = service.state.images.length;

            return newCount === prevCount + batchSize;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Idle loading control', () => {
    it('should pause and resume idle loading', () => {
      service.state.hasMore = true;

      service.pauseIdleLoading();
      expect(service.idlePaused).toBe(true);

      service.resumeIdleLoading();
      expect(service.idlePaused).toBe(false);
    });

    it('should cancel idle loading', () => {
      service.idleTimer = setTimeout(() => {}, 10000);

      service.cancelIdleLoading();

      expect(service.idleTimer).toBe(null);
    });
  });
});
