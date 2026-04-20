/*
 * Auth.tsx
 * Authentication page for login and registration.
 * Handles form state, validation, and login logic.
 */

import React, { useState, useEffect } from 'react';
import { authenticateUser } from '../utils/authUtils';
import { useNavigate } from 'react-router-dom';
import { logger } from '../config/logger';

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

interface LoginAttempt {
  timestamp: number;
  email: string;
}

// Configuration constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const ATTEMPT_WINDOW = 60 * 60 * 1000; // 1 hour window to count attempts

/**
 * Auth
 * Renders the authentication form (login/register).
 * Handles validation, error display, and login logic.
 * @returns JSX.Element
 */
export default function Auth() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [authError, setAuthError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);

  /**
   * Load login attempts and lock state from localStorage on component mount
   */
  useEffect(() => {
    const savedAttempts = localStorage.getItem('loginAttempts');
    const savedLockState = localStorage.getItem('lockState');
    
    if (savedAttempts) {
      try {
        const attempts: LoginAttempt[] = JSON.parse(savedAttempts);
        setLoginAttempts(attempts);
      } catch (error) {
        logger.error('Failed to parse saved login attempts:', error);
        localStorage.removeItem('loginAttempts');
      }
    }
    
    if (savedLockState) {
      try {
        const lockState = JSON.parse(savedLockState);
        const now = Date.now();
        
        // Check if lock is still valid
        if (lockState.lockEndTime && lockState.lockEndTime > now) {
          setIsLocked(true);
          setLockTimeRemaining(lockState.lockEndTime - now);
          logger.info('Lock state restored from localStorage', { 
            lockEndTime: lockState.lockEndTime, 
            remaining: lockState.lockEndTime - now 
          });
        } else {
          // Lock expired, clear it
          localStorage.removeItem('lockState');
          logger.info('Expired lock state cleared from localStorage');
        }
      } catch (error) {
        logger.error('Failed to parse saved lock state:', error);
        localStorage.removeItem('lockState');
      }
    }
    
    // Debug log for current state
    logger.info('Auth component initialized', { 
      savedAttempts: savedAttempts ? JSON.parse(savedAttempts).length : 0,
      savedLockState: !!savedLockState,
      isLocked: false // Will be set by the lock check effect
    });
  }, []);

  /**
   * Check if account should be locked and manage lock state
   */
  useEffect(() => {
    // Skip if loginAttempts is still empty (initial load)
    if (loginAttempts.length === 0) {
      return;
    }

    const checkLockStatus = () => {
      const now = Date.now();
      const recentAttempts = loginAttempts.filter(
        attempt => now - attempt.timestamp < ATTEMPT_WINDOW
      );

      if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
        const oldestAttempt = Math.min(...recentAttempts.map(a => a.timestamp));
        const lockEndTime = oldestAttempt + LOCK_DURATION;
        const remaining = lockEndTime - now;

        if (remaining > 0) {
          setIsLocked(true);
          setLockTimeRemaining(remaining);
          // Save lock state to localStorage
          localStorage.setItem('lockState', JSON.stringify({
            lockEndTime: lockEndTime,
            lockedAt: now
          }));
          logger.info('Account locked due to too many attempts', { 
            attempts: recentAttempts.length, 
            lockEndTime, 
            remaining 
          });
        } else {
          // Lock expired, clear old attempts and lock state
          const validAttempts = loginAttempts.filter(
            attempt => now - attempt.timestamp < ATTEMPT_WINDOW
          );
          setLoginAttempts(validAttempts);
          setIsLocked(false);
          setLockTimeRemaining(0);
          localStorage.setItem('loginAttempts', JSON.stringify(validAttempts));
          localStorage.removeItem('lockState');
          logger.info('Lock expired, account unlocked');
        }
      } else {
        setIsLocked(false);
        setLockTimeRemaining(0);
        localStorage.removeItem('lockState');
      }
    };

    checkLockStatus();
  }, [loginAttempts]);

  /**
   * Save login attempts to localStorage whenever they change
   */
  useEffect(() => {
    localStorage.setItem('loginAttempts', JSON.stringify(loginAttempts));
  }, [loginAttempts]);

  /**
   * Handle lock countdown timer independently
   */
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    const interval = setInterval(() => {
      setLockTimeRemaining(prev => {
        const newRemaining = prev - 1000;
        if (newRemaining <= 0) {
          // Lock expired, check if we should unlock
          const now = Date.now();
          const recentAttempts = loginAttempts.filter(
            attempt => now - attempt.timestamp < ATTEMPT_WINDOW
          );
          
          if (recentAttempts.length < MAX_LOGIN_ATTEMPTS) {
            setIsLocked(false);
            localStorage.removeItem('lockState');
            logger.info('Lock expired, account unlocked');
          }
          return 0;
        }
        return newRemaining;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked, loginAttempts]);

  /**
   * validateEmail
   * Checks if an email is valid.
   * @param email - string
   * @returns boolean
   */
  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  /**
   * validatePassword
   * Checks if a password meets requirements.
   * @param password - string
   * @returns boolean
   */
  const validatePassword = (password: string) => {
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    return password.length >= 8 && hasLetter && hasNumber;
  };

  /**
   * handleSubmit
   * Handles form submission for login/register.
   * Validates input, calls backend, stores session.
   * @param e - React.FormEvent
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setLoading(true);
    const newErrors: FormErrors = {};

    // Check if login is locked
    if (isLogin && isLocked) {
      const minutes = Math.ceil(lockTimeRemaining / 60000);
      const seconds = Math.ceil((lockTimeRemaining % 60000) / 1000);
      setAuthError(`Too many login attempts. Please try again in ${minutes}:${seconds.toString().padStart(2, '0')}.`);
      logger.info('Login blocked due to lock', { isLocked, lockTimeRemaining, minutes, seconds });
      setLoading(false);
      return;
    }

    if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!validatePassword(formData.password)) {
      newErrors.password = 'Password must be at least 8 characters long and contain at least one letter and one number';
    }

    if (!isLogin) {
      if (!formData.name.trim()) {
        newErrors.name = 'Name is required';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);

    // If there are validation errors, stop here and reset loading state
    if (Object.keys(newErrors).length > 0) {
      setLoading(false);
      return;
    }

    try {
      logger.info('Attempting authentication for:', formData.email);
      const response = await authenticateUser({
        email: formData.email,
        password: formData.password
      });

      if (response.success) {
        logger.info('Authentication successful for:', formData.email);
        // Clear login attempts and lock state on successful login
        setLoginAttempts([]);
        localStorage.removeItem('loginAttempts');
        localStorage.removeItem('lockState');
        
        localStorage.setItem('userData', JSON.stringify({
          ...response.userData,
          timestamp: Date.now()
        }));
        navigate('/dashboard');
      } else {
        logger.warn('Authentication failed for:', formData.email, response.message);
        setAuthError(response.message);
        
        // Add failed attempt for login only
        if (isLogin) {
          const newAttempt: LoginAttempt = {
            timestamp: Date.now(),
            email: formData.email
          };
          setLoginAttempts(prev => [...prev, newAttempt]);
          
          // Check if this should trigger a lock
          const recentAttempts = [...loginAttempts, newAttempt].filter(
            attempt => Date.now() - attempt.timestamp < ATTEMPT_WINDOW
          );
          
          if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
            setAuthError(`Too many failed login attempts. Account locked for ${Math.ceil(LOCK_DURATION / 60000)} minutes.`);
          } else {
            const remainingAttempts = MAX_LOGIN_ATTEMPTS - recentAttempts.length;
            setAuthError(`${response.message} (${remainingAttempts} attempts remaining)`);
          }
        }
      }
    } catch (err) {
      logger.error('Authentication error:', err);
      setAuthError('An error occurred during authentication');
      
      // Add failed attempt for login only
      if (isLogin) {
        const newAttempt: LoginAttempt = {
          timestamp: Date.now(),
          email: formData.email
        };
        setLoginAttempts(prev => [...prev, newAttempt]);
        
        // Check if this should trigger a lock
        const recentAttempts = [...loginAttempts, newAttempt].filter(
          attempt => Date.now() - attempt.timestamp < ATTEMPT_WINDOW
        );
        
        if (recentAttempts.length >= MAX_LOGIN_ATTEMPTS) {
          setAuthError(`Too many failed login attempts. Account locked for ${Math.ceil(LOCK_DURATION / 60000)} minutes.`);
        } else {
          const remainingAttempts = MAX_LOGIN_ATTEMPTS - recentAttempts.length;
          setAuthError(`An error occurred during authentication (${remainingAttempts} attempts remaining)`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleChange
   * Updates form state on input change.
   * @param e - React.ChangeEvent<HTMLInputElement>
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative"
    >
      <div className="absolute inset-0 bg-black bg-opacity-40 z-0" />
      <div className="z-10 relative p-8 rounded-lg shadow-lg bg-white bg-opacity-80 w-full max-w-md">
        <div className="flex flex-col items-center">
          <img src="/logo.png" alt="Field4F Logo" className="w-24 h-24 mb-4" />
          <h2 className="mt-2 text-center text-3xl font-extrabold text-[#8ac6bb]">
            {isLogin ? 'Sign in to Field4D' : 'Create your Field4F account'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {isLogin && isLocked && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Account Temporarily Locked
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>Too many failed login attempts. Please wait before trying again.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {authError && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{authError}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            {!isLogin && (
              <div className="mb-4">
                <label htmlFor="name" className="sr-only">Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    className="input-field pl-10"
                    placeholder="Full Name"
                    value={formData.name}
                    onChange={handleChange}
                  />
                </div>
                {errors.name && <p className="error-message">{errors.name}</p>}
              </div>
            )}
            
            <div className="mb-4">
              <label htmlFor="email" className="sr-only">Email address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </div>
                                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    disabled={isLogin && isLocked}
                    className={`input-field pl-10 ${isLogin && isLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Email address"
                    value={formData.email}
                    onChange={handleChange}
                  />
              </div>
              {errors.email && <p className="error-message">{errors.email}</p>}
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                </div>
                                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    disabled={isLogin && isLocked}
                    className={`input-field pl-10 ${isLogin && isLocked ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Password"
                    value={formData.password}
                    onChange={handleChange}
                  />
                <button
                  type="button"
                  disabled={isLogin && isLocked}
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${isLogin && isLocked ? 'cursor-not-allowed' : ''}`}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <p className="error-message">{errors.password}</p>}
            </div>

            {!isLogin && (
              <div className="mb-4">
                <label htmlFor="confirmPassword" className="sr-only">Confirm Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    required
                    className="input-field pl-10"
                    placeholder="Confirm Password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                </div>
                {errors.confirmPassword && <p className="error-message">{errors.confirmPassword}</p>}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                className="h-4 w-4 text-[#8ac6bb] focus:ring-[#8ac6bb] border-gray-300 rounded"
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-gray-700">
                I agree to the{' '}
                <a href="#" className="text-[#8ac6bb] hover:text-[#7ab6ab]">
                  Terms and Conditions
                </a>
              </label>
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={loading || (isLogin && isLocked)}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed ${
                isLogin && isLocked
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'text-white bg-[#8ac6bb] hover:bg-[#7ab6ab] focus:ring-[#8ac6bb] disabled:opacity-50'
              }`}
            >
              {loading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : isLogin && isLocked ? (
                <svg className="h-5 w-5 text-gray-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : null}
              {isLogin && isLocked 
                ? `Account Locked (${Math.ceil(lockTimeRemaining / 60000)}:${Math.ceil((lockTimeRemaining % 60000) / 1000).toString().padStart(2, '0')})`
                : isLogin ? 'Sign in' 
                : 'Create Account'
              }
            </button>
          </div>

          <div className="flex flex-col items-center space-y-4">
            {isLogin && (
              <button
                type="button"
                onClick={() => {
                  logger.debug('Forgot password clicked');
                }}
                className="text-sm text-[#8ac6bb] hover:text-[#7ab6ab] font-medium hidden"
              >
                Forgot Password?
              </button>
            )}
          </div>
        </form>

        {/* Placeholder for future Google OAuth integration */}
        <div className="hidden">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
            </div>
          </div>
          <div className="mt-6">
            <button
              type="button"
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
              disabled
            >
              {/* TODO: Implement Google OAuth */}
              <span>Google (Coming Soon)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 