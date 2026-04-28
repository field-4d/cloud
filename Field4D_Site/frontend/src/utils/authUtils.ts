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
  jwtToken?: string;
  access_token?: string;
  token_type?: string;
  email?: string;
  role?: 'read' | 'admin' | 'system_admin' | null;
  permissions?: Array<{
    owner: string;
    mac_address: string;
    experiment: string;
    role: string;
  }>;
  userData?: {
    email: string;
    name?: string;
    role?: string | null;
    jwtToken?: string;
    permissions?: Array<{
      owner: string;
      mac_address: string;
      experiment: string;
      role: string;
    }>;
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
    const token = data.jwtToken || data.access_token;
    if (token) {
      localStorage.setItem('jwtToken', token);
      // Also add jwtToken to userData if present
      if (data.userData) {
        data.userData.jwtToken = token;
        if (data.role && !data.userData.role) {
          data.userData.role = data.role;
        }
        if (Array.isArray(data.permissions)) {
          data.userData.permissions = data.permissions;
        }
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