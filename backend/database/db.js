const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class LibraryDatabase {
  constructor(libraryPath) {
    this.libraryPath = libraryPath;
    this.flypicDir = path.join(libraryPath, '.flypic');
    this.dbPath = path.join(this.flypicDir, 'metadata.db');
    
    // Ensure .flypic directory exists
    if (!fs.existsSync(this.flypicDir)) {
      fs.mkdirSync(this.flypicDir, { recursive: true });
    }
    
    // Create thumbnails directory (480px 与 Billfish 一致)
    const thumbDir = path.join(this.flypicDir, 'thumbnails');
    const thumbDir480 = path.join(thumbDir, '480');
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
    if (!fs.existsSync(thumbDir480)) fs.mkdirSync(thumbDir480, { recursive: true });
    
    this.db = new Database(this.dbPath);
    
    // 优化数据库性能
    this.db.pragma('journal_mode = WAL'); // 启用 WAL 模式，支持并发读写
    this.db.pragma('synchronous = NORMAL'); // 平衡性能和安全性
    this.db.pragma('cache_size = -64000'); // 64MB 缓存
    this.db.pragma('temp_store = MEMORY'); // 临时表存储在内存
    this.db.pragma('mmap_size = 268435456'); // 256MB 内存映射
    
    this.initTables();
  }

  initTables() {
    // Images table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        filename TEXT NOT NULL,
        folder TEXT NOT NULL,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        format TEXT,
        file_type TEXT DEFAULT 'image',
        created_at INTEGER,
        modified_at INTEGER,
        file_hash TEXT,
        thumbnail_path TEXT,
        thumbnail_size INTEGER,
        indexed_at INTEGER
      )
    `);
    
    // 添加 file_type 列（如果不存在）
    try {
      this.db.exec(`ALTER TABLE images ADD COLUMN file_type TEXT DEFAULT 'image'`);
    } catch (e) {
      // 列已存在，忽略错误
    }

    // Folders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT UNIQUE NOT NULL,
        parent_path TEXT,
        name TEXT NOT NULL,
        image_count INTEGER DEFAULT 0,
        last_scan INTEGER
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_filename ON images(filename);
      CREATE INDEX IF NOT EXISTS idx_folder ON images(folder);
      CREATE INDEX IF NOT EXISTS idx_created_at ON images(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_file_hash ON images(file_hash);
      CREATE INDEX IF NOT EXISTS idx_folder_path ON folders(path);
      CREATE INDEX IF NOT EXISTS idx_folder_parent ON folders(parent_path);
      -- 复合索引：优化文件夹+时间排序查询
      CREATE INDEX IF NOT EXISTS idx_folder_created ON images(folder, created_at DESC);
    `);
  }

  // Image operations
  insertImage(imageData) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO images 
      (path, filename, folder, size, width, height, format, file_type, created_at, modified_at, file_hash, thumbnail_path, thumbnail_size, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      imageData.path,
      imageData.filename,
      imageData.folder,
      imageData.size,
      imageData.width,
      imageData.height,
      imageData.format,
      imageData.file_type || 'image',
      imageData.created_at,
      imageData.modified_at,
      imageData.file_hash,
      imageData.thumbnail_path,
      imageData.thumbnail_size,
      Date.now()
    );
  }

  getImageByPath(imagePath) {
    const stmt = this.db.prepare('SELECT * FROM images WHERE path = ?');
    return stmt.get(imagePath);
  }

  getAllImages() {
    const stmt = this.db.prepare('SELECT * FROM images ORDER BY created_at DESC');
    return stmt.all();
  }

  searchImages(keywords, filters = {}) {
    let query = 'SELECT * FROM images WHERE 1=1';
    const params = [];

    // Keyword search (AND logic)
    if (keywords && keywords.trim()) {
      const terms = keywords.trim().split(/\s+/);
      terms.forEach(term => {
        query += ' AND filename LIKE ?';
        params.push(`%${term}%`);
      });
    }

    // Folder filter
    if (filters.folder) {
      query += ' AND folder LIKE ?';
      params.push(`${filters.folder}%`);
    }

    // Format filter
    if (filters.formats && filters.formats.length > 0) {
      const placeholders = filters.formats.map(() => '?').join(',');
      query += ` AND format IN (${placeholders})`;
      params.push(...filters.formats);
    }

    // Size filter (in KB)
    if (filters.minSize) {
      query += ' AND size >= ?';
      params.push(filters.minSize * 1024);
    }
    if (filters.maxSize) {
      query += ' AND size <= ?';
      params.push(filters.maxSize * 1024);
    }

    // Date filter
    if (filters.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  deleteImage(imagePath) {
    const stmt = this.db.prepare('DELETE FROM images WHERE path = ?');
    return stmt.run(imagePath);
  }

  // Update folder field for a specific image (by path)
  updateImageFolder(imagePath, folderPath) {
    const stmt = this.db.prepare('UPDATE images SET folder = ? WHERE path = ?');
    return stmt.run(folderPath, imagePath);
  }

  // Folder operations
  insertFolder(folderData) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO folders (path, parent_path, name, image_count, last_scan)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      folderData.path,
      folderData.parent_path,
      folderData.name,
      folderData.image_count || 0,
      Date.now()
    );
  }

  getAllFolders() {
    const stmt = this.db.prepare('SELECT * FROM folders ORDER BY path');
    return stmt.all();
  }

  getFolderByPath(folderPath) {
    const stmt = this.db.prepare('SELECT * FROM folders WHERE path = ?');
    return stmt.get(folderPath);
  }

  deleteFolder(folderPath) {
    const stmt = this.db.prepare('DELETE FROM folders WHERE path = ?');
    return stmt.run(folderPath);
  }

  deleteImagesByFolderPrefix(folderPath) {
    // 使用 folderPath/% 确保只匹配真正的子文件夹，避免误删同名前缀文件夹
    const stmt = this.db.prepare('DELETE FROM images WHERE folder = ? OR folder LIKE ?');
    return stmt.run(folderPath, `${folderPath}/%`);
  }

  deleteFoldersByPrefix(folderPath) {
    // 使用 folderPath/% 确保只匹配真正的子文件夹
    const stmt = this.db.prepare('DELETE FROM folders WHERE path = ? OR path LIKE ?');
    return stmt.run(folderPath, `${folderPath}/%`);
  }

  /**
   * 更新文件夹的文件数量（包含所有子文件夹中的图片）
   */
  updateFolderImageCount(folderPath) {
    // 统计该文件夹及其所有子文件夹中的图片总数
    // folder = ? 匹配直接子文件，folder LIKE ?/% 匹配所有子文件夹
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM images WHERE folder = ? OR folder LIKE ?'
    );
    const result = countStmt.get(folderPath, `${folderPath}/%`);
    
    // 更新文件夹记录
    const updateStmt = this.db.prepare('UPDATE folders SET image_count = ? WHERE path = ?');
    return updateStmt.run(result.count, folderPath);
  }

  /**
   * 批量更新所有文件夹的文件数量
   */
  updateAllFolderCounts() {
    const folders = this.getAllFolders();
    for (const folder of folders) {
      this.updateFolderImageCount(folder.path);
    }
  }

  getFolderTree() {
    const folders = this.getAllFolders();
    const tree = [];
    const map = {};

    // Build folder map
    folders.forEach(folder => {
      map[folder.path] = { ...folder, children: [] };
    });

    // Build tree structure
    folders.forEach(folder => {
      if (folder.parent_path && map[folder.parent_path]) {
        map[folder.parent_path].children.push(map[folder.path]);
      } else {
        tree.push(map[folder.path]);
      }
    });

    return tree;
  }

  close() {
    this.db.close();
  }
}

module.exports = LibraryDatabase;
