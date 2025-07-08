import { useState } from 'react';
import { loginUser } from '../services/AuthService';
import '../css/Login.css';



function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await loginUser(username, password);

      if (result && result.success) {
        localStorage.setItem('authenticated', 'true');
        onLogin(); // Trigger success flow
      } else {
        // Provide specific error messages based on the response
        let errorMessage = 'Invalid username or password.';
        
        if (result && result.message) {
          if (result.message.includes('Access denied')) {
            errorMessage = 'Access denied. You do not have permission to access this device. Please contact your administrator.';
          } else if (result.message.includes('temporarily unavailable')) {
            errorMessage = 'Authentication service is temporarily unavailable. Please try again later or contact your administrator.';
          } else {
            errorMessage = result.message;
          }
        }
        
        alert(errorMessage + '\n\nIf this problem persists, please contact your administrator.');
      }
    } catch (error) {
      console.error(error);
      alert('Login failed: Unable to connect to the server.\n\nIf this problem persists, please contact your administrator.');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src="/logo.png" alt="Field4D Logo" className="login-logo" />
          <h2>Welcome to Field4D</h2>
          <p>Please sign in to continue</p>
          <p>Use your Field4D ({' '}
            <a 
              href="https://www.field4d.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="field4d-link"
            >
              www.field4d.com
            </a>
            ) login here</p>
        </div>
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="form-input"
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="password-input-container">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-input password-input"
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="password-toggle-btn"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "👁️" : "👁️‍🗨️"}
              </button>
            </div>
          </div>
          
          <button 
            type="submit" 
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>
        
        <div className="login-footer">
          <p>Need help? Contact your administrator</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
