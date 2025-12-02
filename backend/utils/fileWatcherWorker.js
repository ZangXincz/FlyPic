/**
 * File Watcher Worker - 在独立线程中运行 chokidar
 * 避免文件监控初始化阻塞主线程的事件循环
 */
const { parentPort, workerData } = require('worker_threads');
const chokidar = require('chokidar');

const { libraryPath, libraryName } = workerData;

console.log(`[Worker] Starting chokidar for: ${libraryName}`);

// 创建监控器（极致内存优化配置）
const watcher = chokidar.watch(libraryPath, {
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.flypic/**',
    '**/.*'
  ],
  persistent: true,
  // 跳过初始扫描，避免启动时内存激增（Requirements 11.4）
  ignoreInitial: true,
  // 禁用轮询，使用原生文件系统事件（Requirements 11.2）
  usePolling: false,
  // 禁用写入完成检测，减少内存开销（Requirements 11.3）
  awaitWriteFinish: false,
  // 禁用文件统计缓存，避免缓存大量文件元数据（Requirements 11.1）
  disableStatCache: true,
  // 不自动获取文件统计信息
  alwaysStat: false,
  // 限制深度
  depth: 99,
  // 确保监听删除事件
  ignorePermissionErrors: true
});

// 监听事件并发送到主线程
watcher
  .on('add', (filePath) => {
    parentPort.postMessage({ type: 'add', path: filePath });
  })
  .on('unlink', (filePath) => {
    parentPort.postMessage({ type: 'unlink', path: filePath });
  })
  .on('change', (filePath) => {
    parentPort.postMessage({ type: 'change', path: filePath });
  })
  .on('addDir', (dirPath) => {
    parentPort.postMessage({ type: 'addDir', path: dirPath });
  })
  .on('unlinkDir', (dirPath) => {
    parentPort.postMessage({ type: 'unlinkDir', path: dirPath });
  })
  .on('error', (error) => {
    parentPort.postMessage({ type: 'error', message: error.message });
  })
  .on('ready', () => {
    console.log(`[Worker] File watcher ready for: ${libraryName}`);
    parentPort.postMessage({ type: 'ready' });
  });

// 监听主线程的关闭命令
parentPort.on('message', (msg) => {
  if (msg.type === 'close') {
    console.log(`[Worker] Closing watcher for: ${libraryName}`);
    watcher.close().then(() => {
      parentPort.postMessage({ type: 'closed' });
      process.exit(0);
    });
  }
});
