# Field4FD Global Web App

> ⚠️ **Warning:** The `Dev` branch is for active development and may be unstable. Use at your own risk. For stable releases, use the `main` branch.
>
> Last updated: June 07 2025

## 📁 Project Structure

```
Field4FD_global_webApp/
├── backend/                # Node.js/Express/BigQuery backend
│   ├── auth/               # Authentication config (.env)
│   ├── routes/             # (Optional) API route modules
│   ├── server.js           # Main Express server
│   ├── package.json        # Backend dependencies and scripts
│   └── ...                 # Other backend files
├── frontend/               # React (Vite) frontend
│   ├── src/
│   │   ├── components/     # React UI components
│   │   │   ├── Auth.tsx        # Login/Sign-up form and logic
│   │   │   ├── Dashboard.tsx   # Main dashboard, system/experiment selection, data display
│   │   │   └── DataSelector.tsx# Data filtering, sensor/parameter/date selection
│   │   ├── api/            # (Optional) API helpers (should not contain secrets)
│   │   ├── App.tsx         # Root React component
│   │   ├── main.tsx        # React entry point
│   │   └── ...             # Other frontend files
│   ├── public/             # Static assets (logo, favicon, etc.)
│   ├── package.json        # Frontend dependencies and scripts
│   ├── vite.config.ts      # Vite config
│   └── ...                 # Other frontend config
├── README.md               # This file
└── ...                     # Other root files
```

---

## 🆕 Recent UI/Feature Updates
- **Enhanced Login Security:**
  - Improved password validation:
    - Minimum 8 characters
    - Must contain at least one letter and one number
    - Real-time validation feedback
  - Fixed loading state handling:
    - Sign-in button properly resets after validation errors
    - No more stuck loading states
    - Immediate feedback for invalid credentials

- **Label-Based CSV Export:** Enhanced CSV export functionality with label-based aggregation:
  - Creates separate CSV files for each parameter when using label grouping
  - Each file includes mean and standard deviation calculations for each label
  - Files are named with format: `{experiment}_{parameter}_labels_{date}.csv`
  - Example file structure:
    ```csv
    # temperature_labels_2024-03-20.csv
    Timestamp,LabelA-Mean,LabelA-STD,LabelB-Mean,LabelB-STD,LabelC-Mean,LabelC-STD
    2024-03-20T10:00:00,25.5,0.3,26.2,0.4,24.8,0.2
    2024-03-20T10:03:00,25.7,0.2,26.4,0.3,25.0,0.1

    # humidity_labels_2024-03-20.csv
    Timestamp,LabelA-Mean,LabelA-STD,LabelB-Mean,LabelB-STD,LabelC-Mean,LabelC-STD
    2024-03-20T10:00:00,60,1.2,58,0.8,62,1.0
    2024-03-20T10:03:00,61,1.1,57,0.9,63,1.2
    ```

- **Parameter-Specific CSV Export:** The CSV export functionality has been enhanced to create separate files for each parameter:
  - Each parameter gets its own CSV file (e.g., `Experiment1_temperature_2024-03-20.csv`, `Experiment1_humidity_2024-03-20.csv`)
  - Files contain simplified columns: Timestamp and sensor values
  - All parameter files are downloaded automatically when clicking the download button
  - Example file structure:
    ```csv
    # temperature_2024-03-20.csv
    Timestamp,sensor1,sensor2,sensor3
    2024-03-20T10:00:00,25.5,26.2,24.8
    2024-03-20T10:03:00,25.7,26.4,25.0

    # humidity_2024-03-20.csv
    Timestamp,sensor1,sensor2,sensor3
    2024-03-20T10:00:00,60,58,62
    2024-03-20T10:03:00,61,57,63
    ```
- **Sensor Selection Counter:** The "Select Sensors" dropdown in the frontend now displays a live counter badge (X/Y) next to the label, showing how many sensors are selected out of the total available. The counter updates instantly as you select/deselect sensors and is styled for visibility.
- **Improved CSV Export:** The CSV export (Download CSV) now always includes all selected sensors and parameters as columns, even if some are missing from the data. Columns are sorted alphabetically (except for the Timestamp column), and missing data is filled with empty values to ensure consistent structure across exports.
- **Advanced Data Visualization:** New graph components for enhanced data analysis:
  - Interactive correlation matrix with heatmap visualization
  - Detailed correlation scatter plots with regression analysis
  - Multi-parameter time series plots with customizable colors and responsive layout
  - Support for various parameter units and automatic unit display
  - Loading states and error handling for all visualizations

---

## 🚀 Getting Started

