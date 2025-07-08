import React, { useState } from 'react';
import '../css/AddExperiment.css';

function AddExperiment({ exp_locations, options, onSubmit, experimentsData, handleRemoveExpName }) {
  // useState vars
  const [nameInputValue, setNameInputValue] = useState('');
  const [locationInputValue, setLocationInputValue] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedExperimentToRemove, setSelectedExperimentToRemove] = useState('');

  // Handles the submit
  function handleSubmit(event) {
    event.preventDefault(); // --> This line of code prevents refreshing the page

    // Validations
    if (nameInputValue.trim() === '' || locationInputValue.trim() === '') {
      setErrorMessage('You must add a value');
      setNameInputValue('');
      setLocationInputValue('');
      return;
    }
    if (options.includes(nameInputValue)) {
      setErrorMessage('Value already exists');
      setNameInputValue('');
      setLocationInputValue('');
      return;
    }

    // The next two lines are firing the handleSubmitOption function in App.js
    onSubmit('experimentName', nameInputValue);
    onSubmit('experimentData', { Exp_name: nameInputValue, Exp_location: locationInputValue });
    setErrorMessage('');
    setNameInputValue('');
    setLocationInputValue('');
  }

  // Handles changes in the input elements
  function handleChange(event) {
    const id = event.target.id;
    const val = event.target.value;
    if (id === 'name') {
      setNameInputValue(val);
    } else if (id === 'location') {
      setLocationInputValue(val);
    }
  }

  return (
    <form className='add-form-experiment' onSubmit={handleSubmit}>
      <h3 className='title-experiment'>Experiment Info:</h3>
      <div className="form-group">
        <label className="experiment-name">Name:</label>
        <input className="add-info-experiment-name"
          id="name"
          type="text"
          value={nameInputValue}
          autoComplete='off'
          placeholder='Experiment Name'
          onChange={handleChange} />
      </div>
      <div className="form-group">
        <label className="experiment-location">Location:</label>
        <input className="add-info-experiment-location"
          id="location"
          type="text"
          value={locationInputValue}
          autoComplete='off'
          placeholder='Experiment Location'
          onChange={handleChange} />
      </div>
      <button className="add-button-experiment" type="submit">Submit</button>
      <p className="error-message" style={{ color: 'red' }}>{errorMessage}</p>

      <h4 className="remove-experiment-title">Remove Experiment:</h4>
      <select className="remove-experiment-select" value={selectedExperimentToRemove} onChange={(e) => setSelectedExperimentToRemove(e.target.value)}>
        <option value=""className='remove-button-ex' disabled>Select Experiment to Remove</option>
        {options.map((experimentName, index) => (
          <option key={`${experimentName}-${index}`} value={experimentName}>{experimentName}</option>
        ))}
      </select>
      <button className="remove-experiment-button" type="button" onClick={() => handleRemoveExpName(selectedExperimentToRemove)} disabled={!selectedExperimentToRemove}>Remove</button>
    </form>
  );
}

export default AddExperiment;
