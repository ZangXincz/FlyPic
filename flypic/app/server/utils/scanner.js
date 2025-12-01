const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { 
  isImageFile, 
  calculateFileHash, 
  getImageMetadata, 
  generateImageThumbnails 
} = require('./thumbnail');

/**
 * Get all image files in a directory
 */
async function getAllImageFiles(libraryPath) {
  // 仅匹配常见图片扩展，避免遍历所有非图片文件，显著降低 IO
  const exts = '{jpg,jpeg,png,webp,gif,bmp,tiff}';
  const pattern = path.join(libraryPath, '**', `*.${exts}`).replace(/\\/g, '/');
  const files = await glob(pattern, {
    nodir: true,
    nocase: true, // 大小写不敏感（Windows/macOS）
    ignore: ['**/.flypic/**', '**/node_modules/**']
  });
  return files;
}

/**
 * Ensure a folder and its parents exist in DB
 */
function ensureFolderChain(db, folderPath) {
  if (!folderPath || folderPath === '.' || folderPath === '') return;
  let current = folderPath;
  const visited = new Set();
  while (current && current !== '.' && !visited.has(current)) {
    visited.add(current);
    const parent = path.dirname(current);
    const name = path.basename(current);
    const existing = db.getFolderByPath(current);
    if (!existing) {
      db.insertFolder({
        path: current,
        parent_path: parent === '.' ? '' : parent,
        name,
        image_count: 0
      });
    }
    if (parent === current) break;
    current = parent;
  }
}

/**
 * Apply changes from file system events quickly without full rescan
 * events = {
 *   filesAdded: [relPath],
 *   filesChanged: [relPath],
 *   filesRemoved: [relPath],
 *   dirsAdded: [relDir],
 *   dirsRemoved: [relDir]
 * }
 */
async function applyChangesFromEvents(libraryPath, db, events) {
  try {
    // Normalize helper to OS-specific separators to match DB records
    const norm = (p) => path.normalize(p);

    const affectedFolders = new Set();
    const results = { added: 0, modified: 0, deleted: 0, foldersAdded: 0, foldersRemoved: 0 };

    // Handle directory additions (ensure chain exists)
    for (const dir of (events.dirsAdded || [])) {
      const d = norm(dir);
      ensureFolderChain(db, d);
      results.foldersAdded++;
      // update parents too
      let cur = d;
      while (cur && cur !== '.') {
        affectedFolders.add(cur);
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
    }

    // Handle file additions
    for (const file of (events.filesAdded || [])) {
      try {
        const rel = norm(file);
        const full = path.join(libraryPath, rel);
        
        // 检查文件是否存在
        if (!fs.existsSync(full)) {
          console.warn(`File not found, skipping: ${full}`);
          continue;
        }
        
        const folder = path.dirname(rel);
        ensureFolderChain(db, folder);
        await processImage(full, libraryPath, db);
        affectedFolders.add(folder);
        // parents
        let cur = folder;
        while (cur && cur !== '.') {
          affectedFolders.add(cur);
          const parent = path.dirname(cur);
          if (parent === cur) break;
          cur = parent;
        }
        results.added++;
      } catch (error) {
        console.error(`Error processing added file ${file}:`, error.message);
      }
    }

    // Handle file changes
    for (const file of (events.filesChanged || [])) {
      try {
        const rel = norm(file);
        const full = path.join(libraryPath, rel);
        
        // 检查文件是否存在
        if (!fs.existsSync(full)) {
          console.warn(`File not found, skipping: ${full}`);
          continue;
        }
        
        await processImage(full, libraryPath, db);
        const folder = path.dirname(rel);
        affectedFolders.add(folder);
        results.modified++;
      } catch (error) {
        console.error(`Error processing changed file ${file}:`, error.message);
      }
    }

    // Handle file removals
    for (const file of (events.filesRemoved || [])) {
      try {
        const rel = norm(file);
        db.deleteImage(rel);
        const folder = path.dirname(rel);
        affectedFolders.add(folder);
        // parents
        let cur = folder;
        while (cur && cur !== '.') {
          affectedFolders.add(cur);
          const parent = path.dirname(cur);
          if (parent === cur) break;
          cur = parent;
        }
        results.deleted++;
      } catch (error) {
        console.error(`Error deleting file ${file}:`, error.message);
      }
    }

    // Handle directory removals (bulk delete)
    for (const dir of (events.dirsRemoved || [])) {
      try {
        const d = norm(dir);
        // delete images and folders under this dir
        db.deleteImagesByFolderPrefix(d);
        db.deleteFoldersByPrefix(d);
        const parent = path.dirname(d);
        if (parent && parent !== '.') affectedFolders.add(parent);
        results.foldersRemoved++;
      } catch (error) {
        console.error(`Error deleting directory ${dir}:`, error.message);
      }
    }

    // Update counts for all affected folders
    affectedFolders.forEach((folderPath) => {
      if (folderPath && folderPath !== '.') {
        try {
          db.updateFolderImageCount(folderPath);
        } catch (error) {
          console.error(`Error updating folder count ${folderPath}:`, error.message);
        }
      }
    });

    return results;
  } catch (error) {
    console.error('Error in applyChangesFromEvents:', error);
    throw error;
  }
}

/**
 * Get folder structure
 */
async function getFolderStructure(libraryPath) {
  const folders = [];
  
  function scanDir(dirPath, parentPath = '') {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory() && !item.name.startsWith('.')) {
        const fullPath = path.join(dirPath, item.name);
        const relativePath = path.relative(libraryPath, fullPath);
        
        folders.push({
          path: relativePath,
          parent_path: parentPath,
          name: item.name,
          image_count: 0
        });
        
        scanDir(fullPath, relativePath);
      }
    }
  }
  
  scanDir(libraryPath);
  return folders;
}

