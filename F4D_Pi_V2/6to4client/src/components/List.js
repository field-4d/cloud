// Imports
import {React} from 'react';
import Sensor from './Sensor'
import '../css/List.css'


// funtion that remove duplicates for list based on LLA



// Parameters for the List component - Case sensetive you dislactic fuck
const List = ( { list, pinged, setSensor, setList, 
  SwitchSensor,labelOptions,addCordinates ,removeSensorBoot,experimentsData, setExperimentsData, email } ) => {
  // get the unique list

  // const removeDuplicates = (sensors) => {
  //   const unique = [];
  //   const map = new Map();

  //   for (const sensor of sensors) {
  //     if (!map.has(sensor.SensorData.LLA)) {
  //       map.set(sensor.SensorData.LLA, true); // set any value to Map
  //       unique.push(sensor);
  //     }
  //   }
  //   return unique;
  // };

  // // Effect for updating the list to have unique LLA values
  // useEffect(() => {
  //   const uniqueList = removeDuplicates(list);
  //   if (uniqueList.length !== list.length) {
  //     setList(uniqueList);
  //   }
  // }, [list, setList]);

  // Contents of the List component
  // console.log("from List.js the labelOptions are:",labelOptions)

  return (
    <>\
      { Object.keys(list).length !== 0? 
        (
          <>
            <div className='sensors-grid'>
              {list.map((sensor,index) => (  // unsed to be list.map
                <Sensor
                  key = { sensor.SensorData.LLA }
                  location = { sensor.SensorData.Location }
                  pinged = { pinged }
                  expName = {sensor.ExperimentData.Exp_name}
                  label = { sensor.SensorData.Label }
                  email = {email}
                  max_temp = {sensor.Alerts.Temperature.Max_Temp}
                  min_temp = {sensor.Alerts.Temperature.Min_Temp}
                  max_light = {sensor.Alerts.Light.Max_Light}
                  min_light = {sensor.Alerts.Light.Min_Light}
                  isActive = { sensor.SensorData.isActive }
                  //
                  isValid = {sensor.SensorData.isValid}
                  //
                  lla  = { sensor.SensorData.LLA }
                  setSensor = { setSensor }
                  index= { index }
                  list ={ list }
                  setList  = { setList }
                  labelOptions = { labelOptions }
                  experimentsData = { experimentsData }
                  SwitchSensor = {SwitchSensor}
                  addCordinates = {addCordinates}
                  removeSensorBoot = {removeSensorBoot}
                  lastSeen={new Date(sensor.SensorData.LastSeen).toLocaleString()}  // Display timestamp

                />
              ))}
            </div>
          </>
          
        ) : (
          <div className='sensors-grid loading'>
            <h3>Did You know?</h3>
            <p>Climbing mount Everest takes approximately <strong>3 months</strong> overall.</p>
            <p>Leonardo DiCaprio waited <strong>19 years</strong> for his Oscar after his performance in the Titanic movie.</p>
            <p>Nelson Mandela spent <strong>27 years</strong> in jail, before he released South Africa from its apartheid regime.</p>
            <br/>
            <h2>The perfect experiment isn't executed on one day,<br/>
                please stay patient while we load your sensors :)</h2>
            <div className="loader"></div>
          </div>
        ) }

    </>
  )
}

export default List