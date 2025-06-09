import React from 'react';
import { AlertTriangle } from 'lucide-react'; // make sure lucide-react is installed

interface LabelWarningPlaceholderProps {
  fontColor?: string;
  fontSize?: number | string;
}

const LabelWarningPlaceholder: React.FC<LabelWarningPlaceholderProps> = ({ fontColor = '#8AC6BB', fontSize = 20 }) => (
  <div className="w-full min-h-[300px] flex items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
    <div className="flex items-center gap-3 text-center text-lg md:text-xl text-gray-700 dark:text-gray-200 font-semibold px-4">
      <AlertTriangle className="text-primary-500 w-6 h-6 animate-pulse" />
      <span style={{ color: fontColor || undefined, fontSize: fontSize || undefined }}>
        Please <span className="text-primary-500">select one or more labels</span> to display this graph.
      </span>
    </div>
  </div>
);

export default LabelWarningPlaceholder;