/**
 * Process a single image file
 */
async function processImage(imagePath, libraryPath, db) {
  try {
    const relativePath = path.relative(libraryPath, imagePath);
    const filename = path.basename(imagePath);
    const folder = path.dirname(relativePath);
    
    // Check if image already exists in database
    const existing = db.getImageByPath(relativePath);
    const currentHash = calculateFileHash(imagePath);
    
    // Skip if file hasn't changed
    if (existing && existing.file_hash === currentHash) {
      return { status: 'skipped', path: relativePath };
    }
    
    // Get image metadata
    const metadata = await getImageMetadata(imagePath);
    if (!metadata) {
      return { status: 'error', path: relativePath, error: 'Failed to read metadata' };
    }
    
    // Generate thumbnails
    const thumbnails = await generateImageThumbnails(imagePath, libraryPath);
    
    // Insert/update in database
    db.insertImage({
      path: relativePath,
      filename: filename,
      folder: folder,
      size: metadata.size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      created_at: Math.floor(metadata.created_at),
      modified_at: Math.floor(metadata.modified_at),
      file_hash: currentHash,
      thumbnail_path: thumbnails.thumbnail_path,
      thumbnail_size: thumbnails.thumbnail_size
    });
    
    return { status: 'processed', path: relativePath };
  } catch (error) {
    console.error('Error processing image:', imagePath, error);
    return { status: 'error', path: imagePath, error: error.message };
  }
}

/**
 * Scan library and update database
 */
async function scanLibrary(libraryPath, db, onProgress) {
  try {
    // Get all image files
    const files = await getAllImageFiles(libraryPath);
    const total = files.length;
    
    console.log(`Found ${total} images in library`);
    
    // Get folder structure
    const folders = await getFolderStructure(libraryPath);
    folders.forEach(folder => db.insertFolder(folder));
    
    // Process images in batches
    const batchSize = 50;
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0
    };
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(file => processImage(file, libraryPath, db))
      ).then(batchResults => {
        batchResults.forEach(result => {
          if (result.status === 'processed') results.processed++;
          else if (result.status === 'skipped') results.skipped++;
          else if (result.status === 'error') results.errors++;
        });
      });
      
      // Report progress
      if (onProgress) {
        onProgress({
          total,
          current: Math.min(i + batchSize, total),
          percent: Math.round((Math.min(i + batchSize, total) / total) * 100),
          currentFile: batch[batch.length - 1]
        });
      }
    }
    
    // Update folder image counts
    folders.forEach(folder => {
      db.updateFolderImageCount(folder.path);
    });
    
    console.log('Scan complete:', results);
    return results;
  } catch (error) {
    console.error('Error scanning library:', error);
    throw error;
  }
}

