//copy paste

//  imports
import { useEffect, useState,useCallback  } from "react";
import './css/App.css'
import Header from "./components/Header";
import StartExpButton from "./components/StartExpButton"
import EndExpButton from "./components/EndExpButton"
import List from './components/List';
import AddLabel from './components/AddLabel'
import AddExperiment from './components/AddExperiment'
import AddEmail from './components/AddEmail'
import FilteredList from './components/FilteredList'
// import Data from './components/Data';

import DownloadCSVButton from './components/DownloadCSVButton'
import UploadCSVButton from './components/UploadCSVButton'

// import { Route, Routes, Link, useNavigate } from 'react-router-dom';


//  Creating the WebSocket connection wit 'ws' library
// const webSocket = new WebSocket(`ws://${window.location.hostname}:8080`);
// let isConnected = false;

const protocolPrefix = window.location.protocol === 'https:' ? 'wss' : 'ws';
const webSocket = new WebSocket(`${protocolPrefix}://${window.location.hostname}:8080`);
let isConnected = false;



//  Checking (In the client console) that the connection was created properly
webSocket.onopen = () => {
  isConnected = true;
  console.log('WebSocket is ready for action!')
};

//  App (main) component
function App() {

  // event holds the type of action we want to send to the server, currently as a JSON 
  const [event,setEvent] = useState(); // i'll get worning on event, but it is OK

  // a list holds the sensors
  const [list, setList] = useState([]);

  const [pinged, setPinged] = useState('')

  var lastEvent = null;

  // const navigate = useNavigate();

  // Fetching data from mongoDB on page load
  useEffect(() => {
    fetch(`/getAll`)
    .then(response => response.json())
    .then(data => {setList(data)})
    .catch(err => console.error(err));
  }, []);

  //  Listening on packets and pings from the server
  useEffect(() => {

    //  A function that loads a new SP and updates it in the list
    const handleNewSP = (LLA, timestamp) => {
      setList(prevList => {
        const LLA_list = prevList.map(sp => sp.SensorData.LLA);
    
        if (!LLA_list.includes(LLA)) {
          const sensor = {
            UserData: {
              Holder: 'Admin',
              Email: '',
              Location: ''
            },
            ExperimentData: {
              Start_time: '',
              End_time: '',
              Exp_id: '',
              Exp_location: '',
              Bucket: '',
              Exp_name: ''
            },
            SensorData: {
              LLA: LLA,
              RFID: '',
              Location: '',
              Label: [],
              LabelOptions: [],
              isActive: false,
              isValid: true,
              Frequency: '',
              Coordinates: '',
              LastSeen: timestamp || "no data"  // Store timestamp
            },
            Alerts: {
              Email: '',
              Alerted: false,
              Temperature: {
                Max_Temp: '',
                Min_Temp: '',
                Start_Time: "00:00:00",
                End_Time: "00:00:00"
              },
              Light: {
                Max_Light: '',
                Min_Light: '',
                Start_Time: "00:00:00",
                End_Time: "00:00:00"
              },
              Battery_Percentage: 2750
            }
          };
    
          return [...prevList, sensor];  // ✅ Use prevList to add a new sensor
        } else {
          return prevList.map(sp =>
            sp.SensorData.LLA === LLA
              ? { 
                  ...sp,
                  SensorData: { 
                    ...sp.SensorData,
                    LastSeen: timestamp || new Date().toISOString()
                  }
                }
              : sp
          );
        }
      });
    };
    
    
    
    webSocket.onmessage = (message) => {
      const incoming = JSON.parse(message.data)

      if(incoming.type === "sp_ipv6" || incoming.type === "sp_ping") {
        // log the ipv6 and timestamp in one line
        // console.log("for the ipv6: ", incoming.data.ipv6, " the timestamp is: ", incoming.data.timestamp);
        // log the updated list
        handleNewSP(incoming.data.ipv6, incoming.data.timestamp);
        
        // console.log("the updated list is: ", list);
      }

      if(incoming.type === "sp_ping") {
        setPinged(incoming.data.ipv6)
      }

      if(incoming.type === "force_refresh") {
        window.location.reload(false);
        alert("Experiment has been ended by user.")
      }
      // if incoming type is replace force refresh
      if(incoming.type === "sensor_repalced") {
        window.location.reload(); // the fals is to not reload from the server
      } 
      // handle alerted mail update
      if (incoming.type === "alerted_mail_updated") {
        window.location.reload(false);
      }

      if (incoming.type === "Csv_Updated") {
        window.location.reload(false); // the fals is to not reload from the server 
      }
      if (incoming.type === "label_updated") {
        // window.location.reload(false); // the fals is to not reload from the
        }
      //

      if(incoming.type === "sensors_list_update") {
        const updatedList = list.map((item) => {
          const matchingItem = incoming.data.find((newItem) => newItem.SensorData.LLA === item.SensorData.LLA);
          if (matchingItem) {
            return matchingItem;
          }
          return item;
        });
        setList(updatedList);
      } 
      if (incoming.type === "cordinates_added"){
        console.log("Reload")
        // window.location.reload();
      }
      if (incoming.type === "sensor_removed_from_boot") {
        console.log("sensor_removed")
        window.location.reload();
      }
      if (incoming.type === "force_refresh") {
        window.location.reload();
      }
      if (incoming.type === "force_refresh") { // if the incoming type is force refresh
        window.location.reload(); // the fals is to not reload from the server
      }


    };
  }, [list]);

  
  // force refresh using  webSocket.onmessage
  const forceRefresh = () => {
    window.location.reload(false);
  }

  useEffect(() => {
    if (pinged !== '') {
      setTimeout(() => {
        setPinged('');
      }, 750);
    }
  }, [pinged]);

  //A function that sets the event variable to send a setSensor event
  const setSensor = (sensor) => {
    if (sensor){
      // setEvent({
      //   type : "setSensor",
      //   data: sensor
      // })
      sendEvent({
        type : "setSensor",
        data: sensor
      })
    }
  }

  function sendEvent(e) {
    if (isConnected && e !== lastEvent) {
      webSocket.send(JSON.stringify(e));
      lastEvent = e;
    }
  }

  const startNewExperiment = (sensorsList) => {
    const updatedList = sensorsList.map((sensor) => {
      return { ...sensor,
                ExperimentData:
                {...sensor.ExperimentData},
                SensorData: 
                {...sensor.SensorData}
              };
    });

    if(list[0]){
      setEvent({
        type: "startNewExperiment",
        data: updatedList
      })
      sendEvent({
        type: "startNewExperiment",
        data: updatedList
      })
    }
  }

  

  const endExperiment = (sensorsList) => {
    const updatedList = sensorsList.map((sensor) => {
      return { ...sensor,
                ExperimentData:
                {...sensor.ExperimentData},
                SensorData: 
                {...sensor.SensorData}
              };
    });

    console.log("the updated list is after endExperiment: ", updatedList);
    if(list[0]){
      setList({
        type: "endExperiment",
        data: updatedList
      })
      sendEvent({
        type: "endExperiment",
        data: updatedList
      })
    }
    // get the experiment name and remove it using handleRemoveExpName
    
  }

  const SwitchSensor = (prevLLA, nextLLA,sensorsList) => {
    console.log("prevLLA: ", prevLLA);
    console.log("nextLLA: ", nextLLA);
    console.log("sensors: ", sensorsList);

    if(list[0]){
      setEvent({
        type: "SwitchSensor",
        data: [prevLLA, nextLLA, sensorsList]
      })
      sendEvent({
        type: "SwitchSensor",
        data: [prevLLA, nextLLA,sensorsList]
      })
    }
  }

  // get LLA and remove it from boot
  const removeSensorBoot = (LLA) => {
    console.log("The LLA to remove is: ", LLA);
    // get only the sensor that equale to the LLA
    const sensor_cor = list.filter((sensor) => sensor.SensorData.LLA === LLA);
    console.log("the current  sensors is: ", sensor_cor);
    console.log("the current  sensors is: ", LLA!=='');
    if (window.confirm(`Are you sure you want to delete sensor ${LLA}?`)) {
      if(LLA!==''){
      setEvent({
        type: "removeSensorBoot",
        data: sensor_cor
      })
      sendEvent({
        type: "removeSensorBoot",
        data: sensor_cor
      })
    }
  }
  }

  // add x,yz cordinates which are the location of the sensor 20240123
const addCordinates = (LLA, x, y, z) => {
      // Try to parse x, y, z to float
      x = parseFloat(x);
      y = parseFloat(y);
      z = parseFloat(z);
      // Check if the parsed values are valid numbers, if not alert the user
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        // alert for the LLA that the user enterd invalid values
        alert("Invalid values for LLA " + LLA + ". Please enter valid numbers. Invalid values will be set to 0.");
        x = isNaN(x) ? 0 : x;
        y = isNaN(y) ? 0 : y;
        z = isNaN(z) ? 0 : z;
      }

    // console log for the lla this are the cordinates
    // console.log("for LLA ", LLA, " the cordinates are: ", x, y, z);
    // get only the sensor that equale to the LLA
    const sensor_cor = list.filter((sensor) => sensor.SensorData.LLA === LLA);

    // console.log("the current  sensors is: ", sensor_cor);
    if(list[0]){
      setEvent({
        type: "addCordinates",
        data: [sensor_cor, {x,y,z}]
      })
      sendEvent({
        type: "addCordinates",
        data: [sensor_cor, {x,y,z}]
      })
    }
    };
  
