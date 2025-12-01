/**
 * CacheManager 属性测试
 * **Feature: library-switch-optimization, Property 12: Cache file creation after full load**
 * **Feature: library-switch-optimization, Property 16: Folder cache creation**
 * **Validates: Requirements 6.1, 7.1**
 */
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const fc = require('fast-check');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CacheManager = require('./cacheManager');

describe('CacheManager', () => {
  let testDir;
  let cacheManager;

  beforeEach(() => {
    // 创建临时测试目录
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flypic-test-'));
    cacheManager = new CacheManager(testDir);
  });

  afterEach(() => {
    // 清理测试目录
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * **Property 12: Cache file creation after full load**
   * *For any* library that completes full image loading, a cache file should 
   * exist in the .flypic/cache directory.
   */
  describe('Property 12: Cache file creation after full load', () => {
    it('should create library cache file when writeLibraryCache is called', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 0, max: Date.now() }),
          (totalCount, dbModifiedAt) => {
            const data = {
              folderTree: [],
              totalCount,
              dbModifiedAt
            };

            cacheManager.writeLibraryCache(data);

            const cachePath = cacheManager.getLibraryCachePath();
            return fs.existsSync(cachePath);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should persist library cache data correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 0, max: Date.now() }),
          (totalCount, dbModifiedAt) => {
            const data = {
              folderTree: [{ path: 'test', name: 'test', children: [] }],
              totalCount,
              dbModifiedAt
            };

            cacheManager.writeLibraryCache(data);
            const cache = cacheManager.readLibraryCache();

            return cache !== null &&
              cache.totalCount === totalCount &&
              cache.dbModifiedAt === dbModifiedAt &&
              cache.folderTree.length === 1;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * **Property 16: Folder cache creation**
   * *For any* folder whose images are fully loaded, a separate cache file 
   * should be created for that folder.
   */
  describe('Property 16: Folder cache creation', () => {
    it('should create folder cache file when writeFolderCache is called', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 0, max: Date.now() }),
          (folderPath, dbModifiedAt) => {
            const images = [
              { id: 1, path: 'img1.jpg', filename: 'img1.jpg', width: 100, height: 100 }
            ];

            cacheManager.writeFolderCache(folderPath, images, dbModifiedAt);

            const cachePath = cacheManager.getFolderCachePath(folderPath);
            return fs.existsSync(cachePath);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should create separate cache files for different folders', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 10 }),
          (folders) => {
            const uniqueFolders = [...new Set(folders)];
            const dbModifiedAt = Date.now();
            const images = [{ id: 1, path: 'img.jpg', filename: 'img.jpg', width: 100, height: 100 }];

            for (const folder of uniqueFolders) {
              cacheManager.writeFolderCache(folder, images, dbModifiedAt);
            }

            // 每个文件夹应该有独立的缓存文件
            const cacheFiles = new Set();
            for (const folder of uniqueFolders) {
              const cachePath = cacheManager.getFolderCachePath(folder);
              if (fs.existsSync(cachePath)) {
                cacheFiles.add(cachePath);
              }
            }

            return cacheFiles.size === uniqueFolders.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should persist folder cache data correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer({ min: 1, max: 100 }),
          fc.integer({ min: 0, max: Date.now() }),
          (folderPath, imageCount, dbModifiedAt) => {
            const images = Array.from({ length: imageCount }, (_, i) => ({
              id: i + 1,
              path: `img${i}.jpg`,
              filename: `img${i}.jpg`,
              width: 100,
              height: 100,
              thumbnail_path: `thumb${i}.webp`,
              file_type: 'image',
              created_at: Date.now(),
              format: 'jpg'
            }));

            cacheManager.writeFolderCache(folderPath, images, dbModifiedAt);
            const cache = cacheManager.readFolderCache(folderPath);

            return cache !== null &&
              cache.imageCount === imageCount &&
              cache.images.length === imageCount &&
              cache.dbModifiedAt === dbModifiedAt;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Cache deletion', () => {
    it('should delete library cache', () => {
      cacheManager.writeLibraryCache({ folderTree: [], totalCount: 100, dbModifiedAt: Date.now() });
      expect(fs.existsSync(cacheManager.getLibraryCachePath())).toBe(true);

      cacheManager.deleteLibraryCache();
      expect(fs.existsSync(cacheManager.getLibraryCachePath())).toBe(false);
    });

    it('should delete folder cache', () => {
      const folder = 'test-folder';
      cacheManager.writeFolderCache(folder, [], Date.now());
      expect(fs.existsSync(cacheManager.getFolderCachePath(folder))).toBe(true);

      cacheManager.deleteFolderCache(folder);
      expect(fs.existsSync(cacheManager.getFolderCachePath(folder))).toBe(false);
    });

    it('should clear all cache', () => {
      cacheManager.writeLibraryCache({ folderTree: [], totalCount: 100, dbModifiedAt: Date.now() });
      cacheManager.writeFolderCache('folder1', [], Date.now());
      cacheManager.writeFolderCache('folder2', [], Date.now());

      cacheManager.clearAllCache();

      expect(fs.existsSync(cacheManager.getLibraryCachePath())).toBe(false);
      expect(fs.existsSync(cacheManager.getFolderCachePath('folder1'))).toBe(false);
      expect(fs.existsSync(cacheManager.getFolderCachePath('folder2'))).toBe(false);
    });
  });
});
