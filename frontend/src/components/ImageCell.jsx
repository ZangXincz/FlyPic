/**
 * 图片单元格组件
 */

import { Play, FileText, Palette, Music, File } from 'lucide-react';

const ImageCell = ({
  image,
  flatIndex,
  isSelected,
  renamingImage,
  editingFilename,
  editInputRef,
  getThumbnailUrl,
  onImageClick,
  onImageDoubleClick,
  onContextMenu,
  onDragStart,
  onEditingChange,
  onFinishRename,
  onCancelRename,
  onStartRename
}) => {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onFinishRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelRename();
    }
  };

  const handleDoubleClickFilename = (e) => {
    // 始终阻止事件冒泡，避免触发图片放大
    e.stopPropagation();
    
    // 只在单选且不在编辑状态时允许双击重命名
    if (!renamingImage) {
      onStartRename(image);
    }
  };

  return (
    <div
      className="flex-shrink-0"
      style={{ width: `${image.calculatedWidth}px` }}
    >
      <div
        className={`relative group cursor-pointer overflow-hidden rounded-lg transition-all hover:shadow-lg ${
          isSelected 
            ? 'border-2 border-blue-400 dark:border-blue-500' 
            : 'border border-gray-200 dark:border-gray-600'
        }`}
        style={{ 
          height: `${image.calculatedHeight}px`
        }}
        onClick={(e) => onImageClick(image, e, flatIndex)}
        onDoubleClick={() => onImageDoubleClick(image, flatIndex)}
        onContextMenu={(e) => onContextMenu(e, image)}
        draggable={true}
        onDragStart={(e) => onDragStart(e, image)}
      >
        <img
          src={getThumbnailUrl(image) || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3Ctext x="50%25" y="45%25" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-family="sans-serif" font-size="14"%3E需要同步%3C/text%3E%3Ctext x="50%25" y="60%25" dominant-baseline="middle" text-anchor="middle" fill="%23d1d5db" font-family="sans-serif" font-size="12"%3E点击同步按钮%3C/text%3E%3C/svg%3E'}
          alt={image.filename}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23fef2f2" width="200" height="200"/%3E%3Ctext x="50%25" y="45%25" dominant-baseline="middle" text-anchor="middle" fill="%23dc2626" font-family="sans-serif" font-size="14"%3E加载失败%3C/text%3E%3Ctext x="50%25" y="60%25" dominant-baseline="middle" text-anchor="middle" fill="%23f87171" font-family="sans-serif" font-size="12"%3E请重新同步%3C/text%3E%3C/svg%3E';
            e.target.onerror = null;
          }}
        />
        
        {/* 文件类型标识 */}
        {image.fileType && image.fileType !== 'image' && (
          <div className={`absolute top-2 right-2 rounded-md px-2 py-1 flex items-center gap-1 shadow-lg ${
            image.fileType === 'video' ? 'bg-blue-500 bg-opacity-90' :
            image.fileType === 'audio' ? 'bg-pink-500 bg-opacity-90' :
            image.fileType === 'document' ? 'bg-green-500 bg-opacity-90' :
            image.fileType === 'design' ? 'bg-purple-500 bg-opacity-90' :
            'bg-gray-500 bg-opacity-90'
          }`}>
            {image.fileType === 'video' && <Play className="w-4 h-4 text-white fill-white" />}
            {image.fileType === 'audio' && <Music className="w-4 h-4 text-white" />}
            {image.fileType === 'document' && <FileText className="w-4 h-4 text-white" />}
            {image.fileType === 'design' && <Palette className="w-4 h-4 text-white" />}
            {image.fileType === 'other' && <File className="w-4 h-4 text-white" />}
            <span className="text-white text-xs font-semibold uppercase">
              {image.format || image.filename.split('.').pop()}
            </span>
          </div>
        )}
        
        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all pointer-events-none" />
      </div>
      
      <div className="mt-1 px-1 h-4 flex items-center">
        {renamingImage?.id === image.id ? (
          // 编辑模式
          <input
            ref={editInputRef}
            type="text"
            value={editingFilename}
            onChange={(e) => onEditingChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onFinishRename}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-xs text-center bg-transparent border-none outline-none focus:outline-none underline decoration-2 decoration-blue-500 underline-offset-2 truncate leading-none"
            style={{ 
              color: isSelected ? '#3b82f6' : '#909090',
              fontWeight: isSelected ? '600' : '400',
              padding: 0,
              margin: 0,
              height: '1rem'
            }}
          />
        ) : (
          // 显示模式
          <p 
            className="text-xs truncate text-center transition-colors cursor-text m-0 leading-none"
            style={{ 
              color: isSelected ? '#3b82f6' : '#909090',
              fontWeight: isSelected ? '600' : '400',
              height: '1rem'
            }}
            onDoubleClick={handleDoubleClickFilename}
            title="双击重命名"
          >
            {image.filename}
          </p>
        )}
      </div>
    </div>
  );
};

export default ImageCell;