/**
 * Sync library (incremental scan)
 */
async function syncLibrary(libraryPath, db, forceRebuildFolders = false) {
  try {
    // Get all current files
    const currentFiles = await getAllImageFiles(libraryPath);
    const currentPaths = new Set(
      currentFiles.map(file => path.relative(libraryPath, file))
    );
    
    // Get database files
    const dbImages = db.getAllImages();
    const dbPaths = new Set(dbImages.map(img => img.path));
    
    // Find new, modified, and deleted files
    const toAdd = [...currentPaths].filter(p => !dbPaths.has(p));
    const toCheck = [...currentPaths].filter(p => dbPaths.has(p));
    const toDelete = [...dbPaths].filter(p => !currentPaths.has(p));
    
    console.log(`Sync: ${toAdd.length} new, ${toCheck.length} to check, ${toDelete.length} deleted`);
    
    // Process new files
    for (const relativePath of toAdd) {
      const fullPath = path.join(libraryPath, relativePath);
      await processImage(fullPath, libraryPath, db);
    }
    
    // Check modified files
    for (const relativePath of toCheck) {
      const fullPath = path.join(libraryPath, relativePath);
      const existing = db.getImageByPath(relativePath);
      const currentHash = calculateFileHash(fullPath);
      
      if (existing.file_hash !== currentHash) {
        await processImage(fullPath, libraryPath, db);
      }
    }
    
    // Delete removed files
    for (const relativePath of toDelete) {
      db.deleteImage(relativePath);
      // TODO: Clean up thumbnail files
    }
    
    // Rebuild folder structure if there are changes or forced
    if (toAdd.length > 0 || toDelete.length > 0 || forceRebuildFolders) {
      console.log('Rebuilding folder structure...');
      
      // Get current folder structure from file system
      const currentFolders = await getFolderStructure(libraryPath);
      
      // Get existing folders from database
      const dbFolders = db.getAllFolders();
      const dbFolderPaths = new Set(dbFolders.map(f => f.path));
      
      // Find new and deleted folders
      const currentFolderPaths = new Set(currentFolders.map(f => f.path));
      const foldersToAdd = currentFolders.filter(f => !dbFolderPaths.has(f.path));
      const foldersToDelete = dbFolders.filter(f => !currentFolderPaths.has(f.path));
      
      // Add new folders
      foldersToAdd.forEach(folder => {
        db.insertFolder(folder);
      });
      
      // Delete removed folders
      foldersToDelete.forEach(folder => {
        db.deleteFolder(folder.path);
      });
      
      console.log(`Folders: +${foldersToAdd.length}, -${foldersToDelete.length}`);
      
      // Update folder image counts
      console.log('Updating folder image counts...');
      const affectedFolders = new Set();
      
      // Collect all affected folders (including parent folders)
      [...toAdd, ...toDelete].forEach(relativePath => {
        let folderPath = path.dirname(relativePath);
        
        // Add current folder and all parent folders
        while (folderPath && folderPath !== '.') {
          affectedFolders.add(folderPath);
          const parent = path.dirname(folderPath);
          if (parent === folderPath) break; // Reached root
          folderPath = parent;
        }
      });
      
      // Update counts for all affected folders
      affectedFolders.forEach(folderPath => {
        db.updateFolderImageCount(folderPath);
      });
      
      console.log(`Updated ${affectedFolders.size} folder counts`);
    }
    
    return {
      added: toAdd.length,
      modified: toCheck.length,
      deleted: toDelete.length
    };
  } catch (error) {
    console.error('Error syncing library:', error);
    throw error;
  }
}

module.exports = {
  getAllImageFiles,
  getFolderStructure,
  processImage,
  scanLibrary,
  syncLibrary,
  applyChangesFromEvents
};
