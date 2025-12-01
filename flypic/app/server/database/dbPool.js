const LibraryDatabase = require('./db');

/**
 * 数据库连接池管理器
 * 复用数据库连接，避免频繁创建/关闭
 */
class DatabasePool {
  constructor() {
    this.connections = new Map(); // libraryPath -> { db, lastUsed, refCount }
    this.maxIdleTime = 60000; // 60秒未使用则关闭
    this.cleanupInterval = null;
    
    // 启动定期清理
    this.startCleanup();
  }

  /**
   * 获取数据库连接（复用或创建）
   * 优化：同时只保持一个活跃连接
   */
  acquire(libraryPath) {
    let conn = this.connections.get(libraryPath);
    
    if (!conn) {
      // 如果已有其他连接且引用计数为0，先关闭它们
      for (const [path, existingConn] of this.connections.entries()) {
        if (existingConn.refCount === 0) {
          console.log(`[DBPool] Auto-closing idle connection: ${path}`);
          this.close(path);
        }
      }
      
      // 创建新连接
      const db = new LibraryDatabase(libraryPath);
      conn = {
        db,
        lastUsed: Date.now(),
        refCount: 0
      };
      this.connections.set(libraryPath, conn);
      console.log(`[DBPool] Created new connection for: ${libraryPath}`);
    }
    
    // 更新使用时间和引用计数
    conn.lastUsed = Date.now();
    conn.refCount++;
    
    return conn.db;
  }

  /**
   * 释放数据库连接（减少引用计数）
   */
  release(libraryPath) {
    const conn = this.connections.get(libraryPath);
    if (conn) {
      conn.refCount = Math.max(0, conn.refCount - 1);
      conn.lastUsed = Date.now();
    }
  }

  /**
   * 强制关闭指定连接
   */
  close(libraryPath) {
    const conn = this.connections.get(libraryPath);
    if (conn) {
      try {
        // 强制设置引用计数为0
        conn.refCount = 0;
        
        // 关闭数据库连接
        if (conn.db && conn.db.db) {
          // 执行 checkpoint 确保 WAL 写入主数据库
          try {
            conn.db.db.pragma('wal_checkpoint(TRUNCATE)');
          } catch (e) {
            console.warn(`[DBPool] WAL checkpoint warning:`, e.message);
          }
          
          // 关闭连接
          conn.db.close();
        }
        
        this.connections.delete(libraryPath);
        console.log(`[DBPool] Closed connection for: ${libraryPath}`);
      } catch (error) {
        console.error(`[DBPool] Error closing connection:`, error);
        // 即使出错也删除引用
        this.connections.delete(libraryPath);
      }
    }
  }

  /**
   * 关闭所有连接
   */
  closeAll() {
    for (const [path, conn] of this.connections.entries()) {
      try {
        conn.db.close();
        console.log(`[DBPool] Closed connection for: ${path}`);
      } catch (error) {
        console.error(`[DBPool] Error closing connection:`, error);
      }
    }
    this.connections.clear();
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 启动定期清理空闲连接
   */
  startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const toClose = [];
      
      for (const [path, conn] of this.connections.entries()) {
        // 如果连接空闲超过阈值且没有引用，则关闭
        if (conn.refCount === 0 && now - conn.lastUsed > this.maxIdleTime) {
          toClose.push(path);
        }
      }
      
      toClose.forEach(path => this.close(path));
      
      if (toClose.length > 0) {
        console.log(`[DBPool] Cleaned up ${toClose.length} idle connections`);
      }
    }, 30000); // 每30秒检查一次
  }

  /**
   * 获取连接池状态
   */
  getStatus() {
    const status = [];
    for (const [path, conn] of this.connections.entries()) {
      status.push({
        path,
        refCount: conn.refCount,
        idleTime: Date.now() - conn.lastUsed
      });
    }
    return status;
  }
}

// 单例模式
const dbPool = new DatabasePool();

module.exports = dbPool;
