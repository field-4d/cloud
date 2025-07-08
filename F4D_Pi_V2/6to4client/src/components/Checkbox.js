import React from 'react';
import '../css/Checkbox.css';



// function Checkbox({ type, lla, options, label = [], handleCheckbox ,list}) {
function Checkbox({ type, lla,list,handleCheckbox}) {

  const sensor = list.find(item => item.SensorData.LLA === lla);
  const expName = sensor?.ExperimentData?.Exp_name;
  const options = expName
    ? Array.from(new Set(list
        .filter(item => item.ExperimentData.Exp_name === expName)
        .flatMap(item => item.SensorData.LabelOptions)))
    : sensor?.SensorData?.LabelOptions ?? [];

  const label = sensor?.SensorData?.Label ?? [];

  return (
    <>    
      {type === 'label' && (
           <>
          {Array.isArray(options) && options.map((opt) => (
            <div key={opt} className='checkbox-wrapper'>
              <input
                type='checkbox'
                id={`${lla}-${opt}`}  // Use a unique ID for each checkbox
                value={opt}
                checked={label.includes(opt)}
                onChange={(e) => handleCheckbox(opt, e.target.checked, type)}
                className='checkbox'
              />
              <label htmlFor={`${lla}-${opt}`}>{opt}</label>
            </div>
          ))}
        </>
      )}
    </>
  );
}

export default Checkbox;
