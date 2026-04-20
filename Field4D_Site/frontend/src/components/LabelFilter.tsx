import React from 'react';
import Select from 'react-select';
import { components, OptionProps } from 'react-select';
import {
  expandCompositesByTokenOverlap,
  parseLabelTokens,
  tokenSetsIntersect,
} from '../utils/labelTokenUtils';
import {
  atomCountsFromSensorMap,
  collectAtomicLabelsFromComposites,
} from '../utils/labelAtomOptions';

interface LabelFilterProps {
  sensorLabelOptions: string[];
  /** Per-sensor labels (experiment-summary + merged fetch data). */
  sensorLabelMap: Record<string, string[]>;
  /** Experiment sensor list (e.g. from experiment-summary); used when sensorLabelMap is not yet available. */
  allSensors: string[];
  onFilterChange: (filteredSensors: string[], includeLabels: string[], excludeLabels: string[]) => void;
}

/** Include/exclude option values are atomic tokens; counts from sensorLabelMap. */
function displayAtomForOption(atom: string, atomCounts: Record<string, number>): string {
  const n = atomCounts[atom];
  if (typeof n !== 'number' || Number.isNaN(n)) return atom;
  const unit = n === 1 ? 'sensor' : 'sensors';
  return `${atom} (${n} ${unit})`;
}

/** True if any excluded atom shares a token with any sensor composite label. */
function sensorMatchesExcludeAtoms(sensorLabels: string[], excludeAtoms: string[]): boolean {
  for (const ex of excludeAtoms) {
    const exTok = parseLabelTokens(ex);
    for (const sl of sensorLabels) {
      if (tokenSetsIntersect(parseLabelTokens(sl), exTok)) return true;
    }
  }
  return false;
}

interface LabelOption {
  value: string;
  label: string;
}

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
  allSensors = [],
  onFilterChange
}) => {
  const [selectedIncludeLabels, setSelectedIncludeLabels] = React.useState<string[]>([]);
  const [selectedExcludeLabels, setSelectedExcludeLabels] = React.useState<string[]>([]);
  const [isAndMode, setIsAndMode] = React.useState(false);

  const iconSize = "w-12 h-12";

  const atomicValues = React.useMemo(
    () => collectAtomicLabelsFromComposites(sensorLabelOptions),
    [sensorLabelOptions]
  );

  const atomCounts = React.useMemo(
    () => atomCountsFromSensorMap(sensorLabelMap, sensorLabelOptions),
    [sensorLabelMap, sensorLabelOptions]
  );

  const labelOptions: LabelOption[] = React.useMemo(() => {
    return atomicValues.map((atom) => ({
      value: atom,
      label: displayAtomForOption(atom, atomCounts),
    }));
  }, [atomicValues, atomCounts]);

  const filterSensors = React.useCallback((
    includeLabels: string[],
    excludeLabels: string[],
    andMode: boolean
  ) => {
    const hasPerSensorLabels = Object.keys(sensorLabelMap).length > 0;

    if (includeLabels.length === 0 && excludeLabels.length === 0) {
      onFilterChange([...allSensors], includeLabels, excludeLabels);
      return;
    }

    if (!hasPerSensorLabels) {
      onFilterChange([...allSensors], includeLabels, excludeLabels);
      return;
    }

    const expandedInclude = expandCompositesByTokenOverlap(
      includeLabels,
      sensorLabelOptions
    );

    const filteredSensors = Object.entries(sensorLabelMap)
      .filter(([_, sensorLabels]) => {
        if (includeLabels.length > 0) {
          const hasIncludeLabels = andMode
            ? includeLabels.every((sel) =>
                sensorLabels.some((sl) =>
                  tokenSetsIntersect(parseLabelTokens(sel), parseLabelTokens(sl))
                )
              )
            : sensorLabels.some((sl) => expandedInclude.includes(sl));
          if (!hasIncludeLabels) return false;
        }

        if (excludeLabels.length > 0) {
          if (sensorMatchesExcludeAtoms(sensorLabels, excludeLabels)) return false;
        }

        return true;
      })
      .map(([sensor]) => sensor);

    onFilterChange(filteredSensors, includeLabels, excludeLabels);
  }, [sensorLabelMap, allSensors, onFilterChange, sensorLabelOptions]);

  const handleIncludeLabelsChange = (selected: readonly LabelOption[] | null) => {
    const newIncludeLabels = (selected ?? []).map((option) => option.value);
    setSelectedIncludeLabels(newIncludeLabels);
    filterSensors(newIncludeLabels, selectedExcludeLabels, isAndMode);
  };

  const handleExcludeLabelsChange = (selected: readonly LabelOption[] | null) => {
    const newExcludeLabels = (selected ?? []).map((option) => option.value);
    setSelectedExcludeLabels(newExcludeLabels);
    filterSensors(selectedIncludeLabels, newExcludeLabels, isAndMode);
  };

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
          options={labelOptions}
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
          options={labelOptions}
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
