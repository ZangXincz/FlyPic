const express = require('express');
const router = express.Router();

// Start watching a library
router.post('/start/:libraryId', (req, res) => {
  const startTime = Date.now();
  try {
    const { libraryId } = req.params;
    const fileWatcher = req.app.get('fileWatcher');
    const io = req.app.get('io');

    // 立即返回响应，让文件监控在后台启动
    res.json({
      message: 'File watching starting',
      libraryId,
      isWatching: true
    });

    // 异步启动监控（不阻塞响应）
    setImmediate(() => {
      try {
        fileWatcher.watch(libraryId, io);
        console.log(`[Watch] Started in ${Date.now() - startTime}ms`);
      } catch (watchError) {
        console.error(`Failed to start file watching for ${libraryId}:`, watchError.message);
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stop watching a library
router.post('/stop/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    const fileWatcher = req.app.get('fileWatcher');

    fileWatcher.unwatch(libraryId);

    res.json({
      message: 'File watching stopped',
      libraryId,
      isWatching: false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get watch status
router.get('/status/:libraryId', (req, res) => {
  try {
    const { libraryId } = req.params;
    const fileWatcher = req.app.get('fileWatcher');

    const isWatching = fileWatcher.isWatching(libraryId);

    res.json({
      libraryId,
      isWatching
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all watched libraries
router.get('/list', (req, res) => {
  try {
    const fileWatcher = req.app.get('fileWatcher');
    const watchedLibraries = fileWatcher.getWatchedLibraries();

    res.json({
      watchedLibraries,
      count: watchedLibraries.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
