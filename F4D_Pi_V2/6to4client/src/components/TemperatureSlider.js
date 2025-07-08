import React, { useState } from 'react';

const TemperatureSlider = ({ 
  maxTemperature, 
  minTemperature, 
  startTimeTemp,  
  endTimeTemp,   
  setMaxTemperature, 
  setMinTemperature, 
  setStartTimeTemp, 
  setEndTimeTemp, 
  setMessage, 
  setMessageColor 
}) => {

  const [maxVal, setMaxVal] = useState(maxTemperature);
  const [minVal, setMinVal] = useState(minTemperature);
  const [startVal, setStartVal] = useState(startTimeTemp || '08:00');  // Fallback to '08:00' if undefined
  const [endVal, setEndVal] = useState(endTimeTemp || '17:00');        // Fallback to '17:00' if undefined

  const handleMinChange = (event) => {
    const value = parseInt(event.target.value);
    setMinVal(value);
    if (value > maxVal) {
      setMaxVal(value);
    }
  };

  const handleMaxChange = (event) => {
    const value = parseInt(event.target.value);
    setMaxVal(value);
    if (value < minVal) {
      setMinVal(value);
    }
  };

  return (
    <div style={{ color: 'white' }}>
      <label>Min Temp</label>
      <br/>
      <input
        type="range"
        min={-100}
        max={100}
        value={minVal}
        onChange={handleMinChange}
      />
      <span>{minVal}°C</span>
      <br/>
      <label>Max Temp</label>
      <br/>
      <input
        type="range"
        min={-100}
        max={100}
        value={maxVal}
        onChange={handleMaxChange}
      />
      <span>{maxVal}°C</span>
      <br/>

      <span>Start time</span>
      <input
        type="time"
        value={startVal}
        onChange={(e) => { setStartVal(e.target.value) }}
        required
      />
      <br/>

      <span>End time</span>
      <input
        type="time"
        value={endVal}
        onChange={(e) => { setEndVal(e.target.value)}}
        required
      />
      <br/>
      <button onClick={ () => {
        setMaxTemperature(maxVal);
        setMinTemperature(minVal);
        setStartTimeTemp(startVal);
        setEndTimeTemp(endVal);
        setMessage("Temp. was saved!");
        setMessageColor("yellowgreen");
      }}>
        Save Temp
      </button>
    </div>
  );
};

export default TemperatureSlider;
