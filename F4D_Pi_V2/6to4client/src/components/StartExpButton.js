import React, { useEffect, useState } from 'react'
import Modal from 'react-modal'
import '../css/StartExpButton.css'

const StartExpButton = ( { list, setSensor, setList , startNewExperiment, runningExperiments, setRunningExperiments, options} ) => {

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showForm, setShowForm] = useState(true)
  const [showSummary, setShowSummary] = useState(false)
  const [upload, setUpload] = useState(false)

  const [experimentName, setExperimentName] = useState()
  const [experimentNameValidation, setExperimentNameValidation] = useState()
  const [LLAList, setLLAList] = useState([])
  const [email, setEmail] = useState()
  const [tempAlerts, setTempAlerts] = useState(false)
  const [lightAlerts, setLightAlerts] = useState(false)

  const handleClick = () => {
    setIsModalOpen(true);
  };
    
  const handleSubmit = (ev, exp) => {
    ev.preventDefault()

    const sensors = list.filter((obj) => obj.ExperimentData.Exp_name === exp) // get all sensors assigned to the experiment


    if(sensors.length === 0) {
      alert(`There are no sensors assigned to "${exp}".`);
      setIsModalOpen(false)
      return;
    }

    let flag = false
    const locations = list
    .filter((obj) => obj.ExperimentData.Exp_name === exp)
    .map((obj) => obj.SensorData.Location);

    // find LLA of missingLocation where the location is empty
    const missingLocation = list
    .filter((obj) => obj.ExperimentData.Exp_name === exp)
    .filter((obj) => obj.SensorData.Location === '')
    .map((obj) => obj.SensorData.LLA);


    if(locations.length === 0){
      flag = true
    } else {
      locations.forEach((value) => {
        if (value === '') 
          flag = true
      })
    }

    if(flag) {
      alert(`You must fill "Location" field for all of the sensors "${missingLocation}" in the experiment "${exp}".`);
      // write alert with the sensor name (sensor) exp name and state that name for location needs to be filled
      setIsModalOpen(false)
      return;
    }

    if (exp === null || exp === "") {
      setIsModalOpen(false)
      return;
    } else if (!options.includes(exp)) {
      alert(`The experiment "${exp}" does not exist.`);
      setIsModalOpen(false)
      return;
    }

    if (runningExperiments.includes(exp)){
      alert(`The experiment "${exp}" is already running!`);
      setIsModalOpen(false)
      return
    }

    setExperimentName(exp)

    let filteredList = list.filter(obj => obj.ExperimentData.Exp_name === exp);
    setLLAList(filteredList.map((obj) => obj.SensorData.LLA))
    setEmail(list.find((item) => item.ExperimentData.Exp_name === exp).Alerts.Email)

    filteredList.forEach((item) => {
      if(item.Alerts.Alerted){
        if(item.Alerts.Temperature.Max_Temp !== '' || item.Alerts.Temperature.Min_Temp !== '')
          setTempAlerts(true)
        if(item.Alerts.Light.Max_Light !== '' || item.Alerts.Light.Min_Light !== '')
          setLightAlerts(true)
      }
    })
    
    setShowForm(false)
    setShowSummary(true)
  }

  useEffect(() => {
    if(upload) {
      if(experimentName === experimentNameValidation) {
        const updatedList = list.map(obj => {
          if (obj.ExperimentData.Exp_name === experimentName) {
            return {
              ...obj,
              SensorData: {
                ...obj.SensorData,
                isActive: true
              },
              ExperimentData: {
                ...obj.ExperimentData,
                Start_time: new Date().toString()
              }
            };
          }
          return obj;
        });
        
        const filteredList = updatedList.filter(obj => obj.ExperimentData.Exp_name === experimentName);
    
        setRunningExperiments( (prevList) => {
          return [...prevList, experimentName]
        })
        setList(updatedList);
        startNewExperiment(filteredList);
        setShowSummary(false)
        setUpload(false)
      } else {
          alert("The experiment's name you've just provided isn't matching the first name.\nPlease check that you've named your experiment properly!")
          setIsModalOpen(false)
          setShowForm(true)
          setShowSummary(false)
          return
      }
    }
  }, [
    upload,
    experimentName,
    experimentNameValidation,
    list,
    setList,
    setRunningExperiments,
    startNewExperiment
  ]);

  const handleCancel = () => {
    setIsModalOpen(false)
    setShowForm(true)
    setShowSummary(false)
  }

  const modalStyles = {
    overlay: {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
    },
    content: {
      width: "50%",
      height: "50%",
      margin: "auto",
      display: "flex",            // Added to enable Flexbox
      flexDirection: "column",   // Added to stack content in a column
      justifyContent: "center",   // Added to horizontally center the content
      alignItems: "center"        // Added to vertically center the content
    },
  };

  return (
    <>
      <button onClick={(e) => handleClick()} className='start_exp_button'>
        Start Experiment
      </button>

      <Modal
        isOpen={isModalOpen}
        onRequestClose={() => setIsModalOpen(false)}
        style={modalStyles}
      >
        { showForm? (
          <>
            <h2>Attention!</h2>
            <p>
              After you start an experiment, you won't be able to edit your sensors' data.<br/>
              Make sure that your experiment is properly set before you proceed.
            </p>
            
            <form onSubmit={(e) => { handleSubmit(e, e.target.elements.expName.value); }}>
              <label>
                Please enter the experiment you want to start:
              </label><br/>
              <input type="text" name="expName" autoComplete='off' autoFocus="on"/>
              <button type="submit">Submit</button>
              <button onClick={ handleCancel }>Cancel</button>
            </form>
          </>
        ) : (
          showSummary? (
            <>
              <h2>Let's Go Over Your Experiment</h2>
              <p>
                Your experiment's name is "{experimentName}".<br/>
                Total sensors: {LLAList.length}<br/>
                LLA adresses:
              </p>
              <ul>
                {LLAList.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
              <p>
                Temperature alerts: {tempAlerts?
                  <span style={{ backgroundColor: "green", color: "white" }}>Defined</span>
                  :
                  <span style={{ backgroundColor: "yellow" }}>Undefined</span>
                }<br/>
                Light alerts: {lightAlerts? //WHY IS THIS DEFINED WHEN IT'S UNDEFINED IN REAL LIFE
                  <span style={{ backgroundColor: "green", color: "white" }}>Defined</span>
                  :
                  <span style={{ backgroundColor: "yellow" }}>Undefined</span>
                }<br/>
                Alerts email: {email? email : "Undefined"}
              </p>
              <strong>An Important Note!</strong>
              <p>
                Once an experiment is started, your experiment's name and the sensors' locations will be immutable. Also, you will not be able to "pause" an experiment,
                this is not a sports game.<br/>
                Please make sure that your experiment is defined properly.
              </p>

              <form onSubmit={(e) => {
                e.preventDefault();
                setExperimentNameValidation(e.target.elements.expNameValidation.value)
                setUpload(true)
              }}>
                <label>
                  In order to finally start your experiment, please type your experiment's name once again:
                </label><br/>
                <input type='text' name='expNameValidation' autoComplete='off' autoFocus="on"/>
                <button type='submit'>Submit</button>
                <button onClick={ handleCancel }>Cancel</button>
              </form>
            </>
          ) : ( 
            <>
              <span className='celebrationEmoji'>🥳</span>
              <h2>Congratulations On Your New Baby!</h2>
              <h3>I mean, experiment...</h3>
              <p>
                Please note that it can take a little while until your precious data is uploaded to the cloud, up to 15 minutes approximately.<br/>
                Stay patient!
              </p>
              <button onClick={() => {setShowForm(true); setIsModalOpen(false)}}>Close</button>
            </>
          )
        )}
        
        {/* Modal Content */}
      </Modal>
    </>
  )
}

export default StartExpButton