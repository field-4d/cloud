import React from 'react';
import ReactDOM from 'react-dom/client';
// import App from './App';

// import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
// import Data from './components/Data';
import AppRouter from './AppRouter';

// const root = ReactDOM.createRoot(document.getElementById('root'));
// root.render(
//   // <React.StrictMode>
//     <App />
//   // </React.StrictMode>
// );

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);