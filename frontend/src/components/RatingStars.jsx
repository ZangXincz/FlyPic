import { useState } from 'react';
import { Star } from 'lucide-react';

/**
 * 评分星星组件
 * 支持悬浮预览和点击评分
 */
function RatingStars({ rating, onChange, size = 20, disabled = false }) {
  const [hoverRating, setHoverRating] = useState(0);
  
  const displayRating = hoverRating || rating || 0;
  
  const handleClick = (star) => {
    if (disabled) return;
    // 点击已选中的星星则取消评分
    const newRating = rating === star ? 0 : star;
    onChange?.(newRating);
  };
  
  return (
    <div 
      className="flex items-center gap-1"
      onMouseLeave={() => setHoverRating(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= displayRating;
        const isHovering = hoverRating > 0 && star <= hoverRating;
        
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            className={`
              transition-all duration-150
              ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-110'}
              ${isHovering ? 'animate-pulse' : ''}
            `}
            onMouseEnter={() => !disabled && setHoverRating(star)}
            onClick={() => handleClick(star)}
            title={`${star} 星`}
          >
            <Star
              size={size}
              className={`
                transition-colors duration-150
                ${isFilled 
                  ? 'fill-yellow-400 text-yellow-400' 
                  : 'fill-none text-gray-300 dark:text-gray-600'
                }
                ${isHovering ? 'drop-shadow-lg' : ''}
              `}
            />
          </button>
        );
      })}
      
      {/* 评分文字提示 */}
      {displayRating > 0 && (
        <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
          {displayRating} 星
        </span>
      )}
    </div>
  );
}

export default RatingStars;
