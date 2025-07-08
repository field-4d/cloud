import React, { useState } from 'react';

const LightSlider = ({ maxLight, minLight, startTimeLight, endTimeLight, setMaxLight, setMinLight, setStartTimeLight, setEndTimeLight, setMessage, setMessageColor }) => {

  const [maxVal, setMaxVal] = useState(maxLight)
  const [minVal, setMinVal] = useState(minLight)
  const [startVal, setStartVal] = useState(startTimeLight)
  const [endVal, setEndVal] = useState(endTimeLight)

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
  }

  return (
    <div style={{ color: 'white' }}>
      <label>Min Light</label>
      <br/>
      <input
        type="range"
        min={0}
        max={83000}
        step={10}
        value={minVal}
        onChange={handleMinChange}
      />
      <span>{minVal} lux</span>
      <br/>
      <label>Max Light</label>
      <br/>
      <input
        type="range"
        min={0}
        max={83000}
        step={100}
        value={maxVal}
        onChange={handleMaxChange}
      />
      <span>{maxVal} lux</span>
      <br/>

      <span>Start time</span>
      <input
        type="time"
        value={startVal}
        onChange={ (e) => { setStartVal(e.target.value) } }
        required
      /> {/* we can configure min or max as we want */}
      <br/>

      <span>End time</span>
      <input
        type="time"
        value={endVal}
        onChange={(e) => { setEndVal(e.target.value) } }
        required
      /> {/* we can configure min or max as we want */}
      <br/>
      <button onClick={ () => {
        setMaxLight(maxVal)
        setMinLight(minVal)
        setStartTimeLight(startVal)
        setEndTimeLight(endVal)
        setMessage("Light was saved!")
        setMessageColor("yellowgreen")
      }}>
        Save Light
      </button>
    </div>
  );
};

export default LightSlider;
