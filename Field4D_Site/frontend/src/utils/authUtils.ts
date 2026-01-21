/*
 * authUtils.ts
 * Utility functions for user authentication (frontend).
 */

import { API_ENDPOINTS } from '../config';
import { logger } from '../config/logger';

interface UserCredentials {
  email: string;
  password: string;
}

interface AuthResponse {
  success: boolean;
  message: string;
  userData?: {
    email: string;
    name: string;
    role: string;
  };
}

/**
 * authenticateUser
 * Authenticates a user by checking their credentials against the backend API.
 * @param credentials - { email: string, password: string }
 * @returns Promise<AuthResponse> - authentication result
 * Side effect: network request to backend
 */
export async function authenticateUser(credentials: UserCredentials): Promise<AuthResponse> {
  try {
    logger.info('Starting authentication process...');
    logger.info('User credentials:', { email: credentials.email, password: '***' });

    const response = await fetch(API_ENDPOINTS.AUTH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();
    logger.info('Auth response:', data);

    // Store JWT token in localStorage if present
    if (data.jwtToken) {
      localStorage.setItem('jwtToken', data.jwtToken);
      // Also add jwtToken to userData if present
      if (data.userData) {
        data.userData.jwtToken = data.jwtToken;
        localStorage.setItem('userData', JSON.stringify(data.userData));
      }
    }

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Authentication failed'
      };
    }

    return data;

  } catch (error) {
    logger.error('Authentication error:', error);
    return {
      success: false,
      message: 'An error occurred during authentication. Please try again later.'
    };
  }
} 