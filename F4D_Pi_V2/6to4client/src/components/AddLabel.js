import React, { useState, useEffect } from 'react';
import '../css/AddLabel.css';

/**
 * AddLabel component to handle adding and removing labels for sensors
 * based on the selected experiment.
 * 
 * @param {Array} options - Array of available labels.
 * @param {Function} updateLabel - Callback to update the list state.
 * @param {Array} list - Array of sensor data.
 */
function AddLabel({ options, list, updateLabel }) {
  const [inputValue, setInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // const [selectedLabel, setSelectedLabel] = useState('');
  const [selectedExperiment, setSelectedExperiment] = useState('');
  const [activeExperiments, setActiveExperiments] = useState([]);
  const [experimentLabels, setExperimentLabels] = useState([]);

  useEffect(() => {
    // Extracting active experiments
    const activeExps = list.map(item => item.ExperimentData.Exp_name);
    setActiveExperiments([...new Set(activeExps)]); // Removing duplicates
  }, [list]);

  useEffect(() => {
    // Update labels based on selected experiment
    if (selectedExperiment) {
      const labels = list
        .filter(item => item.ExperimentData.Exp_name === selectedExperiment)
        .flatMap(item => item.SensorData.LabelOptions);
      setExperimentLabels([...new Set(labels)]); // Removing duplicates
    } else {
      setExperimentLabels([]);
    }
  }, [selectedExperiment, list]);

  /**
   * Handles the submission of a new label.
   * @param {Event} event - The form submit event.
   */
  function handleSubmit(event) {
    event.preventDefault();

    if (inputValue.trim() === '') {
      setErrorMessage('You must add a value');
      setInputValue('');
      return;
    }

    const updatedList = list.map(item => {
      if (item.ExperimentData.Exp_name === selectedExperiment) {
        if (!item.SensorData.LabelOptions.includes(inputValue)) {
          item.SensorData.LabelOptions.push(inputValue);
        }
      }
      return item;
    });

    updateLabel(updatedList);
    setErrorMessage('');
    setInputValue('');
  }

  /**
   * Handles the input change event.
   * @param {Event} event - The input change event.
   */
  function handleChange(event) {
    setInputValue(event.target.value);
  }

  /**
   * Handles the removal of a label.
   * @param {string} label - The label to be removed.
   */
  function handleRemove(label) {
    if (!selectedExperiment) {
      setErrorMessage('Please select an experiment first');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to remove the label "${label}" from the experiment "${selectedExperiment}"?`);
    if (isConfirmed) {
      const updatedList = list.map(item => {
        if (item.ExperimentData.Exp_name === selectedExperiment) {
          console.log(`Before removal: ${JSON.stringify(item.SensorData)}`);
          item.SensorData.Label = item.SensorData.Label.filter(l => l !== label); // Remove label from sensor
          item.SensorData.LabelOptions = item.SensorData.LabelOptions.filter(l => l !== label); // Remove label from options
          console.log(`After removal: ${JSON.stringify(item.SensorData)}`);
        }
        return item;
      });

      updateLabel(updatedList);
    }
  }

  /**
   * Handles the removal of all labels from inactive sensors.
   */
  function handleRemoveAllLabel() {
    if (!selectedExperiment) {
      setErrorMessage('Please select an experiment first');
      return;
    }

    const isConfirmed = window.confirm(`Are you sure you want to remove all labels from the experiment "${selectedExperiment}"?`);
    if (isConfirmed) {
      const updatedList = list.map(item => {
        if (item.ExperimentData.Exp_name === selectedExperiment) {
          item.SensorData.Label = [];
          item.SensorData.LabelOptions = [];
        }
        return item;
      });

      updateLabel(updatedList);
    }
  }

  /**
   * Handles the selection change for the experiment dropdown.
   * @param {Event} e - The selection change event.
   */
  function handleExperimentChange(e) {
    setSelectedExperiment(e.target.value);
  }

  return (
    <>
      <form className="add-form-label" onSubmit={handleSubmit}>
        <h3 className="title-label">Label options:</h3>
        <select 
          value={selectedExperiment} 
          onChange={handleExperimentChange} 
          className='experiment-dropdown'
        >
          <option value="">Select an Experiment</option>
          {activeExperiments.map((exp, index) => (
            <option key={`${exp}-${index}`} value={exp}>{exp}</option>
          ))}
        </select>

        {selectedExperiment && (
          <>
            <div className="form-group">
              <input 
                className="add-info-label" 
                type="text" 
                value={inputValue}
                onChange={handleChange} 
                placeholder='Insert Label Name'
              />
              <button className="add-button-label" type="submit">Submit</button>
            </div>
            <p style={{ color: 'red' }}>{errorMessage}</p>
            <h4 className="remove-label-title">Remove Labels:</h4>
            <select className="remove-label-select" defaultValue="" onChange={(e) => handleRemove(e.target.value)}>
              <option value="" disabled>Select Label to Remove</option>
              {experimentLabels.map((label, index) => (
                <option key={`${label}-${index}`} value={label}>{label}</option>
              ))}
            </select>
            <button className="remove-all-label-button" type="button" onClick={handleRemoveAllLabel}>Remove All Labels</button>
          </>
        )}
      </form>
    </>
  );
}

export default AddLabel;
