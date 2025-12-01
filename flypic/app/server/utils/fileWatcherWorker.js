/**
 * File Watcher Worker - 在独立线程中运行 chokidar
 * 避免文件监控初始化阻塞主线程的事件循环
 */
const { parentPort, workerData } = require('worker_threads');
const chokidar = require('chokidar');

const { libraryPath, libraryName } = workerData;

console.log(`[Worker] Starting chokidar for: ${libraryName}`);

// 创建监控器
const watcher = chokidar.watch(['**/*.*', '**/'], {
  cwd: libraryPath,
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/.flypic/**',
    '**/.*'
  ],
  persistent: true,
  ignoreInitial: true,
  usePolling: false,
  awaitWriteFinish: {
    stabilityThreshold: 1000,
    pollInterval: 200
  }
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
