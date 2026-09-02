import React from 'react';

interface Field4DLoadingLogoProps {
  label?: string;
  className?: string;
}

const Field4DLoadingLogo: React.FC<Field4DLoadingLogoProps> = ({
  label = 'Loading data access...',
  className = '',
}) => (
  <div
    className={`field4d-loading-logo ${className}`.trim()}
    data-testid="field4d-loading-logo"
    role="status"
    aria-live="polite"
  >
    <div
      className="field4d-loading-logo__mark"
      data-testid="field4d-loading-logo-mark"
      aria-hidden="true"
    >
      <img src="/logo.png" alt="" className="field4d-loading-logo__image" />
    </div>
    <span key={label} className="field4d-loading-logo__label">{label}</span>
  </div>
);

export default Field4DLoadingLogo;
