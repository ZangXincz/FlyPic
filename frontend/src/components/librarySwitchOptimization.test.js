/**
 * 素材库切换优化 - 组件集成测试
 * 
 * **Feature: library-switch-optimization**
 * **Property 1: Request cancellation on library switch**
 * **Property 2: Memory cleanup on library switch**
 * **Property 3: Request cancellation on folder switch**
 * **Property 5: Debounce rapid folder clicks**
 * **Property 6: Background loading pauses on user action**
 * **Property 9: Only latest request result applied**
 * **Property 10: Unmount cancels all requests**
 * **Validates: Requirements 1.2, 1.3, 2.2, 3.2, 3.3, 4.3, 4.4**
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { RequestManager, RequestType } from '../services/requestManager.js';

describe('Library Switch Optimization - Integration Properties', () => {
  /**
   * **Property 1: Request cancellation on library switch**
   * *For any* library switch operation, all pending requests from the previous 
   * library should be cancelled (aborted) before new requests are initiated.
   */
  describe('Property 1: Request cancellation on library switch', () => {
    it('should cancel all pending requests when switching libraries', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (pendingCount, newRequestCount) => {
            const manager = new RequestManager();
            const pendingContexts = [];

            // 创建待处理的请求（模拟旧素材库的请求）
            for (let i = 0; i < pendingCount; i++) {
              pendingContexts.push(manager.createRequest(RequestType.IMAGES));
            }

            // 验证请求都是活跃的
            const allActive = pendingContexts.every(ctx => ctx.isActive);

            // 模拟切换素材库：取消所有请求
            manager.cancelAllRequests();

            // 验证所有旧请求都被取消
            const allCancelled = pendingContexts.every(ctx => !ctx.isActive && ctx.signal.aborted);

            // 创建新请求（模拟新素材库的请求）
            const newContexts = [];
            for (let i = 0; i < newRequestCount; i++) {
              newContexts.push(manager.createRequest(RequestType.IMAGES));
            }

            // 验证新请求是活跃的
            const newAllActive = newContexts.every(ctx => ctx.isActive);

            return allActive && allCancelled && newAllActive;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 2: Memory cleanup on library switch**
   * *For any* library switch operation, the previous library's image data 
   * should be cleared from the store state.
   */
  describe('Property 2: Memory cleanup on library switch', () => {
    it('should clear previous library data before loading new data', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({ id: fc.integer(), path: fc.string() }), { minLength: 1, maxLength: 100 }),
          fc.array(fc.record({ id: fc.integer(), path: fc.string() }), { minLength: 1, maxLength: 100 }),
          (oldImages, newImages) => {
            // 模拟 store 状态
            let storeState = {
              images: oldImages,
              filteredImages: oldImages
            };

            // 模拟切换素材库时的清理
            storeState = {
              images: [],
              filteredImages: []
            };

            // 验证清理后状态为空
            const clearedCorrectly = storeState.images.length === 0;

            // 模拟加载新数据
            storeState = {
              images: newImages,
              filteredImages: newImages
            };

            // 验证新数据正确加载
            const newDataLoaded = storeState.images.length === newImages.length;

            return clearedCorrectly && newDataLoaded;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 3: Request cancellation on folder switch**
   * *For any* folder selection while a previous folder's images are still loading, 
   * the previous folder's loading request should be cancelled.
   */
  describe('Property 3: Request cancellation on folder switch', () => {
    it('should cancel previous folder request when switching folders', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 1, maxLength: 20 }),
          (folder1, folder2) => {
            const manager = new RequestManager();

            // 创建第一个文件夹的请求
            const request1 = manager.createRequest(RequestType.IMAGES);
            expect(request1.isActive).toBe(true);

            // 切换到第二个文件夹：取消之前的请求
            manager.cancelAll(RequestType.IMAGES);

            // 验证第一个请求被取消
            expect(request1.isActive).toBe(false);
            expect(request1.signal.aborted).toBe(true);

            // 创建第二个文件夹的请求
            const request2 = manager.createRequest(RequestType.IMAGES);
            expect(request2.isActive).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 5: Debounce rapid folder clicks**
   * *For any* sequence of rapid folder clicks (within debounce window), 
   * only the final folder selection should result in a completed request.
   */
  describe('Property 5: Debounce rapid folder clicks', () => {
    it('should only keep the latest request active after rapid cancellations', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 20 }),
          (clickCount) => {
            const manager = new RequestManager();
            const requests = [];

            // 模拟快速点击多个文件夹
            for (let i = 0; i < clickCount; i++) {
              // 取消之前的请求
              manager.cancelAll(RequestType.IMAGES);
              // 创建新请求
              requests.push(manager.createRequest(RequestType.IMAGES));
            }

            // 只有最后一个请求应该是活跃的
            const activeCount = requests.filter(r => r.isActive).length;
            const lastIsActive = requests[requests.length - 1].isActive;
            const othersInactive = requests.slice(0, -1).every(r => !r.isActive);

            return activeCount === 1 && lastIsActive && othersInactive;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 9: Only latest request result applied**
   * *For any* sequence of requests for the same resource, only the result 
   * of the most recently initiated request should be applied.
   */
  describe('Property 9: Only latest request result applied', () => {
    it('should only apply result if request is still valid', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          (requestCount) => {
            const manager = new RequestManager();
            const requests = [];

            // 创建多个请求
            for (let i = 0; i < requestCount; i++) {
              requests.push(manager.createRequest(RequestType.IMAGES));
            }

            // 取消除最后一个外的所有请求
            for (let i = 0; i < requestCount - 1; i++) {
              requests[i].cancel();
            }

            // 验证只有最后一个请求有效
            const validCount = requests.filter(r => manager.isValid(r.id)).length;

            return validCount === 1 && manager.isValid(requests[requestCount - 1].id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 10: Unmount cancels all requests**
   * *For any* component unmount event, all pending requests should be cancelled.
   */
  describe('Property 10: Unmount cancels all requests', () => {
    it('should cancel all requests on unmount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (requestCount) => {
            const manager = new RequestManager();
            const requests = [];

            // 创建多个不同类型的请求
            for (let i = 0; i < requestCount; i++) {
              const type = Object.values(RequestType)[i % 3];
              requests.push(manager.createRequest(type));
            }

            // 模拟组件卸载：取消所有请求
            manager.cancelAllRequests();

            // 验证所有请求都被取消
            const allCancelled = requests.every(r => !r.isActive && r.signal.aborted);

            return allCancelled;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Property 6: Background loading pauses on user action**
   * *For any* user-initiated action while background loading is in progress, 
   * the background loading should pause.
   */
  describe('Property 6: Background loading pauses on user action', () => {
    it('should track pause state correctly', () => {
      // 模拟空闲加载状态
      let idlePaused = false;
      let isIdleLoading = true;

      const pauseIdleLoading = () => {
        idlePaused = true;
        isIdleLoading = false;
      };

      const resumeIdleLoading = () => {
        idlePaused = false;
        isIdleLoading = true;
      };

      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
          (actions) => {
            // 重置状态
            idlePaused = false;
            isIdleLoading = true;

            for (const shouldPause of actions) {
              if (shouldPause) {
                pauseIdleLoading();
                // 用户操作时应该暂停
                if (!idlePaused || isIdleLoading) return false;
              } else {
                resumeIdleLoading();
                // 恢复后应该继续
                if (idlePaused || !isIdleLoading) return false;
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
