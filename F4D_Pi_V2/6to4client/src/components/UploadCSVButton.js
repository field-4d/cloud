
import React from 'react';
import '../css/UploadCSVButton.css';

class UploadCSVButton extends React.Component {
  handleFileChange = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const lines = content.split('\n');
      const headers = lines[0].split(',').map((header) => header.trim());
      const data = lines
        .slice(1)
        .map((line, index) => {
          const values = line.split(',').map((value) => (value.trim() === '' ? null : value));
          let obj = {};
          headers.forEach((header, headerIndex) => {
            obj[header] = values[headerIndex];
          });
          return obj;
        });

      const jsonData = {};
      data.forEach((row, rowIndex) => {
        jsonData[rowIndex] = row;
      });

      if (this.props.onFileLoaded) {
        this.props.onFileLoaded(jsonData);
      }
    };
    reader.readAsText(file);
  };

  render() {
    return (
      <div className="upload-container">
        <button className="upload_csv_button">Choose a CSV File</button>
        <input className="hidden-input" type="file" accept=".csv" onChange={this.handleFileChange} />
      </div>
    );
  }
}

export default UploadCSVButton;