### 1. **Backend Setup**
```bash
cd backend
npm install
npx nodemon server.js
```
- The backend reads config from `backend/auth/.env` (never from config.json).
- All BigQuery and sensitive logic is handled here.

### 2. **Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```
- The frontend is a Vite+React app.
- It communicates with the backend via API endpoints (never directly with BigQuery).

---

## 🧩 Main Components

### **Backend**
- **server.js**: Main Express server, handles API routes, authentication, permissions, and BigQuery queries.
- **auth/.env**: Stores all sensitive credentials and config (never commit this to git).
- **routes/**: (Optional) Place for modular route files if your backend grows.

### **Frontend**
- **src/components/Auth.tsx**:  
  Handles user authentication (login, sign-up, forgot password).  
  UI for entering credentials and switching modes.
- **src/components/Dashboard.tsx**:  
  Main dashboard after login.  
  Lets users select a system (by MAC), then an experiment, then a date range.  
  Shows data visualizations and allows CSV download.  
  **New:** Sensor selection counter and improved CSV export for selected sensors/parameters.
- **src/components/DataSelector.tsx**:  
  UI for selecting sensors (with live counter), parameters, and date ranges for data queries.  
  Handles data fetching, CSV export (with all selected sensors/parameters as columns), and error display.
- **src/components/graph-components/**:  
  Collection of advanced data visualization components:
  - **ScatterPlot.tsx**: Multi-parameter, multi-sensor time series scatter plot with customizable colors and responsive layout.
  - **CorrelationMatrix.tsx**: Interactive heatmap showing correlations between parameters with clickable cells and loading states.
  - **CorrelationScatter.tsx**: Detailed scatter plot for analyzing correlations between two parameters, including regression line and statistics.
- **src/App.tsx**:  
  Root React component, sets up routing and layout.
- **src/main.tsx**:  
  React entry point, renders the app.

---

## 📚 API Endpoint Documentation

### **POST `/api/auth`**
- **Description:** Authenticate a user and return user info.
- **Request Body:**
  ```json
  {
    "email": "user@mail.com",
    "password": "yourpassword"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Authentication successful",
    "userData": {
      "email": "user@mail.com",
      "created_at": "...",
      "last_login": "..."
    }
  }
  ```
- **Errors:**
  - `401 Unauthorized` if credentials are wrong
  - `500 Internal Server Error` for server issues

**Password Security:**
- User passwords are never stored or compared in plain text.
- Passwords are hashed using SHA256 and then encoded in Base64 before being stored in the database.
- During login, the entered password is hashed and encoded in the same way and compared to the stored hash.

**Example (Node.js):**
```js
const crypto = require('crypto');
function hashPassword(password) {
  const hash = crypto.createHash('sha256').update(password).digest();
  return Buffer.from(hash).toString('base64');
}
```

---

### **GET `/api/permissions?email=user@mail.com`**
- **Description:** Get all permissions for a user.
- **Query Params:**
  - `email` (required): The user's email address
- **Response:**
  ```json
  {
    "success": true,
    "permissions": [
      {
        "email": "user@mail.com",
        "owner": "ownername",
        "mac_address": "abc123",
        "experiment": "exp_1",
        "role": "user",
        ...
      }
    ]
  }
  ```
- **Errors:**
  - `400 Bad Request` if email is missing
  - `404 Not Found` if no permissions
  - `500 Internal Server Error` for server issues

---

### **POST `/api/experiment-summary`**
- **Description:** Get experiment summary for permitted experiments.
- **Request Body:**
  ```json
  {
    "table_id": "project.dataset.table",
    "experiments": ["exp_1", "exp_2"]
  }
  ```
- **Response:**
  ```json
  [
    {
      "experimentName": "exp_1",
      "firstTimestamp": "...",
      "lastTimestamp": "...",
      "sensorTypes": ["temperature", "humidity"],
      "sensorLabelOptions": ["option1", "option2"],
      "sensorLabelMap": { ... }
    },
    ...
  ]
  ```
- **Errors:**
  - `400 Bad Request` if required fields are missing
  - `500 Internal Server Error` for server issues

---

### **POST `/api/fetch-data`**
- **Description:** Fetch sensor data for a given experiment, sensors, parameters, and date range.
- **Request Body:**
  ```json
  {
    "table_id": "project.dataset.table",
    "experiment": "exp_1",
    "selectedSensors": ["sensor1", "sensor2"],
    "selectedParameters": ["param1", "param2"],
    "dateRange": { "start": "2025-01-01T00:00:00Z", "end": "2025-01-02T00:00:00Z" }
  }
  ```
- **Response:**
  ```json
  [
    {
      "timestamp": "2025-01-01T00:00:00Z",
      "sensor": "sensor1",
      "parameter": "param1",
      "value": 42.0
    },
    ...
  ]
  ```
- **Errors:**
  - `400 Bad Request` if required fields are missing
  - `500 Internal Server Error` for server issues

---

## 📝 Contributing

- Contributions are mainly in **graphic preview** (data visualization, UI/UX, etc.).
- Contributions can be written in **Python** or **Java**.
- Contributions code will be well documented and explained. 
- Please send your contributions or proposals to: [nir averbuch](mailto:nir.averbuch@mail.huji.ac.il), [idan ifrach](mailto:idan.ifrach@mail.huji.ac.il), [Prof. Menachem Moshelion](mailto:menachem.moshelion@mail.huji.ac.il) 
- Fork the repo and create a feature branch from `Dev` if you want to submit code changes.


---

## 📢 Contact

For questions or support, please contact the project maintainer at
- [nir averbuch](mailto:nir.averbuch@mail.huji.ac.il), 
- [idan ifrach](mailto:idan.ifrach@mail.huji.ac.il), 
- [Prof. Menachem Moshelion](mailto:menachem.moshelion@mail.huji.ac.il) 

## 📚 Sub-Project Documentation
- [Frontend README](frontend/README.md) — for UI/UX, visualization, and developer notes
- [Backend README](backend/README.md) — for API, environment, and backend developer notes

## Data Processing Configuration

The application includes configurable parameters for handling large datasets efficiently:

### Batch Processing
- `BATCH_SIZE`: Controls how many rows are processed at once (default: 500)
  - Smaller values (e.g., 100) use less memory but process slower
  - Larger values (e.g., 1000) process faster but use more memory
  - Adjust based on your system's capabilities and data size

### Logging Configuration
- `LOG_PERCENTAGE`: Controls how frequently progress is logged (default: 5%)
  - Value range: 1-100
  - Example: 5% means every 20th batch will be logged
  - Formula: `LOG_INTERVAL = Math.max(1, Math.floor(100 / LOG_PERCENTAGE))`
  - Lower values = fewer log messages = less overhead

### Sensor Chunking
- `CHUNK_SIZE`: Number of sensors processed per API request (default: 50)
  - Helps manage API request size
  - Adjust based on your API limits and performance needs

These parameters can be found in `frontend/src/components/DataSelector.tsx`:

```typescript
const BATCH_SIZE = 500;        // Process 500 rows at a time
const LOG_PERCENTAGE = 5;      // Log 5% of batches
const CHUNK_SIZE = 50;         // Process 50 sensors per request
```

Adjust these values based on:
- Available system memory
- Dataset size
- API limitations
- Desired logging verbosity

## Graph Plot Configuration

The application's visualization components can be customized through various configuration parameters. These settings can be found in the respective component files:

### ScatterPlot Configuration
Located in `frontend/src/components/graph-components/ScatterPlot.tsx`:
```typescript
// Layout configuration
const layout = {
  margin: {
    l: 60,  // Left margin
    r: 30,  // Right margin
    t: 30,  // Top margin
    b: 60   // Bottom margin
  },
  xaxis: {
    title: {
      text: 'Time',
      font: {
        size: 14,
        family: 'Arial'
      }
    },
    tickfont: {
      size: 12
    }
  },
  yaxis: {
    title: {
      text: 'Value',
      font: {
        size: 14,
        family: 'Arial'
      }
    },
    tickfont: {
      size: 12
    }
  },
  legend: {
    font: {
      size: 12
    },
    x: 1.1,  // Position from right
    y: 1     // Position from top
  }
};
```

### BoxPlot Configuration
Located in `frontend/src/components/graph-components/BoxPlot.tsx`:
```typescript
// Layout configuration
const layout = {
  margin: {
    l: 60,  // Left margin
    r: 30,  // Right margin
    t: 30,  // Top margin
    b: 60   // Bottom margin
  },
  xaxis: {
    title: {
      text: 'Sensor',
      font: {
        size: 14,
        family: 'Arial'
      }
    },
    tickfont: {
      size: 12
    }
  },
  yaxis: {
    title: {
      text: 'Value',
      font: {
        size: 14,
        family: 'Arial'
      }
    },
    tickfont: {
      size: 12
    }
  },
  legend: {
    font: {
      size: 12
    },
    x: 1.1,  // Position from right
    y: 1     // Position from top
  }
};
```

### Common Configuration Options

#### Margins
- `l`: Left margin (default: 60px)
- `r`: Right margin (default: 30px)
- `