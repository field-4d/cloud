import React, { useEffect, useState } from "react";
import '../css/EditableInput.css'

function EditableInput({ lla, defaultValue, type, list, setList, index, setSensor }) {

    // useState vars
    const [value, setValue] = useState('');
    const [editing, setEditing] = useState(false);
    const [tempValue, setTempValue] = useState(defaultValue);
    const [errorMessage, setErrorMessage] = useState("");

    // A function that is used for making sure that all the sensors' locations are unique.
    // - If the location is unique, RETURN TRUE
    // - If the location already appears (at least once), RETURN FALSE
    function validateLocation (location) {
        let flag = true

        if (list.some((sensor) => (sensor.SensorData.Location === location) && (location !== "Double click to add/edit location"))){
            flag = false
        }
        return flag
    }
    
    // Every time that 'value' is changed, do the following:
    // - Update the location field for the parent sensor, update the list and the parent sensor
    useEffect(() => {
        if (value !== "") {
            const newList = [...list];
            if (type === "location") {
                newList[index].SensorData.Location = value;
                setList(newList);
                setSensor(newList[index]);
            }
        }
    }, [value, index, list, setList, setSensor, type]); // Added missing dependenciess

    // Enables editing when you doubleclick the component
    const handleDoubleClick = () => {
        setEditing(true);
    };
    
    // Handles the value save
    const handleSave = () => {
        if (type ==="location") {
            
            // Validations
            if(tempValue.trim() === "") {
                setErrorMessage("Field cannot be empty");
                return
            } else if (tempValue.trim() === "Double click to add/edit location") {
                setErrorMessage("Field needs to be changed");
                return
            } else if (!validateLocation(tempValue)) {
                setErrorMessage("Name is already taken");
                return
            }
        }
        
        // Saving the value
        setValue(tempValue)
        setEditing(false)
        setErrorMessage("")
    };

    // Handles the discard
    const handleDiscard = () => {
        setTempValue(value);
        setEditing(false);
        setErrorMessage("");
    };

    // Handles the input change
    const handleInputChange = (e) => {
        setTempValue(e.target.value);
    };


    
    if (editing) {
        // If the client is in edit mode
        return (
            <form onSubmit={(e) => {
                e.preventDefault();
                handleSave()
            }}>
                <input type="text" placeholder={tempValue} onChange={handleInputChange} autoFocus= "on"/>
                <button type="submit">Save</button>
                <button onClick={handleDiscard}>Discard</button>
                <div style={{ color: "red" }}>{errorMessage}</div>
            </form>
        );
    } else {
        // If the client is in default mode
        return (
            <div
                className ="item"
                style={{ cursor: "pointer" }}
                onDoubleClick={handleDoubleClick}
            >
               { value? (value) : (defaultValue)} {/* If there is an actual value then show it, if not- display the default value*/}
            </div>
        )
    }
}

export default EditableInput;