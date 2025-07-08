import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import App from './App';
import Data from './components/Data';
import Login from './components/Login';
import './css/AppRouter.css';

const Navigation = ({ onLogout }) => (
  <div className="nav-container">
    <Link to="/" className="nav-button-Exp">Sensors & Experiment</Link>
    <a
      href="https://field4d.com/"
      className="nav-button-Data"
      target="_blank"
      rel="noopener noreferrer"
    >
      Data Viewer
    </a>
    <button className="logout-button" onClick={onLogout}>Logout</button>
  </div>
);

const AppRouter = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem('authenticated') === 'true'
  );

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('authenticated');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div>
        <Navigation onLogout={handleLogout} />
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/data" element={<Data />} />
        </Routes>
      </div>
    </Router>
  );
};

export default AppRouter;
