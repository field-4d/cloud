/*
 * PlotExpandOverlay.tsx
 * Presentational fullscreen portal overlay used to display the currently active
 * plot at a larger size. Contains no plotting/business logic - it only hosts
 * whatever plot element is passed in as `children`, so the embedded and
 * expanded views always render from the exact same source.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PlotExpandOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Ref attached to the scrollable content area, used by callers that need to measure available width/height (e.g. Histogram). */
  contentRef?: React.Ref<HTMLDivElement>;
}

const CloseIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/**
 * PlotExpandOverlay
 * Renders `children` inside a fixed, near-fullscreen (~95vw x 92vh) modal via a portal
 * to `document.body`. Closes on Escape or the close button, and locks background
 * body scrolling while open (restored automatically on close/unmount).
 */
const PlotExpandOverlay: React.FC<PlotExpandOverlayProps> = ({ isOpen, onClose, title, children, contentRef }) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Expanded plot'}
    >
      <div className="flex h-[92vh] w-[95vw] flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex flex-none items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="text-base font-semibold text-gray-800">{title ?? 'Expanded Plot'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close expanded plot"
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ac6bb]"
          >
            <CloseIcon />
          </button>
        </div>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-auto px-3 pb-3 pt-5">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PlotExpandOverlay;
