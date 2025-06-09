import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'medium', 
  color = '#8AC6B6', // Using your theme color
  text
}) => {
  const sizeMap = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12'
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-full min-h-[200px] space-y-4">
      <div
        className={`${sizeMap[size]} animate-spin rounded-full border-4 border-t-transparent`}
        style={{ borderColor: `${color} transparent ${color} ${color}` }}
      />
      {text && (
        <p className="text-[#8AC6B6] font-medium animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
};

export default LoadingSpinner; 