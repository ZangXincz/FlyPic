/**
 * 评分提醒 Toast 组件
 * 按下数字键快速评分后显示提醒
 */

import { useEffect } from 'react';
import { Star } from 'lucide-react';

function RatingToast({ isVisible, rating, count, onClose, duration = 2000 }) {
  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [isVisible, rating, count, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-2xl px-6 py-4 flex items-center gap-3 min-w-[200px]">
        <div className="flex items-center gap-1">
          {[...Array(rating)].map((_, i) => (
            <Star
              key={i}
              size={16}
              className="fill-yellow-400 text-yellow-400"
            />
          ))}
          {[...Array(5 - rating)].map((_, i) => (
            <Star
              key={i + rating}
              size={16}
              className="fill-none text-gray-600"
            />
          ))}
        </div>
        <span className="text-sm font-medium">
          {rating === 0 ? '已取消评分' : `已评 ${rating} 星`}
          {count > 1 ? ` (${count} 张)` : ''}
        </span>
      </div>
    </div>
  );
}

export default RatingToast;
