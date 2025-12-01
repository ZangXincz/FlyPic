import { useState, useEffect } from 'react';
import { Copy, Download, Check, FolderDown, ArrowLeft } from 'lucide-react';
import useStore from '../store/useStore';
import { imageAPI } from '../services/api';
import JSZip from 'jszip';

function RightPanel() {
  const { selectedImage, selectedImages, currentLibraryId, selectedFolder, images, setMobileView, isResizingPanels, resizingSide } = useStore();
  const [isMobile, setIsMobile] = useState(false);
  const [imageUrl, setImageUrl] = useState(''); // 当前显示的图片URL
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageCopied, setImageCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isExportingFolder, setIsExportingFolder] = useState(false);
  const [folderExportProgress, setFolderExportProgress] = useState(0);

  // 判断是单选还是多选
  const isMultiSelect = selectedImages.length > 0;
  const displayImage = isMultiSelect ? selectedImages[0] : selectedImage;

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 图片加载策略：先显示缩略图，后台加载原图；拖动右侧面板时只显示缩略图
  useEffect(() => {
    if (!selectedImage || !currentLibraryId) {
      setImageUrl('');
      return;
    }
    
    // 1. 立即显示缩略图
    const thumbnailUrl = getThumbnailUrl();
    setImageUrl(thumbnailUrl);
    setIsLoadingOriginal(true);
    
    // 如果正在拖动任一面板，则先不加载原图，降低主线程和解码压力
    if (isResizingPanels) {
      setIsLoadingOriginal(false);
      return;
    }

    // 2. 后台预加载原图
    const originalUrl = getOriginalUrl();
    const img = new Image();
    
    img.onload = () => {
      // 原图加载完成，切换到原图
      setImageUrl(originalUrl);
      setIsLoadingOriginal(false);
    };
    
    img.onerror = () => {
      // 原图加载失败，保持显示缩略图
      console.error('Failed to load original image');
      setIsLoadingOriginal(false);
    };
    
    img.src = originalUrl;
    
    // 清理函数
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [selectedImage, currentLibraryId, isResizingPanels, resizingSide]);

  if (!selectedImage && selectedImages.length === 0) {
    return (
      <div className="w-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">选择图片查看详情</p>
      </div>
    );
  }

  const getThumbnailUrl = () => {
    if (!currentLibraryId || !selectedImage.thumbnail_path) return '';
    // Handle both forward and backslash
    const filename = selectedImage.thumbnail_path.replace(/\\/g, '/').split('/').pop();
    return imageAPI.getThumbnailUrl(currentLibraryId, '200', filename);
  };
  
  const getOriginalUrl = () => {
    if (!currentLibraryId || !selectedImage.path) return '';
    return imageAPI.getOriginalUrl(currentLibraryId, selectedImage.path);
  };

  // 复制图片到剪贴板（支持粘贴到聊天软件和文件管理器）
  const copyImageToClipboard = async () => {
    try {
      // 获取原图URL
      const imageUrl = imageAPI.getOriginalUrl(currentLibraryId, selectedImage.path);
      
      // 获取图片数据
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // 创建临时图片元素
      const img = new Image();
      const loadPromise = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      img.src = URL.createObjectURL(blob);
      await loadPromise;
      
      // 使用 canvas 转换为 PNG
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      
      // 转换为 PNG blob
      canvas.toBlob(async (pngBlob) => {
        try {
          // 创建包含多种格式的剪贴板项
          const clipboardItem = new ClipboardItem({
            'image/png': pngBlob,
            // 添加 HTML 格式（支持更多粘贴场景）
            'text/html': new Blob(
              [`<img src="${imageUrl}" alt="${selectedImage.filename}">`],
              { type: 'text/html' }
            ),
            // 添加纯文本格式（文件路径）
            'text/plain': new Blob(
              [imageUrl],
              { type: 'text/plain' }
            )
          });
          
          await navigator.clipboard.write([clipboardItem]);
          
          setImageCopied(true);
          setTimeout(() => setImageCopied(false), 2000);
        } catch (err) {
          console.error('写入剪贴板失败:', err);
          // 如果多格式失败，尝试只复制图像
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': pngBlob })
            ]);
            setImageCopied(true);
            setTimeout(() => setImageCopied(false), 2000);
          } catch (fallbackErr) {
            console.error('备用方案也失败:', fallbackErr);
            alert('复制失败，请重试');
          }
        }
      }, 'image/png');
      
      // 清理
      URL.revokeObjectURL(img.src);
      
    } catch (error) {
      console.error('复制图片失败:', error);
      alert('复制图片失败，请重试');
    }
  };

  // 批量复制图片
  const copyMultipleImages = async () => {
    try {
      const imagesToCopy = isMultiSelect ? selectedImages : [selectedImage];
      
      if (imagesToCopy.length === 1) {
        // 单张图片：直接复制
        await copyImageToClipboard();
        return;
      }
      
      // 多张图片：浏览器限制，只能复制为 HTML 格式（包含多个 img 标签）
      // 这样粘贴到支持 HTML 的应用时，会显示为多张图片
      
      // 加载所有图片并转换为 base64
      const imageDataList = await Promise.all(
        imagesToCopy.map(async (img) => {
          const imageUrl = imageAPI.getOriginalUrl(currentLibraryId, img.path);
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          
          // 转换为 base64
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve({
                dataUrl: reader.result,
                filename: img.filename
              });
            };
            reader.readAsDataURL(blob);
          });
        })
      );
      
      // 创建 HTML 格式（多个图片）
      const htmlContent = imageDataList.map(({ dataUrl, filename }) => 
        `<img src="${dataUrl}" alt="${filename}" style="display:block; margin:10px 0;">`
      ).join('\n');
      
      // 创建纯文本格式（文件名列表）
      const textContent = imagesToCopy.map(img => img.filename).join('\n');
      
      try {
        // 尝试写入多种格式
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([textContent], { type: 'text/plain' })
          })
        ]);
        
        setImageCopied(true);
        setTimeout(() => setImageCopied(false), 2000);
      } catch (err) {
        console.error('写入剪贴板失败:', err);
        alert(`复制失败。\n\n提示：浏览器限制，多张图片会以 HTML 格式复制。\n可粘贴到 Word、富文本编辑器等。\n\n如需单独使用，请使用"导出"功能。`);
      }
      
    } catch (error) {
      console.error('复制图片失败:', error);
      alert('复制图片失败，请重试');
    }
  };

  // 批量导出图片（打包成 ZIP）
  const exportMultipleImages = async () => {
    setIsExporting(true);
    try {
      const imagesToExport = isMultiSelect ? selectedImages : [selectedImage];
      
      if (imagesToExport.length === 1) {
        // 单张图片直接下载
        const url = imageAPI.getOriginalUrl(currentLibraryId, imagesToExport[0].path);
        const link = document.createElement('a');
        link.href = url;
        link.download = imagesToExport[0].filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // 多张图片：打包成 ZIP
        const zip = new JSZip();
        const folder = zip.folder('images');
        
        setExportProgress(0);
        
        // 下载所有图片并添加到 ZIP
        for (let i = 0; i < imagesToExport.length; i++) {
          const img = imagesToExport[i];
          const url = imageAPI.getOriginalUrl(currentLibraryId, img.path);
          
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            
            // 添加到 ZIP，使用原文件名
            folder.file(img.filename, blob);
            
            // 更新进度
            const progress = Math.round(((i + 1) / imagesToExport.length) * 90); // 90% 用于下载
            setExportProgress(progress);
            
            console.log(`已添加: ${img.filename} (${i + 1}/${imagesToExport.length})`);
          } catch (error) {
            console.error(`下载失败: ${img.filename}`, error);
          }
        }
        
        // 生成 ZIP 文件
        setExportProgress(95);
        console.log('正在生成 ZIP 文件...');
        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 }
        });
        
        // 下载 ZIP 文件
        setExportProgress(100);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = `FlyPic_导出_${imagesToExport.length}张_${Date.now()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        console.log('导出完成！');
      }
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  // 导出当前文件夹的所有图片
  const exportCurrentFolder = async () => {
    if (!selectedFolder) {
      alert('请先选择一个文件夹');
      return;
    }

    setIsExportingFolder(true);
    setFolderExportProgress(0);

    try {
      // 获取当前文件夹下的所有图片
      const folderImages = images.filter(img => {
        // 检查图片是否在当前文件夹或其子文件夹中
        return img.folder && img.folder.startsWith(selectedFolder);
      });

      if (folderImages.length === 0) {
        alert('当前文件夹没有图片');
        return;
      }

      // 创建 ZIP
      const zip = new JSZip();
      const folderName = selectedFolder.split('/').pop() || 'images';
      const folder = zip.folder(folderName);

      // 下载所有图片并添加到 ZIP
      for (let i = 0; i < folderImages.length; i++) {
        const img = folderImages[i];
        const url = imageAPI.getOriginalUrl(currentLibraryId, img.path);

        try {
          const response = await fetch(url);
          const blob = await response.blob();

          // 保持相对路径结构
          const relativePath = img.folder.replace(selectedFolder, '').replace(/^\//, '');
          const filePath = relativePath ? `${relativePath}/${img.filename}` : img.filename;
          
          folder.file(filePath, blob);

          // 更新进度
          const progress = Math.round(((i + 1) / folderImages.length) * 90);
          setFolderExportProgress(progress);

          console.log(`已添加: ${filePath} (${i + 1}/${folderImages.length})`);
        } catch (error) {
          console.error(`下载失败: ${img.filename}`, error);
        }
      }

      // 生成 ZIP 文件
      setFolderExportProgress(95);
      console.log('正在生成 ZIP 文件...');
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // 下载 ZIP 文件
      setFolderExportProgress(100);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `${folderName}_${folderImages.length}张_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      console.log('文件夹导出完成！');
    } catch (error) {
      console.error('导出文件夹失败:', error);
      alert('导出文件夹失败，请重试');
    } finally {
      setIsExportingFolder(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  };

  return (
    <div className="w-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col h-full">
      {/* 移动端返回按钮 */}
      {isMobile && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center">
          <button
            onClick={() => setMobileView('main')}
            className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-blue-500"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回</span>
          </button>
        </div>
      )}
      
      {/* Progressive Image Preview */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="w-full aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden relative">
          <img
            src={imageUrl}
            alt={displayImage.filename}
            decoding="async"
            className={`w-full h-full object-contain transition-opacity duration-300 ${
              isLoadingOriginal ? 'opacity-75' : 'opacity-100'
            }`}
          />
          {isLoadingOriginal && (
            <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
              加载原图中...
            </div>
          )}
        </div>
      </div>

      {/* Image Info - 可滚动区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">基本信息</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">文件名:</span>
              <p className="text-gray-900 dark:text-gray-100 break-all">{selectedImage.filename}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">尺寸:</span>
              <p className="text-gray-900 dark:text-gray-100">
                {selectedImage.width} × {selectedImage.height}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">大小:</span>
              <p className="text-gray-900 dark:text-gray-100">{formatFileSize(selectedImage.size)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">格式:</span>
              <p className="text-gray-900 dark:text-gray-100 uppercase">{selectedImage.format}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">创建时间:</span>
              <p className="text-gray-900 dark:text-gray-100">{formatDate(selectedImage.created_at)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">修改时间:</span>
              <p className="text-gray-900 dark:text-gray-100">{formatDate(selectedImage.modified_at)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">路径:</span>
              <p className="text-gray-900 dark:text-gray-100 text-xs break-all">{selectedImage.path}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions - 仅桌面端显示 */}
      {!isMobile && (
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2 flex-shrink-0">
        {/* 复制按钮 */}
        <button
          onClick={copyMultipleImages}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all ${
            imageCopied
              ? 'bg-green-500 text-white'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {imageCopied ? (
            <>
              <Check className="w-4 h-4" />
              <span>已复制{isMultiSelect ? ` ${selectedImages.length} 张` : ''}</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>复制图片{isMultiSelect ? ` (${selectedImages.length})` : ''}</span>
            </>
          )}
        </button>
        
        {/* 导出按钮 */}
        <button
          onClick={exportMultipleImages}
          disabled={isExporting}
          className="w-full flex flex-col items-center justify-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>
              {isExporting 
                ? `打包中... ${exportProgress}%` 
                : `导出图片${isMultiSelect ? ` (${selectedImages.length})` : ''}`
              }
            </span>
          </div>
          {isExporting && isMultiSelect && (
            <div className="w-full bg-gray-300 dark:bg-gray-600 rounded-full h-1.5 mt-1">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
          )}
        </button>
        
        {/* 导出文件夹按钮 */}
        {selectedFolder && (
          <button
            onClick={exportCurrentFolder}
            disabled={isExportingFolder}
            className="w-full flex flex-col items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2">
              <FolderDown className="w-4 h-4" />
              <span>
                {isExportingFolder 
                  ? `打包文件夹... ${folderExportProgress}%` 
                  : '导出当前文件夹'
                }
              </span>
            </div>
            {isExportingFolder && (
              <div className="w-full bg-purple-300 rounded-full h-1.5 mt-1">
                <div
                  className="bg-white h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${folderExportProgress}%` }}
                />
              </div>
            )}
          </button>
        )}
      </div>
      )}
    </div>
  );
}

export default RightPanel;
