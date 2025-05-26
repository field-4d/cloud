import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import App from './App';
import Data from './components/Data';
import './css/AppRouter.css'



// event holds the type of action we want to send to the server, currently as a JSON 
const Navigation = () => (
    <div className="nav-container">
      <Link to="/" className="nav-button-Exp">Sensors & Experiment</Link>
      <Link to="/data" className="nav-button-Data">Data Viewer</Link>
    </div>
  );
  
  const AppRouter = () => (
    <Router>
      <div>
        <Navigation />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/data" element={<Data />} />
        </Routes>
      </div>
    </Router>
  );
  
  export default AppRouter;
