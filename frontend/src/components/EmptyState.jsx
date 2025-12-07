/**
 * 空状态提示组件
 */

const EmptyState = ({ isLoading }) => {
  return (
    <div className="text-center">
      {isLoading ? (
        <p className="text-lg mb-2">加载中...</p>
      ) : (
        <>
          <p className="text-lg mb-2">暂无图片</p>
          <p className="text-sm">请添加素材库或调整搜索条件</p>
          <p className="text-xs mt-4 text-gray-400">可以直接拖拽文件到这里上传</p>
        </>
      )}
    </div>
  );
};

export default EmptyState;
