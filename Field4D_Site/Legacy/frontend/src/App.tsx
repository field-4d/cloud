/*
 * App.tsx
 * Main entry point for the React frontend. Handles routing and session-based authentication.
 */

import React from 'react'
// import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Auth from './components/Auth'
import Dashboard from './components/Dashboard'
import './index.css'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

// Session expiration time in milliseconds (default: 24 hours)
const SESSION_DURATION = 24 * 60 * 60 * 1000;

/**
 * PrivateRoute
 * Protects routes that require authentication.
 * - Checks for userData in localStorage and session expiration.
 * - Redirects to login if not authenticated or session expired.
 * @param children - ReactNode(s) to render if authenticated
 * @returns children or <Navigate /> to login
 */
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const userDataRaw = localStorage.getItem('userData');
  let isAuthenticated = false;
  if (userDataRaw) {
    try {
      const userData = JSON.parse(userDataRaw);
      // Check for session timestamp
      if (userData.timestamp) {
        const now = Date.now();
        if (now - userData.timestamp < SESSION_DURATION) {
          isAuthenticated = true;
        } else {
          // Session expired
          localStorage.removeItem('userData');
        }
      } else {
        // No timestamp, treat as not authenticated
        localStorage.removeItem('userData');
      }
    } catch {
      localStorage.removeItem('userData');
    }
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/" />;
};

/**
 * AppWrapper
 * Handles global effects (e.g., login background) and sets up routes.
 * @returns JSX.Element
 */
function AppWrapper() {
  const location = useLocation();
  React.useEffect(() => {
    if (location.pathname === '/') {
      document.body.style.backgroundImage = "url('./background_Login.webp')";
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.minHeight = '100vh';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.minHeight = '';
    }
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Auth />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
    </Routes>
  );
}

/**
 * App
 * Top-level component. Wraps the app in a Router.
 * @returns JSX.Element
 */
function App() {
  return (
    <>
      <ToastContainer />
      <Router>
        <AppWrapper />
      </Router>
    </>
  )
}

export default App
 