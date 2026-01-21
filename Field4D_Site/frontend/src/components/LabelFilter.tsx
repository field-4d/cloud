import React from 'react';
import Select from 'react-select';
import { components, OptionProps } from 'react-select';

interface LabelFilterProps {
  sensorLabelOptions: string[];
  sensorLabelMap: Record<string, string[]>;
  onFilterChange: (filteredSensors: string[], includeLabels: string[], excludeLabels: string[]) => void;
}

interface LabelOption {
  value: string;
  label: string;
}

// Custom Option component with checkbox
const Option = (props: OptionProps<LabelOption, true>) => {
  return (
    <div className="cursor-pointer">
      <components.Option {...props}>
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={props.isSelected}
            onChange={() => null}
            className="rounded text-[#8ac6bb] focus:ring-[#8ac6bb] cursor-pointer"
          />
          <span>{props.label}</span>
        </div>
      </components.Option>
    </div>
  );
};


const LabelFilter: React.FC<LabelFilterProps> = ({
  sensorLabelOptions,
  sensorLabelMap,
  onFilterChange
}) => {
  const [selectedIncludeLabels, setSelectedIncludeLabels] = React.useState<string[]>([]);
  const [selectedExcludeLabels, setSelectedExcludeLabels] = React.useState<string[]>([]);
  const [isAndMode, setIsAndMode] = React.useState(false);

  // Icon size variable for AND/OR images
  const iconSize = "w-12 h-12";

  // Convert label options to react-select format
  const labelOptions: LabelOption[] = sensorLabelOptions.map(label => ({
    value: label,
    label: label
  }));

  // Function to filter sensors based on selected labels and logic mode
  const filterSensors = React.useCallback((
    includeLabels: string[],
    excludeLabels: string[],
    andMode: boolean
  ) => {
    if (includeLabels.length === 0 && excludeLabels.length === 0) {
      onFilterChange(Object.keys(sensorLabelMap), includeLabels, excludeLabels);
      return;
    }

    const filteredSensors = Object.entries(sensorLabelMap)
      .filter(([_, sensorLabels]) => {
        // Handle include labels
        if (includeLabels.length > 0) {
          const hasIncludeLabels = andMode
            ? includeLabels.every(label => sensorLabels.includes(label))
            : includeLabels.some(label => sensorLabels.includes(label));
          if (!hasIncludeLabels) return false;
        }

        // Handle exclude labels
        if (excludeLabels.length > 0) {
          const hasExcludeLabels = excludeLabels.some(label => 
            sensorLabels.includes(label)
          );
          if (hasExcludeLabels) return false;
        }

        return true;
      })
      .map(([sensor]) => sensor);

    onFilterChange(filteredSensors, includeLabels, excludeLabels);
  }, [sensorLabelMap, onFilterChange]);

  // Handle include labels change
  const handleIncludeLabelsChange = (selected: any) => {
    const newIncludeLabels = selected.map((option: LabelOption) => option.value);
    setSelectedIncludeLabels(newIncludeLabels);
    filterSensors(newIncludeLabels, selectedExcludeLabels, isAndMode);
  };

  // Handle exclude labels change
  const handleExcludeLabelsChange = (selected: any) => {
    const newExcludeLabels = selected.map((option: LabelOption) => option.value);
    setSelectedExcludeLabels(newExcludeLabels);
    filterSensors(selectedIncludeLabels, newExcludeLabels, isAndMode);
  };

  // Handle logic mode change
  const handleLogicModeChange = (newMode: boolean) => {
    setIsAndMode(newMode);
    filterSensors(selectedIncludeLabels, selectedExcludeLabels, newMode);
  };

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Label Filter</h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleLogicModeChange(false)}
            className={`p-2 rounded-full transition-colors ${
              !isAndMode ? 'bg-[#8ac6bb] text-white' : 'bg-gray-100 text-gray-600'
            }`}
            title="OR Mode"
          >
            <img src="/OR_Large.png" alt="OR Mode" className={`${iconSize} object-contain p-1 bg-white rounded-full border border-gray-300`} />
          </button>
          <button
            onClick={() => handleLogicModeChange(true)}
            className={`p-2 rounded-full transition-colors ${
              isAndMode ? 'bg-[#8ac6bb] text-white' : 'bg-gray-100 text-gray-600'
            }`}
            title="AND Mode"
          >
            <img src="/AND_Large.png" alt="AND Mode" className={`${iconSize} object-contain p-1 bg-white rounded-full border border-gray-300`} />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Include Labels
        </label>
        <Select
          isMulti
          options={labelOptions.sort((a, b) => a.label.localeCompare(b.label))}
          value={labelOptions.filter(option => selectedIncludeLabels.includes(option.value))}
          onChange={handleIncludeLabelsChange}
          components={{ Option }}
          className="basic-multi-select"
          classNamePrefix="select"
          closeMenuOnSelect={false}
          hideSelectedOptions={false}
          placeholder="Select labels to include..."
          theme={(theme) => ({
            ...theme,
            colors: {
              ...theme.colors,
              primary: '#8ac6bb',
              primary25: '#e6f0ee',
              primary50: '#d1e3e0',
              primary75: '#b2d8d1'
            },
          })}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Exclude Labels
        </label>
        <Select
          isMulti
          options={labelOptions.sort((a, b) => a.label.localeCompare(b.label))}
          value={labelOptions.filter(option => selectedExcludeLabels.includes(option.value))}
          onChange={handleExcludeLabelsChange}
          components={{ Option }}
          className="basic-multi-select"
          classNamePrefix="select"
          closeMenuOnSelect={false}
          hideSelectedOptions={false}
          placeholder="Select labels to exclude..."
          theme={(theme) => ({
            ...theme,
            colors: {
              ...theme.colors,
              primary: '#8ac6bb',
              primary25: '#e6f0ee',
              primary50: '#d1e3e0',
              primary75: '#b2d8d1'
            },
          })}
        />
      </div>
    </div>
  );
};

export default LabelFilter; 