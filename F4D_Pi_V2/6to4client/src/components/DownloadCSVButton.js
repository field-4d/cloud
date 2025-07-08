import React from 'react';
import '../css/DownloadCSVButton.css'


const DownloadCSVButton = ({ data }) => {
  const convertToCSV = (objArray) => {
    const array = typeof objArray !== 'object' ? JSON.parse(objArray) : objArray;
    let str = '';
    
    // Define the columns and their order
    const columns = [
      'LLA',
      'Location',
      'Exp_name',
      'Exp_location',
      'Cordinate_X',
      'Cordinate_Y',
      'Cordinate_Z',
      'Max_Temp', // Add Max_Temp to the columns
      'Min_Temp', // Add Min_Temp to the columns
      'Max_Light', // Add Max_Light to the columns
      'Min_Light', // Add Min_Light to the columns
    ];

    // Extract headers based on the selected columns
    const headers = columns.join(',') + '\r\n';
    str += headers;

    // Extract rows with selected columns
    for (let i = 0; i < array.length; i++) {
      let line = '';
      for (let j = 0; j < columns.length; j++) {
        if (line !== '') line += ',';
        if (columns[j] === 'LLA') {
          // Keep the "LLA" value as it is
          line += array[i][columns[j]];
        } else if (columns[j] === 'Location') {
          // Set the "Location" column to "Sensor_n"
          line += `Sensor_${i + 1}`;
        } else {
          // Set other columns to empty string
          line += '';
        }
      }
      str += line + '\r\n';
    }

    return str;
  };

  const download = () => {
    const csvData = convertToCSV(data);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'experiment_sensor_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return <button className="download_csv_button" onClick={download}>Download CSV</button>;
};

export default DownloadCSVButton;
