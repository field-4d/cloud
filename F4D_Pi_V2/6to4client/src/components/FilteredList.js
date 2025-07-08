import React, { useEffect, useState, useCallback } from "react";
import Select from "react-select";
import Modal from "react-modal";
import '../css/FilteredList.css';

Modal.setAppElement("#root");

const FilteredList = ({ list, setFilteredSensors }) => {
  const [filters, setFilters] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState({ key: '', value: '' });
  const [errorMessage, setErrorMessage] = useState('');

  const handleAddFilter = () => {
    if (selectedFilter.key && selectedFilter.value) {
      setFilters([...filters, selectedFilter]);
      setSelectedFilter({ key: '', value: '' });
      setErrorMessage('');
    } else {
      setErrorMessage('Both key and value must be selected.');
    }
  };

  const handleRemoveFilter = (index) => {
    const updatedFilters = [...filters];
    updatedFilters.splice(index, 1);
    setFilters(updatedFilters);
    if (updatedFilters.length === 0) {
      setFilteredSensors(list);
    }
  };

  const handleKeyChange = (selectedOption, index) => {
    const updatedFilters = [...filters];
    updatedFilters[index].key = selectedOption.value;
    updatedFilters[index].value = "";
    setFilters(updatedFilters);
  };

  const handleValueChange = (selectedOption, index) => {
    const updatedFilters = [...filters];
    updatedFilters[index].value = selectedOption.value;
    setFilters(updatedFilters);
  };

  const getOptions = (key) => {
    const options = [
      ...new Set(
        list
          .map((sensor) => deepGet(sensor, key))
          .flat()
          .filter(Boolean)
      ),
    ];

    return options.map((option) => ({ value: option, label: option }));
  };

  const deepGet = (obj, path) => {
    const keys = path.split(".");
    let result = obj;
    for (let key of keys) {
      if (Array.isArray(result[key])) {
        result = result[key].flat();
      } else {
        result = result[key];
      }
    }
    return result;
  };

  const filterItems = useCallback(() => {
    return list.filter((item) => {
      return filters.every((filter) => {
        const value = deepGet(item, filter.key);
        return Array.isArray(value)
          ? value.includes(filter.value)
          : value === filter.value;
      });
    });
  }, [list, filters]); // Memoize filterItems with useCallback and add dependencies

  const applyFilters = () => {
    setFilteredSensors(filterItems());
  };

  useEffect(() => {
    if (filters.length === 0) {
      setFilteredSensors(list);
    }
  }, [filters, setFilteredSensors, list]);

  const openModal = () => {
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setErrorMessage('');
  };

  const modalStyles = {
    overlay: {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    content: {
      width: "60%",
      maxHeight: "80vh",
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      overflowY: "auto",
    },
  };

  return (
    <div>
      <button className="filter-button" onClick={openModal}>Apply Filters</button>

      <Modal
        isOpen={showModal}
        onRequestClose={closeModal}
        contentLabel="Filters Modal"
        style={modalStyles}
      >
        <div className='add-form-filter'>
          <h2 className="filter-header">Filter Your Sensors:</h2>
          {filters.map((filter, index) => (
            <div key={index} className="filter-group">
              <Select
                options={[
                  { value: "ExperimentData.Exp_name", label: "Experiment Name" },
                  { value: "SensorData.Label", label: "Label" },
                ]}
                value={{ value: filter.key, label: filter.key }}
                onChange={(selectedOption) => handleKeyChange(selectedOption, index)}
                className="filter-select small-select" /* Added class for styling */
              />
              <Select
                options={getOptions(filter.key)}
                value={{ value: filter.value, label: filter.value }}
                onChange={(selectedOption) => handleValueChange(selectedOption, index)}
                className="filter-select small-select" /* Added class for styling */
              />
              <button type="button" onClick={() => handleRemoveFilter(index)} className="filter-remove-button">Remove Filter</button>
            </div>
          ))}
          <div className="filter-group">
            <Select
              options={[
                { value: "ExperimentData.Exp_name", label: "Experiment Name" },
                { value: "SensorData.Label", label: "Label" },
              ]}
              value={{ value: selectedFilter.key, label: selectedFilter.key }}
              onChange={(selectedOption) => setSelectedFilter({ ...selectedFilter, key: selectedOption.value })}
              className="filter-select" /* Added class for styling */
            />
            <Select
              options={getOptions(selectedFilter.key)}
              value={{ value: selectedFilter.value, label: selectedFilter.value }}
              onChange={(selectedOption) => setSelectedFilter({ ...selectedFilter, value: selectedOption.value })}
              className="filter-select" /* Added class for styling */
            />
          </div>
          {errorMessage && <p className="error-message">{errorMessage}</p>}
          <button 
            type="button" 
            className="Inside-Add-Filter" 
            onClick={handleAddFilter} 
            disabled={!selectedFilter.key || !selectedFilter.value}
          >
            Add Filter
          </button><br />
          <button 
            type="button" 
            className="Inside-Apply-Filter" 
            onClick={() => {
              if (filters.length > 0) {
                applyFilters();
                setErrorMessage('');
              } else {
                setErrorMessage('Please add at least one filter before applying.');
              }
            }}
          >
            Apply Filter
          </button><br />
          <button type="button" className="Inside-Close-Filter" onClick={closeModal}>Close</button>
        </div>
      </Modal>
    </div>
  );
};

export default FilteredList;
