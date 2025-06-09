# Field4FD Global WebApp 🌐

> For overall project setup and backend info, see the root [README.md](../README.md).

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Google Cloud](https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)](https://cloud.google.com/)

A powerful web application for real-time visualization and analysis of sensor data from Google Cloud Platform's BigQuery. Built with modern web technologies and designed for scalability and performance.

## 🚀 Features

### Recent UI/Feature Updates
- **Sensor Selection Counter:** The "Select Sensors" dropdown now displays a live counter badge (X/Y) next to the label, showing how many sensors are selected out of the total available. The counter updates instantly as you select/deselect sensors and is styled for visibility.
- **Improved CSV Export:** The CSV export (Download CSV) now always includes all selected sensors and parameters as columns, even if some are missing from the data. Columns are sorted alphabetically (except for the Timestamp column), and missing data is filled with empty values to ensure consistent structure across exports.
- **Configurable and Centered Plot Area:** The scatter plot area can now be sized programmatically and is centered horizontally for improved aesthetics.
- **Consistent Correlation Matrix:** The correlation matrix and all related scatter plots always use all parameters from the "Select Parameters" control, ensuring consistent analysis.

### Data Visualization
- 📊 Interactive time-series graphs using Plotly.js
- 🔍 Multi-sensor and multi-parameter selection (with live selection counter)
- 📅 Flexible date range selection
- 📈 Real-time data updates
- 🎨 Customizable visualization options

### Data Management
- 📥 CSV export functionality (all selected sensors/parameters included, columns sorted, missing data filled)
- 🔄 Real-time data fetching
- 📋 Data filtering and sorting
- 💾 Historical data access

### User Experience
- 🔐 Secure authentication system
- 🎯 Intuitive user interface
- 📱 Responsive design
- 🌙 Dark/Light mode support
- ⚡ Fast loading times

### Advanced Analytics
- 🟢 **Outlier Filtering Toggle**: Enable or disable IQR-based outlier filtering for all visualizations (Scatter, Box, Histogram). Toggle is available next to the Parameters selection and above the Histogram plot. When enabled, outliers are hidden from graphs and CSV export. Toggle state is persisted for user convenience. (See `src/components/Advanced-function/OutlierToggle.tsx`)
- 📁 **Advanced-function Folder**: New folder for advanced analytic tools, starting with OutlierToggle. Designed for future extensibility (e.g., z-score filtering, more toggles).

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **State Management**: React Context API
- **Styling**: Tailwind CSS
- **Data Visualization**: Plotly.js
- **UI Components**: React-Select, React-Date-Range
- **Build Tool**: Vite

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Google Cloud BigQuery
- **Authentication**: JWT
- **API**: RESTful

## 🔍 Logging Control (Frontend)

The frontend uses a centralized logger utility to control all console output. This makes it easy to enable or disable logging for development or production environments.

### How it works
- All logging in the codebase should use the `logger` utility from `src/config/logger.ts`.
- You can enable or disable all logs by setting the `ENABLE_LOGGING` flag in `src/config/logger.ts`.
- You can also control which log levels (error, warn, info, debug) are enabled.

### Example usage
```typescript
import { logger } from '../config/logger';

logger.info('This is an info message');
logger.error('This is an error');
logger.warn('This is a warning');
logger.debug('This is a debug message');
```

### Configuration
Edit `src/config/logger.ts`:
```typescript
export const LOGGER_CONFIG = {
  ENABLE_LOGGING: false, // Set to true to enable all logs, false to disable
  LOG_LEVELS: {
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: false
  }
};
```
- Set `ENABLE_LOGGING: false` to silence all logs in production.
- Set individual log levels to `true` or `false` as needed.

### Note
If you see logs in the browser console after disabling logging, make sure all direct `console.log` calls have been replaced with the `logger` utility. Third-party library logs cannot be controlled by this flag.

## 📋 Prerequisites

Before you begin, ensure you have:
- Node.js (v14 or higher)
- npm or yarn
- Google Cloud Platform account
- BigQuery access credentials
- Git

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/averbuchnir/Field4FD_global_webApp.git
   cd Field4FD_global_webApp
   ```

2. **Install dependencies**
   ```bash
   # Install frontend dependencies
   npm install

   # Install backend dependencies
   cd backend
   npm install
   ```

3. **Environment Setup**
   Create the following files with your credentials:

   `backend/auth/.env`:
   ```env
   GCP_PROJECT_ID=your-project-id
   GCP_PRIVATE_KEY_ID=your-private-key-id
   GCP_PRIVATE_KEY=your-private-key
   GCP_CLIENT_EMAIL=your-client-email
   GCP_CLIENT_ID=your-client-id
   GCP_CLIENT_X509_CERT_URL=your-cert-url
   GCP_USER_TABLE=your-user-table-path
   ```

   `backend/auth/config.json`:
   ```json
   {
     "bigQuery": {
       "projectId": "your-project-id",
       "dataset": "your-dataset",
       "table": "your-table"
     }
   }
   ```

4. **Start Development Servers**
   ```bash
   # Start backend server
   cd backend
   npm run dev

   # Start frontend server (in new terminal)
   cd ..
   npm run dev
   ```

## 🏗️ Project Structure

```
Field4FD_global_webApp/
├── src/
│   ├── components/          # React components
│   │   ├── Auth.tsx        # Authentication component
│   │   ├── Dashboard.tsx   # Main dashboard
│   │   └── DataSelector.tsx# Data selection interface
│   ├── types/              # TypeScript type definitions
│   ├── api/                # API integration
│   └── App.tsx             # Root component
├── backend/
│   ├── auth/               # Authentication logic
│   ├── routes/             # API routes
│   └── server.js           # Express server
├── public/                 # Static assets
└── package.json            # Project configuration
```

## 🔄 Development Workflow

1. **Branch Structure**
   - `Dev` (default): Development branch
   - `main`: Stable releases
   - `Production`: Production-ready code

2. **Creating Features**
   ```bash
   git checkout Dev
   git checkout -b feature/your-feature-name
   # Make changes
   git add .
   git commit -m "feat: add your feature"
   git push origin feature/your-feature-name
   ```

3. **Code Review**
   - Create Pull Request from feature branch to `Dev`
   - Get code review approval
   - Merge to `Dev`

## 🧪 Testing

```bash
# Run frontend tests
npm test

# Run backend tests
cd backend
npm test
```

## 📦 Deployment

1. **Production Build**
   ```bash
   npm run build
   cd backend
   npm run build
   ```

2. **Deploy to Production**
   ```bash
   git checkout Production
   git merge main
   # Deploy using your preferred method
   ```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

**Please send your contributions or proposals to:**
Idan Ifrach <idan.ifrach@mail.huji.ac.il>, Menachem Moshelion <menachem.moshelion@mail.huji.ac.il>

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact

Nir Averbuch - [GitHub](https://github.com/averbuchnir)

Project Link: [https://github.com/averbuchnir/Field4FD_global_webApp](https://github.com/averbuchnir/Field4FD_global_webApp)

## 🙏 Acknowledgments

- [React](https://reactjs.org/) - The web framework used
- [Google Cloud Platform](https://cloud.google.com/) - Cloud infrastructure
- [Plotly.js](https://plotly.com/javascript/) - Data visualization
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework 