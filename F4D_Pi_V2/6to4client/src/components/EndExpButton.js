import {React, useState} from 'react'
import Modal from 'react-modal' // 'Modal' is an easy-to-use pop-up window component 
import '../css/EndExpButton.css'

function EndExpButton({ list, setSensor, setList , endExperiment, runningExperiments, setRunningExperiments, options }) {

  // useState vars
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false)
  const [enteredExperiment, setEnteredExperiment] = useState('')

  // Opens the modal when the component is clicked
  const handleClick = () => {
    setIsModalOpen(true)
  }

  // Closes the modal
  const handleModalClose = () => {
    setIsModalOpen(false)
  }

  // This is fired after the first modal is confirmed
  const handleExperimentConfirmation = () => {
    
    // Validations
    if (!runningExperiments.includes(enteredExperiment)) {
      if (enteredExperiment === '')
        return
      else if (!options.includes(enteredExperiment)) {
        alert(`The experiment "${enteredExperiment}" does not exist.`)
        return
      }
      alert(`The experiment "${enteredExperiment}" is not running!`)
      return
    }
    
    // If we passed the validations, set this to true and open the next modal
    setIsConfirmationModalOpen(true)
  }

  //  This is fired if the second Modal is confirmed
  const handleConfirmationYes = () => {

    // Updating every sensor that is assigned to the experiment to be inactive, and adding an End_time to its' experiment data
    const updatedList = list.map(obj => {
      if (obj.ExperimentData.Exp_name === enteredExperiment) {
        return {
          ...obj,
          SensorData: {
            ...obj.SensorData,
            isActive: false,
 
          },
          ExperimentData: {
            ...obj.ExperimentData,
            End_time: new Date().toString()
          }
        }
      }
      return obj
    })

    // Extracting the relevant sensors
    // ( Looking at it right now, i realize that I've done a doubled work 😅 )
    const filteredList = updatedList.filter(obj => obj.ExperimentData.Exp_name === enteredExperiment)

    // Removing the ended experiment from the running experiments array
    setRunningExperiments(prevList => {
      const index = prevList.indexOf(enteredExperiment)
      if (index > -1) {
        return [prevList.splice(index)]
      }
    })

    setList(updatedList)

    // Sending an endExperiment event to the server
    endExperiment(filteredList)

    setIsConfirmationModalOpen(false) // Close the confirmation modal after handling the experiment logic
    setIsModalOpen(false) // Close the main modal as well
  }

  const handleConfirmationNo = () => {
    setIsConfirmationModalOpen(false) // Close the confirmation modal if the user chooses not to end the experiment
  }

  // Setting the styles for the modal
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
  }

  // Contents of the EndExpButton component
  return (
    <>
      {/* The button itself */}
      <button onClick={handleClick} className='end_exp_button'>
        End Experiment
      </button>

      {/* The first modal */}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={handleModalClose}
        style={modalStyles}
      >
        <h2>Please enter the experiment you want to end:</h2>
        <input
          type="text"
          value={enteredExperiment}
          onChange={e => setEnteredExperiment(e.target.value)}
          autoFocus = "on"
        />
        <button onClick={handleExperimentConfirmation}>Confirm</button>
        <button onClick={handleModalClose}>Cancel</button>
      </Modal>

      {/* The confirmation modal */}
      <Modal
        isOpen={isConfirmationModalOpen}
        onRequestClose={handleConfirmationNo}
        style={modalStyles}
      >
        <h2>Are you sure you want to terminate your experiment?</h2>
        <button onClick={handleConfirmationYes}>Yes</button>
        <button onClick={handleConfirmationNo}>No</button>
      </Modal>
    </>
  )
}

export default EndExpButton