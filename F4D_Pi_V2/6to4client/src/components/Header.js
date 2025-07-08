import React, { useState, useEffect } from 'react'
import '../css/Header.css'

const Header = ({ title, list }) => {

  const [unnamedCounter, setUnnamedCounter] = useState(0);
  const newList = Object.values(list);

  useEffect(() => {
    let count = 0;
    newList.forEach((item, index) => {
      if (newList[index].SensorData.Location === "")
        count++
    });
    setUnnamedCounter(count)
  }, [list,newList]);

  return (
    <div className='header-main'>
      <h1 className='header-title'>{title}</h1>
      <p className='header-info'>Total Sensors: {newList.length} <br />Unnamed Sensors: {unnamedCounter}</p>
    </div>
  )
}

export default Header
