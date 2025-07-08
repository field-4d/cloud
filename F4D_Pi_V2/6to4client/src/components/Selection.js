import React from 'react';
import '../css/Selection.css';

function Selection({ type, lla, experimentsData, options, expName, label, handleSelect, list }) {
  return (

    <>
      {type !== 'label' && (
        <>
          <select
            value={expName === '' ? 'None' : expName}
            onChange={(e) => handleSelect(e.target.value, type)}
            className='selection'
          >
            <option key='None' value='None'>None</option>
            {options.map((label, index) => (
              <option key={`${label}-${index}`} value={label}>{label}</option>
            ))}
          </select>
        </>
      )}
    </>
  );
}

export default Selection;
