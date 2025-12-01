/**
 * RequestManager 属性测试
 * 使用 fast-check 进行属性测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { RequestManager, RequestType } from './requestManager.js';

describe('RequestManager', () => {
  let manager;

  beforeEach(() => {
    manager = new RequestManager();
  });

  /**
   * **Feature: library-switch-optimization, Property 7: Unique request IDs**
   * *For any* set of requests created by RequestManager, each request should have 
   * a unique ID that is different from all other request IDs.
   * **Validates: Requirements 4.1**
   */
  describe('Property 7: Unique request IDs', () => {
    it('should generate unique IDs for all requests', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (requestCount) => {
            const localManager = new RequestManager();
            const ids = new Set();

            for (let i = 0; i < requestCount; i++) {
              const type = Object.values(RequestType)[i % 3];
              const context = localManager.createRequest(type);
              ids.add(context.id);
            }

            // 所有 ID 应该唯一
            return ids.size === requestCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique IDs across different request types', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(...Object.values(RequestType)), { minLength: 1, maxLength: 50 }),
          (types) => {
            const localManager = new RequestManager();
            const ids = new Set();

            for (const type of types) {
              const context = localManager.createRequest(type);
              ids.add(context.id);
            }

            return ids.size === types.length;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: library-switch-optimization, Property 8: Cancelled requests don't trigger callbacks**
   * *For any* cancelled request, its completion callback should not be executed, 
   * and its result should not be applied to the state.
   * **Validates: Requirements 4.2**
   */
  describe('Property 8: Cancelled requests don\'t trigger callbacks', () => {
    it('should mark cancelled requests as inactive', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(RequestType)),
          (type) => {
            const context = manager.createRequest(type);
            const requestId = context.id;

            // 请求应该是活跃的
            expect(manager.isValid(requestId)).toBe(true);
            expect(context.isActive).toBe(true);

            // 取消请求
            context.cancel();

            // 请求应该不再有效
            expect(manager.isValid(requestId)).toBe(false);
            expect(context.isActive).toBe(false);
            expect(context.status).toBe('cancelled');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should abort the AbortController signal when cancelled', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(RequestType)),
          (type) => {
            const context = manager.createRequest(type);

            expect(context.signal.aborted).toBe(false);

            context.cancel();

            expect(context.signal.aborted).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should remove cancelled requests from active requests', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...Object.values(RequestType)),
          fc.integer({ min: 1, max: 10 }),
          (type, count) => {
            const localManager = new RequestManager();
            const contexts = [];

            // 创建多个请求
            for (let i = 0; i < count; i++) {
              contexts.push(localManager.createRequest(type));
            }

            expect(localManager.getActiveCount(type)).toBe(count);

            // 取消所有请求
            for (const ctx of contexts) {
              ctx.cancel();
            }

            expect(localManager.getActiveCount(type)).toBe(0);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cancelAll should cancel all requests of a specific type', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (count) => {
            const localManager = new RequestManager();
            const contexts = [];

            // 创建多个 FOLDER 类型请求
            for (let i = 0; i < count; i++) {
              contexts.push(localManager.createRequest(RequestType.FOLDER));
            }

            // 创建一个 LIBRARY 类型请求
            const libraryContext = localManager.createRequest(RequestType.LIBRARY);

            expect(localManager.getActiveCount(RequestType.FOLDER)).toBe(count);
            expect(localManager.getActiveCount(RequestType.LIBRARY)).toBe(1);

            // 取消所有 FOLDER 请求
            localManager.cancelAll(RequestType.FOLDER);

            // FOLDER 请求应该全部取消
            expect(localManager.getActiveCount(RequestType.FOLDER)).toBe(0);
            for (const ctx of contexts) {
              expect(ctx.isActive).toBe(false);
              expect(ctx.signal.aborted).toBe(true);
            }

            // LIBRARY 请求应该不受影响
            expect(localManager.getActiveCount(RequestType.LIBRARY)).toBe(1);
            expect(libraryContext.isActive).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Request lifecycle', () => {
    it('should properly track request completion', () => {
      const context = manager.createRequest(RequestType.IMAGES);
      const requestId = context.id;

      expect(manager.isValid(requestId)).toBe(true);

      manager.complete(requestId);

      expect(manager.isValid(requestId)).toBe(false);
      expect(context.status).toBe('completed');
    });

    it('should properly track request errors', () => {
      const context = manager.createRequest(RequestType.IMAGES);
      const requestId = context.id;

      expect(manager.isValid(requestId)).toBe(true);

      manager.error(requestId);

      expect(manager.isValid(requestId)).toBe(false);
      expect(context.status).toBe('error');
    });

    it('cancelAllRequests should cancel all types', () => {
      manager.createRequest(RequestType.LIBRARY);
      manager.createRequest(RequestType.FOLDER);
      manager.createRequest(RequestType.IMAGES);

      expect(manager.hasActiveRequests(RequestType.LIBRARY)).toBe(true);
      expect(manager.hasActiveRequests(RequestType.FOLDER)).toBe(true);
      expect(manager.hasActiveRequests(RequestType.IMAGES)).toBe(true);

      manager.cancelAllRequests();

      expect(manager.hasActiveRequests(RequestType.LIBRARY)).toBe(false);
      expect(manager.hasActiveRequests(RequestType.FOLDER)).toBe(false);
      expect(manager.hasActiveRequests(RequestType.IMAGES)).toBe(false);
    });
  });
});