////////////////////////////////////////////////////////////////////

  const [labelOptions, setLabelOptions] = useState([]);
  const [experimentNameOptions, setExperimentNameOptions] = useState([]);

  const [experimentsData, setExperimentsData] = useState([]);
  const [labelsData, setLabelsData] = useState([]);

  const [filteredSensors, setFilteredSensors] = useState([])

  const [runningExperiments, setRunningExperiments] = useState([])

  const [email, setEmail] = useState();

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };



const handleRemoveExpName = (nameToRemove) => {
  // alert and except before
  if (window.confirm(`Are you sure you want to delete experiment ${nameToRemove}?`)) {
  setExperimentsData((prevData) => {
    const updatedData = prevData.filter((experiment) => experiment.Exp_name !== nameToRemove);
    console.log('Previous Data:', prevData); // Debugging statement
    console.log('Updated Data:', updatedData); // Debugging statement
    return updatedData;
  });
};
}

  

  // Function to handle email alert updates -> onClick in the AddEmail component
  const handleEmailAlert = (list,experimentName, newEmail) => {
    console.log("inside handleEmailAlert");
    // const updatedList = EmailAlert(list,experimentName, newEmail);
    EmailAlert(list,experimentName, newEmail);

  };

  // Send the email and the experiemnt name to the setEvent function
  const EmailAlert = (list, experimentName, newEmail) => {
    console.log("nir says experimentName: ", experimentName);
    console.log("nir says newEmail: ", newEmail);
    if (list[0]){
      setEvent ({
        type : "EmailAlert",
        data: [list, experimentName, newEmail]
      })
      sendEvent({
        type : "EmailAlert",
        data: [list, experimentName, newEmail]
      })
    }
  }

  const updateLabel= (dataArray) => {
    if (dataArray[0]){
      setEvent({
        type : "UpdateLabel",
        data: dataArray
      })
      sendEvent({
        type : "UpdateLabel",
        data: dataArray
      })
  }
  }



  // handle and prepare data for the download and upload csv button
  // send the csv data to thesetEvent function
  const UpdateDataArray = (dataArray) => {
    console.log("inside UpdateDataArray");
    console.log("the data array is: ", dataArray);
    if (dataArray[0]){
      setEvent({
        type : "UpdateDataArray",
        data: dataArray
      })
      sendEvent({
        type : "UpdateDataArray",
        data: dataArray
      })
    }
  }
  
  const csvData = list
  .filter((sensor) => !sensor.SensorData.isActive)
  .map(sensor => ({
    ...sensor.ExperimentData, // Pass the experiment data
    ...sensor.SensorData, // Pass the sensor data
    ...sensor.Alerts.Temperature, // Pass the temperature data
    ...sensor.Alerts.Light, // Pass the light data
  }));

