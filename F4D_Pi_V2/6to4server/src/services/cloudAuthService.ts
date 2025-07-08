import axios from 'axios';

interface CloudAuthRequest {
  email: string;
  hashed_password: string;
}

interface CloudAuthResponse {
  success: boolean;
  message: string;
  token?: string;
}

export async function validateWithCloudFunction(
  email: string, 
  hashedPassword: string
): Promise<CloudAuthResponse> {
  try {
    const cloudFunctionUrl = process.env.CLOUD_FUNCTION_URL;
    const timeout = parseInt(process.env.CLOUD_FUNCTION_TIMEOUT || '10000');
    
    if (!cloudFunctionUrl) {
      console.error('[CLOUD_AUTH] CLOUD_FUNCTION_URL not configured');
      return {
        success: false,
        message: 'Cloud authentication service not configured'
      };
    }

    console.log('[CLOUD_AUTH] Attempting cloud function validation for:', email);
    
    const response = await axios.post(
      cloudFunctionUrl,
      {
        email,
        hashed_password: hashedPassword
      },
      {
        timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('[CLOUD_AUTH] Cloud function response:', response.data);
    return response.data;
    
  } catch (error: any) {
    console.error('[CLOUD_AUTH] Cloud function authentication error:', error.message);
    
    // Handle specific error types
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        message: 'Authentication service timeout. Please try again.'
      };
    }
    
    if (error.response) {
      // Server responded with error status
      console.error('[CLOUD_AUTH] Server error response:', error.response.data);
      return {
        success: false,
        message: error.response.data?.message || 'Authentication service error'
      };
    }
    
    if (error.request) {
      // Network error
      console.error('[CLOUD_AUTH] Network error:', error.message);
      return {
        success: false,
        message: 'Authentication service temporarily unavailable'
      };
    }
    
    return {
      success: false,
      message: 'Authentication service error'
    };
  }
} 