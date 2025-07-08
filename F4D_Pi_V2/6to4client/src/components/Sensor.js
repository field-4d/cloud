import React, { useEffect, useState,useCallback } from 'react';
import '../css/Sensor.css';
import EditableInput from './EditableInput.js';
import Selection from './Selection';
import TemperatureSlider from './TemperatureSlider';
import LightSlider from './LightSlider';
import Checkbox from './Checkbox.js';

const Sensor = ({ 
  location, pinged, expName, label, email, max_temp, 
  min_temp, max_light, min_light, isActive, isValid, lla, index, 
  setSensor, list, setList, labelOptions, experimentsData, 
  SwitchSensor, addCordinates, removeSensorBoot,lastSeen 
}) => {
  const initialX = list[index]?.SensorData?.coordinates?.x ?? 0;
  const initialY = list[index]?.SensorData?.coordinates?.y ?? 0;
  const initialZ = list[index]?.SensorData?.coordinates?.z ?? 0;

  const [x, setX] = useState(initialX);
  const [y, setY] = useState(initialY);
  const [z, setZ] = useState(initialZ);



  const initialSelectedLabel = list[index]?.SensorData?.Label ?? [];
  const [selectedLabel, setSelectedLabel] = useState(initialSelectedLabel);
  // console.log('Initial selected labels:', selectedLabel); // Debugging log
  // set initial LabelOptions
  // const initialLabelOptions = list[index]?.SensorData?.LabelOptions ?? [];
  // const initialLabelOptions = list[index]?.SensorData?.Label ?? [];


  const [selectedExperimentName, setSelectedExperimentName] = useState();
  const [selectedExperimentLocation, setSelectedExperimentLocation] = useState();
  const [selectedSwitch, setSelectedSwitch] = useState();
  const [showAlerts, setShowAlerts] = useState(false);

  const [maxTemp, setMaxTemp] = useState(max_temp);
  const [minTemp, setMinTemp] = useState(min_temp);
  const [startTimeTemp, setStartTimeTemp] = useState(list[index]?.Alerts?.Temperature?.Start_Time || '08:00');  // Default value if undefined
  const [endTimeTemp, setEndTimeTemp] = useState(list[index]?.Alerts?.Temperature?.End_Time || '17:00');        // Default value if undefined

  const [maxLight, setMaxLight] = useState(max_light);
  const [minLight, setMinLight] = useState(min_light);
  const [startTimeLight, setStartTimeLight] = useState(list[index]?.Alerts?.Light?.Start_Time || '08:00');  // Default value if undefined
  const [endTimeLight, setEndTimeLight] = useState(list[index]?.Alerts?.Light?.End_Time || '17:00');        // Default value if undefined

  const [messageColor, setMessageColor] = useState("yellowgreen");
  const [message, setMessage] = useState();

  function handleCheckbox(value, isChecked, type) {
    if (type === "label") {
      const newSelectedLabels = isChecked
        ? [...selectedLabel, value]
        : selectedLabel.filter((label) => label !== value);
      console.log('Updating selected labels:', newSelectedLabels); // Debugging log
      setSelectedLabel(newSelectedLabels);
    }
  }

  const [isFirst, setIsFirst] = useState(true);
  let nameOptions = experimentsData.length !== 0 ? experimentsData.map((obj) => obj.Exp_name) : ['None'];
  let llaOptions = list.filter(obj => !obj.SensorData.isActive).map(obj => obj.SensorData.LLA);

  const toggleAlerts = () => {
    setShowAlerts(!showAlerts);
  }

  const deleteAlerts = () => {
    const newList = [...list];

    newList[index].Alerts.Alerted = false;
    newList[index].Alerts.Temperature.Max_Temp = '';
    setMaxTemp('');
    newList[index].Alerts.Temperature.Min_Temp = '';
    setMinTemp('');
    newList[index].Alerts.Temperature.Start_Time = "00:00:00";
    setStartTimeTemp("00:00:00");
    newList[index].Alerts.Temperature.End_Time = "00:00:00";
    setEndTimeTemp("00:00:00");

    newList[index].Alerts.Light.Max_Light = '';
    setMaxLight('');
    newList[index].Alerts.Light.Min_Light = '';
    setMinLight('');
    newList[index].Alerts.Light.Start_Time = "00:00:00";
    setStartTimeLight("00:00:00");
    newList[index].Alerts.Light.End_Time = "00:00:00";
    setEndTimeLight("00:00:00");

    setMessageColor("red");
    setMessage("Alerts removed from sensor!");
    setList(newList);
    setSensor(newList[index]);
  }

  function findExpLocation(name) {
    let location;
    experimentsData.forEach((obj) => {
      if (obj.Exp_name === name) {
        location = obj.Exp_location;
      }
    });
    return location;
  }

  function handleSelect(value, type) {
    if (type === "experiment name"){
      setSelectedExperimentName(value);
      setSelectedExperimentLocation(findExpLocation(value));
    }
    if (type === "switch"){
      setSelectedSwitch(value);
    }
  } 

  const applyToAll = (type) => {
    const newList = [...list];
    setMessageColor("red");
    newList.forEach((sensor) => {
      if(type === "temp"){
        sensor.Alerts.Temperature.Min_Temp = minTemp;
        sensor.Alerts.Temperature.Max_Temp = maxTemp;
        sensor.Alerts.Temperature.Start_Time = startTimeTemp;
        sensor.Alerts.Temperature.End_Time = endTimeTemp;
        setMessageColor("yellowgreen");
        setMessage("Temp. alert was applied to all!");
      } else if (type === "light"){
        sensor.Alerts.Light.Min_Light = minLight;
        sensor.Alerts.Light.Max_Light = maxLight;
        sensor.Alerts.Light.Start_Time = startTimeLight;
        sensor.Alerts.Light.End_Time = endTimeLight;
        setMessageColor("yellowgreen");
        setMessage("Light alert was applied to all!");
      }
      setSensor(sensor);
    });
    setList(newList);
  };

  const deleteAlert = (type) => {
    const newList = [...list];
    setMessageColor("red");
    if (type === "temp") {
      newList[index].Alerts.Temperature.Max_Temp = '';
      setMaxTemp('');
      newList[index].Alerts.Temperature.Min_Temp = '';
      setMinTemp('');
      newList[index].Alerts.Temperature.Start_Time = "00:00:00";
      setStartTimeTemp("00:00:00");
      newList[index].Alerts.Temperature.End_Time = "00:00:00";
      setEndTimeTemp("00:00:00");
      setMessage("Temp. alert was removed from sensor!");
    }
    else if (type === "light") {
      newList[index].Alerts.Light.Max_Light = '';
      setMaxLight('');
      newList[index].Alerts.Light.Min_Light = '';
      setMinLight('');
      newList[index].Alerts.Light.Start_Time = "00:00:00";
      setStartTimeLight("00:00:00");
      newList[index].Alerts.Light.End_Time = "00:00:00";
      setEndTimeLight("00:00:00");
      setMessage("Light alert was removed from sensor!");
    }

    if(
      newList[index].Alerts.Temperature.Max_Temp === '' &&
      newList[index].Alerts.Temperature.Min_Temp === '' &&
      newList[index].Alerts.Temperature.Start_Time === "00:00:00" &&
      newList[index].Alerts.Temperature.End_Time === "00:00:00" &&
      newList[index].Alerts.Light.Max_Light === '' &&
      newList[index].Alerts.Light.Min_Light === '' &&
      newList[index].Alerts.Light.Start_Time === "00:00:00" &&
      newList[index].Alerts.Light.End_Time === "00:00:00" 
    ) {
      newList[index].Alerts.Alerted = false;
    }

    setSensor(newList[index]);
    setList(newList);
  }

  useEffect(() => {
    if (!isFirst) {
      const newList = [...list];
      newList[index].Alerts.Alerted = true;
      newList[index].Alerts.Temperature.Max_Temp = maxTemp;
      newList[index].Alerts.Temperature.Min_Temp = minTemp;
      newList[index].Alerts.Temperature.Start_Time = startTimeTemp;
      newList[index].Alerts.Temperature.End_Time = endTimeTemp;
      newList[index].Alerts.Light.Max_Light = maxLight;
      newList[index].Alerts.Light.Min_Light = minLight;
      newList[index].Alerts.Light.Start_Time = startTimeLight;
      newList[index].Alerts.Light.End_Time = endTimeLight;
      setList(newList);
      setSensor(newList[index]);
    } else {
      setIsFirst(false);
    }
  }, [maxTemp, minTemp, maxLight, minLight, startTimeTemp, endTimeTemp, startTimeLight, endTimeLight]);

  // useEffect(() => {
  //   if(selectedLabel){
  //     console.log('Updating list with selected labels:', selectedLabel); // Debugging log
  //     const newList = [...list];
  //     var labelString = '';
  //     if(selectedLabel[0] === ['None'])
  //       newList[index].SensorData.Label = [];
  //     else
  //       labelString = selectedLabel.toString();
  //       newList[index].SensorData.Label = labelString.split(",");
  //     setList(newList);
  //     setSensor(newList[index]);
  //   }
  // },[selectedLabel])
  useEffect(() => {
    if (selectedLabel) {
      const newList = [...list];
      let labelArray = [];
  
      if (typeof selectedLabel === 'string') {
        labelArray = [selectedLabel];
      } else if (Array.isArray(selectedLabel)) {
        labelArray = selectedLabel;
      }
  
      newList[index].SensorData.Label = labelArray;
      setList(newList);
      setSensor(newList[index]);
    }
  }, [selectedLabel]);
  

  useEffect(() => {
    if (selectedExperimentName !== undefined) {
      setList((prevList) => {
        const newList = [...prevList];
        newList[index].ExperimentData.Exp_name = selectedExperimentName;
        newList[index].ExperimentData.Exp_location = selectedExperimentLocation;
        setSensor(newList[index])
        return newList;
      });
    }
  }, [selectedExperimentName, selectedExperimentLocation]);
  
  useEffect(() => {
    if(email !== undefined){
      const newList = [...list];
      newList[index].Alerts.Email = email;
      setList(newList);
      setSensor(newList[index]);
    }
  }, [email])


  return (
    <>
      <div
        className={isActive ? (
          isValid ? ( 
            pinged === lla ? "sensor-element valid animate" : "sensor-element valid" // If the sensor is active and valid
          ) : (
            pinged === lla ? "sensor-element invalid animate" : "sensor-element invalid" // If the sensor is active but invalid
          )
        ) : (
          pinged === lla ? "sensor-element inactive animate" : "sensor-element inactive" // If the sensor is inactive
        )}
      >
       <div
          className="indicator-light"
          style={{ backgroundColor: isActive ? (isValid ? "green" : "orange") : "red" }}
          >
          <div className="indicator-text">
           {isActive ? (isValid ? "Active" : "Invalid") : "Inactive"}
            </div> 
      </div> 

        <div className='sensor-element-content'>
        <h3>Sensor</h3>
        
        <p className="last-seen">
          <strong>Last Seen:</strong>  {lastSeen ? new Date(lastSeen).toLocaleString().replace('T', ' ').split('.')[0] : "No data yet"}
        </p>

        {isActive ? (<></>) : (
          <button className='delete-button' onClick={() => {removeSensorBoot(lla)}}>
            Remove Sensor
          </button>
        )}
          <hr/>
          <button className='alerts-button' onClick={ toggleAlerts }>{ showAlerts? 'Show Data' : 'Show Alerts'}</button>
          <br/><br/>
          
          { showAlerts ? (
            <>
            <div style={{ color: messageColor }} >{message}</div>
              <TemperatureSlider
                maxTemperature={maxTemp}
                minTemperature={minTemp}
                startTimeTemp={startTimeTemp}
                endTimeTemp={endTimeTemp}
                setMaxTemperature={setMaxTemp}
                setMinTemperature={setMinTemp}
                setStartTimeTemp={setStartTimeTemp}
                setEndTimeTemp={setEndTimeTemp}
                setMessage={setMessage}
                setMessageColor={setMessageColor}
              />
              <button onClick={() => applyToAll("temp")}>Apply Temp To All</button><br/>
              <button onClick={() => deleteAlert("temp")}>Delete Temp Alert</button>
              <div className='temperature-display'>
                {maxTemp === '' && minTemp === ''? (<></>) : (<span>{minTemp}°C - {maxTemp}°C</span>)}
              </div>
              <br/><br/>

              <LightSlider
                maxLight={maxLight}
                minLight={minLight}
                startTimeLight={startTimeLight}
                endTimeLight={endTimeLight}
                setMaxLight={setMaxLight}
                setMinLight={setMinLight}
                setStartTimeLight={setStartTimeLight}
                setEndTimeLight={setEndTimeLight}
                setMessage={setMessage}
                setMessageColor={setMessageColor}
              />
              <button onClick={() => applyToAll("light")}>Apply Light To All</button><br/>
              <button onClick={() => deleteAlert("light")}>Delete Light Alert</button>
              <div className='temperature-display'>
                {maxLight === '' && minLight === ''? (<></>) : (<span>{minLight}lux - {maxLight}lux</span>)}
              </div>

              <br/><br/>
              <button onClick= { deleteAlerts }>Delete Alerts</button>
            </>
          ) : (
            <>
              <h4>Sensor Location:</h4>
              { isActive? ( location ) : ( 
                <EditableInput
                  className= "item"
                  lla = {lla}
                  defaultValue = { location? (location) : ("Double click to add/edit location")}
                  type = "location"
                  list = { list }
                  setList = { setList }
                  index = { index }
                  setSensor = { setSensor }
                /> 
              )}

              <h4>Experiment:</h4>
              {  isActive? ( expName ) : ( 
                <Selection
                  type = "experiment name"
                  experimentsData = { experimentsData }
                  options= { nameOptions }
                  expName = { expName }
                  handleSelect = {handleSelect}
                  selectedExperimentName= {selectedExperimentName}
                  setSelectedExperimentName= {setSelectedExperimentName}
                  selectedExperimentLocation= {selectedExperimentLocation}
                  setSelectedExperimentLocation= {setSelectedExperimentLocation}
                  list = {list}
                />
              )}
              <h4>Label:</h4>
              <Checkbox
              type="label"
              lla={lla}
              options={labelOptions} // labelOptions - initialLabelOptions
              label={selectedLabel} // selectedLabel - initialSelectedLabel
              handleCheckbox={handleCheckbox}
              list = {list}

            />

            <h4>X Coordinate: </h4>
            <input type="text" value={x} onChange={(e) => { setX(e.target.value); }} />
            <h4>Y Coordinate:</h4>
            <input type="text" value={y} onChange={(e) => { setY(e.target.value); }} />
            <h4>Z Coordinate:</h4>
            <input type="text" value={z} onChange={(e) => { setZ(e.target.value);}} />
            
            <button onClick={() => addCordinates(lla, x, y, z)}>Apply</button>

              <h4> LLA: </h4> <span className='small-text'>{ lla }</span>
              {!isActive || !isValid ? (<></>) : (
                <>
                  <h4> Switch with:</h4>
                  <Selection
                    type = "switch"
                    options= {llaOptions}
                    handleSelect = {handleSelect}
                    selectedSwitch= {selectedSwitch}
                    setSelectedSwitch= {setSelectedSwitch}
                  />                
                <button onClick={() => {
                if (window.confirm(`Are you sure you want to swap the values of Box 
                  ${lla} and Box ${selectedSwitch}?\nThe change in ireversable!
                      DON'T FORGET TO TAKE THE BATTERY OUT ${lla} OF THE SENSOR BEFORE SWAPPING!`)) {
                    SwitchSensor(lla, selectedSwitch, list);}}}>Apply</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

export default Sensor;