const defaultTemperature = {
  Max_Temp: 100,
  Min_Temp: 10,
};

const defaultLight = {
  Max_Light: 60000,
  Min_Light: 0,
};

const deafultCordinates = {
  x: 0,
  y: 0,
  z: 0,
}

const handleCsvUpload = (csvData) => {
  // Ensure csvData is an array and its length does not exceed the length of 'list'
  const dataArray = Object.values(csvData).slice(0, -1).slice(0, list.length);

  let missingFields = new Set();
  let defaultsAssigned = false;
  let Labels = []; // Array to hold all the labels
  let SensorNames = []; // Array to hold all the sensor names
  let experimentNames = []; // Array to hold all the experiment names

  dataArray.forEach((data) => {
    let mini_Label = [];
    if (data.Exp_name === null || !data.Exp_name) { // if the experiment name is null or empty, add it to the missing fields set
      missingFields.add("Experiment Name"); // Add the missing field to the set
    }
    //add data.Exp_name to the experimentNames array
    experimentNames.push(data.Exp_name);
    if (data.LLA === null || !data.LLA) {
      missingFields.add("LLA"); // Add the missing field to the set
    }
    // add the data.Location to the SensorNames array
    SensorNames.push(data.Location);
    if (data.Location === null || !data.Location) {
      missingFields.add("Location"); // Add the missing field to the set
    }

    if (!data.Exp_location || data.Exp_location === null) {
      missingFields.add("Experiment Location"); // Add the missing field to the set
    }

    // Assign default values to temperature and light if not provided
    if (data.Max_Temp === null) { data.Max_Temp = defaultTemperature.Max_Temp; defaultsAssigned = true; }
    if (data.Min_Temp === null) { data.Min_Temp = defaultTemperature.Min_Temp; defaultsAssigned = true; }
    if (data.Max_Light === null) { data.Max_Light = defaultLight.Max_Light; defaultsAssigned = true; }
    if (data.Min_Light === null) { data.Min_Light = defaultLight.Min_Light; defaultsAssigned = true; }
    if (data.Cordinate_X === null) { data.Cordinate_X = deafultCordinates.x; defaultsAssigned = true; }
    if (data.Cordinate_Y === null) { data.Cordinate_Y = deafultCordinates.y; defaultsAssigned = true; }
    if (data.Cordinate_Z === null) { data.Cordinate_Z = deafultCordinates.z; defaultsAssigned = true; }

    addCordinates(data.LLA, data.Cordinate_X, data.Cordinate_Y, data.Cordinate_Z);

    // Process keys in data to update Labels and create mini_Label
    Object.keys(data).forEach((key) => {
      if (key.includes("#")) {
        const tempLabel = data[key].replace(/\r/g, '').trim();
        // Add to Labels array if not already included
        if (!Labels.includes(tempLabel)) {
          Labels.push(tempLabel);
        }
        // Add to mini_Label array
        mini_Label.push(tempLabel);
      }
    });

    // Add another column called Labels to the data which contains all the labels for a specific sensor
    data.Labels = mini_Label;
  });

  // experiment valeus should be the same for all the sensors
  let shouldStop = false; // This will be used to stop the loop if an experiment is already running
  const uniqueExperimentNames = new Set(experimentNames);
  if (uniqueExperimentNames.size !== 1) { // if the experiment names are not the same for all the sensors, alert the user
    alert("Experiment names are not the same for all sensors. Please ensure all sensors have the same experiment name. You can set up only one experiemnt at a time.");
    shouldStop = true;
  }
  if (shouldStop) {
    forceRefresh();
    return;
  }

  // check if SensorNames has duplicate if so shouldStop = true 
  // let shouldStop = false; // This will be used to stop the loop if an experiment is already running
  const uniqueSensorNames = new Set(SensorNames);
  if (uniqueSensorNames.size !== SensorNames.length) {
    alert("Duplicate sensor names found in the CSV. Please ensure all sensor names are unique.");
    shouldStop = true;
  }
  if (shouldStop) {
    // forceRefresh();
    return;
  }

// Regular expression to match the word "faulty" in any case combination
  const faultyRegex = /faulty/i;
  // Check if any of the sensor names contain the word "faulty" in any case combination and alert the user
  const faultySensorNames = SensorNames.filter((name) => faultyRegex.test(name));
  if (faultySensorNames.length > 0) {
    alert(`The following sensor names contain the word "faulty": ${faultySensorNames.join(", ")}. Please ensure sensor names do not contain the word "faulty".`);
    shouldStop = true;
  }
  if (shouldStop) {
    // forceRefresh();
    return;
  }





  // added 20240714 - add the labels to the sensor
  Labels.forEach((label) => {
    if (!labelOptions.includes(label)) {
      setLabelsData((prevOptions) => [...prevOptions, label]);
    }

  });
  //Labels is a list of all of the optinal labels, add for each line a list of labels without repitition
  console.log("the labels options are: ", Labels);
  dataArray.forEach((data) => {
    data.labelOptionsList = Labels;

  });
  setLabelOptions([...labelOptions, Labels])
  

  const uniqueKeySet = new Set(); // This will be used to keep track of unique experiments
  const uniqueExperiments = []; // This will be the array of unique experiments
  
  
  // from list create a array of the experiment which isActive=True and their LLA
    const runningExperiments = list
    .filter((sensor) => sensor.SensorData.isActive)
    .map((sensor) => ({
      Exp_name: sensor.ExperimentData.Exp_name,
      LLA: sensor.SensorData.LLA
    }));

  
 

  // Loop through the data array and check if the experiment already exists in the uniqueKeySet
  dataArray.forEach(data => {
    // Check if the experiment is already running and contains the same LLA
    const isExperimentRunning = runningExperiments.some(exp => exp.Exp_name === data.Exp_name && exp.LLA === data.LLA);
    if (isExperimentRunning) {
      alert(`The experiment ${data.Exp_name} with LLA ${data.LLA} is already running. Please end the experiment before uploading data. Coordinate (X,Y,Z) can always be modified using the original csv.`);
      shouldStop = true;
    }
    const uniqueKey = `${data.Exp_name}-${data.Exp_location}`; // Create a unique key for each experiment
    if (!uniqueKeySet.has(uniqueKey)) {  // If the unique key does not exist in the set, add it and push the experiment to the uniqueExperiments array
      uniqueKeySet.add(uniqueKey);// Add the unique key to the set
      uniqueExperiments.push({// Push the experiment to the uniqueExperiments array
        Exp_name: data.Exp_name,
        Exp_location: data.Exp_location
      });
    }
  });
  if (shouldStop) {
    // using forceRefresh function to reload the page
    forceRefresh();
    return; // Stop the function if an experiment is already running
  }
  
    // Combine with existing experimentsData and update state
    const updatedExperimentsData = [...experimentsData, ...uniqueExperiments.filter(exp => {
      const expKey = `${exp.Exp_name}-${exp.Exp_location}`;
      return !experimentsData.some(existingExp => `${existingExp.Exp_name}-${existingExp.Exp_location}` === expKey);
    })];
    setExperimentsData(updatedExperimentsData); // Set the experiments data state with the unique experiments array
  
    console.log("the unique!!!",uniqueExperiments); // This will be your array of unique experiments
      
  
    // Convert the missing fields set to an array
    console.log("missing fields: ", missingFields)
    const missingFieldsArray = Array.from(missingFields);
    console.log("deafults assigned: ", defaultsAssigned)
    // Alert if there are missing fields, otherwise activate UpdateDataArray
    let alertMessage = ''

    if (missingFields.length >0) {
      alertMessage += `Missing fields: ${missingFieldsArray.join(", ")}\n Please fix the CSV and try again.`;
    }

    if (defaultsAssigned) {
      alertMessage += `\n\nDefault values were assigned to missing fields:\n` +
      `Temperature ${defaultTemperature.Min_Temp}-${defaultTemperature.Max_Temp}\n` +
      `Light ${defaultLight.Min_Light}-${defaultLight.Max_Light}\n` +
      `Coordinates X:${deafultCordinates.x}, Y:${deafultCordinates.y}, Z:${deafultCordinates.z}.`;    }
      // if alertMessage is not empty, alert the user
      if (alertMessage !== '') {
        alert(alertMessage);
      }
      console.log("the csv to be sent to mongo is:", dataArray)
      // Create a set of LLA values from dataArray for quick lookup
      const dataArrayLLASet = new Set(dataArray.map(data => data.LLA));
      // update Alerts.Alerted to true for mathin LLA values
      list.forEach(item => {
        if (dataArrayLLASet.has(item.SensorData.LLA)) {
          item.Alerts.Alerted = true;
        }
      });
      UpdateDataArray(dataArray);
  };

  // Handles submits from AddExperiment and AddLabel components
  function handleSubmitOption(type, option) {
    if(type === "label")
      setLabelOptions([...labelOptions, option])
    if(type === "experimentName")
      setExperimentNameOptions([...experimentNameOptions, option])  
    if(type === "experimentData")  
    setExperimentsData([...experimentsData, option])

    if(type === "labelData")
      setLabelsData([...labelsData, option])
  }

  // Function to remove running experiments from experimentsData
  const updateExperimentsData = useCallback(() => {
    setExperimentsData((prevExperimentsData) =>
      prevExperimentsData.filter(
        (experiment) => !runningExperiments.includes(experiment.Exp_name)
      )
    );
  }, [runningExperiments]);

  // Whenever runningExperiments changes, call the updateExperimentsData function
  useEffect(() => {
    updateExperimentsData()
  }, [runningExperiments,updateExperimentsData])

  // Dealing with local storage
  useEffect(() => {
    if (experimentsData.length > 0) {
      localStorage.setItem('experimentsData', JSON.stringify(experimentsData));
    }
  }, [experimentsData]);

  useEffect(() => {
    if (labelsData.length > 0) {
      // temporary prevent the labelData in the localStorge
      localStorage.setItem('labelsData', JSON.stringify(labelsData));
    }
  }, [labelsData]);
  
  useEffect(() => {
    const storedExperimentsData = localStorage.getItem('experimentsData');
    const storedLabelsData = localStorage.getItem('labelsData');

    // console.log(storedExperimentsData);
    // console.log(storedLabelsData);

    if (storedExperimentsData) {
      setExperimentsData(JSON.parse(storedExperimentsData));
    }
    if (storedLabelsData) {
      setLabelsData(JSON.parse(storedLabelsData));
    }
  }, []);

      
  // const handleRemoveLabel = (selectedExperiment,label) => {
  // console.log("the label to be removed is: ", label);
  //  // Ensure the label is removed from labelOptions
  //  setLabelOptions((prevLabelOptions) =>
  //       prevLabelOptions.filter((option) => option !== label)
  // );
  // // Additionally, update the labelsData state if needed
  // setLabelsData((prevLabelsData) =>
  //       prevLabelsData.filter((option) => option !== label)
  // );
  // // clear setLabelOptions as labelOptions to empty array
  // setLabelOptions([]);
  // console.log("the labels after removing the label are: ", labelsData);

  // // update the list state to rmeove the labels from SensorData.label
  // const updatedList = list.map((sensor) => {
  //   if (sensor.ExperimentData.Exp_name === selectedExperiment) {
  //     console.log(sensor.ExperimentData.Exp_name, selectedExperiment)
  //     return {
  //       ...sensor,
  //       SensorData: {
  //         ...sensor.SensorData,
  //         Label: sensor.SensorData.Label.filter((option) => option !== label)
  //       }
  //     }
  //   }
  //   return sensor;
  // });
  // console.log("The updatedList is", updatedList)

  
  // setList(updatedList);
  // console.log("the updated list after removing the label is: ", updatedList);

  //   // Ensure the label is removed from labelOptions
  //   setLabelOptions((prevLabelOptions) => prevLabelOptions.filter((option) => option !== label)); // Remove the label from the labelOptions state
  //   // Additionally, update the labelsData state if needed
  //   //setLabelsData((prevLabelsData) => prevLabelsData.filter((option) => option !== label)); // Remove the label from the labelsData state
  // };
  // get labelsData from list 
  const getLabelsData = (list) => {
    const Labels = list.map((sensor) => sensor.SensorData.Label);
    console.log("the labels are: ", Labels);
    return Labels;
  }


  return (
    <div className="App">
      <Header
        title="Field 4D Sensor Managements"
        list={list}
      />
      <nav className="navbar">
        <ul>
          <li>
            <StartExpButton
              list={list}
              setSensor={setSensor}
              setList={setList}
              startNewExperiment={startNewExperiment}
              runningExperiments={list.map((obj) => obj.SensorData.isActive && obj.ExperimentData.Exp_name)}
              setRunningExperiments={setRunningExperiments}
              options={experimentsData.map((obj) => obj.Exp_name)}
              email={email}
            />
          </li>
          <li>
            <EndExpButton
              list={list}
              setSensor={setSensor}
              setList={setList} 
              endExperiment={endExperiment}
              runningExperiments={list.map((obj) => obj.SensorData.isActive && obj.ExperimentData.Exp_name)}
              setRunningExperiments={setRunningExperiments}
              options={experimentsData.map((obj) => obj.Exp_name)}
            />
          </li>
          <li>
            <DownloadCSVButton data={csvData} />
          </li>
          <li>
            <UploadCSVButton onFileLoaded={handleCsvUpload} />
          </li>
          <li>
            <FilteredList
              list={list}
              setFilteredSensors={setFilteredSensors}
            />
          </li>
        </ul>
        <button className="toggle-button" onClick={toggleSidebar}>
          {isSidebarOpen ? 'Close Experiment SetUp' : 'Open Experiment SetUp'}
        </button>
      </nav>

      <div className="content">
        <List
          className="left-element"
          list={filteredSensors.length === 0 ? list : filteredSensors}
          pinged={pinged}
          setList={setList}
          setSensor={setSensor}
          SwitchSensor={SwitchSensor}
          labelOptions={getLabelsData}
          addCordinates={addCordinates}
          removeSensorBoot={removeSensorBoot}
          experimentsData={experimentsData}
          setExperimentsData={setExperimentsData}
          email={email}
        />
        <div className={`right-element ${isSidebarOpen ? 'open' : 'closed'}`}>
          <AddExperiment
            exp_locations={experimentsData.length !== 0 ? experimentsData.map((obj) => obj.Exp_location) : ['None']}
            options={experimentsData.length !== 0 ? experimentsData.map((obj) => obj.Exp_name) : ['None']}
            onSubmit={handleSubmitOption}
            handleRemoveExpName={handleRemoveExpName}
          />
          <AddLabel
            options={labelsData.length !== 0 ? labelsData : ['None']}
            list={list}
            updateLabel={updateLabel}
          />
          <AddEmail
            list={list}
            setList={setList}
            setSensor={setSensor}
            setEmail={setEmail}
            experimentsData={experimentsData}
            handleEmailAlert={handleEmailAlert}
          />
        </div>
      </div>
    </div>
  );
}

export default App;