import React, { useState, useEffect } from 'react';

import '../css/AddEmail.css'; // Import the CSS file



function AddEmail({ setEmail, list, handleEmailAlert}) {
  const [content, setContent] = useState('');
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedExperiment, setSelectedExperiment] = useState('');
  const [activeExperiments, setActiveExperiments] = useState([]);

  useEffect(() => {
    // Extracting active experiments
    const activeExps = list
      .filter(item => item.SensorData.isActive)
      .map(item => item.ExperimentData.Exp_name);

    setActiveExperiments([...new Set(activeExps)]); // Removing duplicates
  }, [list]);

  function handleChange(value) {
    setContent(value);
  }

  function handleExperimentChange(e) {
    setSelectedExperiment(e.target.value);
  }

  function handleSubmit(e) {
    e.preventDefault();
    console.log("The selected experiment names is: ", selectedExperiment)
    if (selectedExperiment) {
      // setEmail(content);
      // EmailAlert(list,selectedExperiment, content);
      handleEmailAlert(list,selectedExperiment, content);
      setShowMessage(true);
      setMessage(`Alert email for experiment '${selectedExperiment}' updated to: ${content}`);
    } else {
      setShowMessage(true);
      setMessage("No experiment selected.");
    }
    // setContent('');
  }
  return (
    <>
      <div className='add-form-mail'>
        <h3 className='title-mail'>Add Alerts' Email:</h3>
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className='add-info-mail'
          placeholder='Insert emails separated by commas'
          rows={1}
          style={{ 
            overflow: 'hidden', // Hide scrollbar
            resize: 'none', // Prevent manual resizing
            width: '100%', // Set a fixed width (adjust as needed)
          }}
          onInput={(e) => {
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
        />
        <select 
          value={selectedExperiment} 
          onChange={handleExperimentChange} 
          className='experiment-dropdown'
        >
          <option value="">Select an Experiment</option>
          {activeExperiments.map((exp, index) => (
            <option key={index} value={exp}>{exp}</option>
          ))}
        </select>
        <input
          value='Submit Mail'
          type='button'
          onClick={handleSubmit}
          className='add-experiment-mail'
        />
        {showMessage && (
          <p style={{ color: "white" }}>From now on, "{message}" will be bothered with your issues.</p>
          // add confirmation message similar to 
        )}
      </div>
    </>
  );
  
}
export default AddEmail;
