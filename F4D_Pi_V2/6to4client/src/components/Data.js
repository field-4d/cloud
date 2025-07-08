import React, { useState, useEffect } from 'react';
import '../css/Data.css';
import StreamlitEmbed from './StreamlitEmbed';

// const protocolPrefix = window.location.protocol === 'https:' ? 'wss' : 'ws';
// const webSocket = new WebSocket(`${protocolPrefix}://${window.location.hostname}:8080`);
// let isConnected = false;

// // Check if WebSocket connection is established
// webSocket.onopen = () => {
//   isConnected = true;
//   console.log('WebSocket is ready for action!');
// };

const Data = ({ title }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="data-body">
      <h1 className="data-title">{title}</h1>
      {!isOnline ? (
        <div className="error-message">You need to be online to browse data</div>
      ) : (
        <nav className="data-nav">
          <StreamlitEmbed />
        </nav>
      )}
      {/* Text block with instructions from influxdb pull using python */}
    </div>
  );
};

export default Data;
