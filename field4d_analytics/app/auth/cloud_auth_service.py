import os
import hashlib
import base64
import requests
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

class CloudAuthService:
    """Cloud Function-based authentication service."""
    
    def __init__(self):
        self.cloud_function_url = os.getenv('CLOUD_FUNCTION_URL')
        self.jwt_secret = os.getenv('JWT_SECRET_KEY')
        
        print(f"🔧 CloudAuthService Debug:")
        print(f"   CLOUD_FUNCTION_URL: {self.cloud_function_url}")
        print(f"   JWT_SECRET_KEY: {self.jwt_secret[:10] if self.jwt_secret else 'None'}...")
        
        if not self.cloud_function_url:
            raise ValueError("Missing CLOUD_FUNCTION_URL environment variable")
        if not self.jwt_secret:
            raise ValueError("Missing JWT_SECRET_KEY environment variable")
    
    def hash_password(self, password: str) -> str:
        """
        Hash password using SHA256 + BASE64 to match BigQuery implementation.
        
        Args:
            password: Plain text password
            
        Returns:
            Hashed password string
        """
        # Remove spaces from password
        password = password.replace(' ', '')
        
        # Hash using SHA256
        sha256_hash = hashlib.sha256(password.encode('utf-8')).digest()
        
        # Convert to BASE64
        base64_hash = base64.b64encode(sha256_hash).decode('utf-8')
        
        return base64_hash
    
    def login_and_get_token(self, email: str, password: str) -> Optional[str]:
        """
        Authenticate user via Cloud Function and get JWT token.
        
        Args:
            email: User email
            password: Plain text password
            
        Returns:
            JWT token if authentication successful, None otherwise
        """
        try:
            # Clean email and hash password
            email = email.replace(' ', '')
            hashed_password = self.hash_password(password)
            
            # Prepare request payload
            payload = {
                "email": email,
                "hashed_password": hashed_password
            }
            
            # Call Cloud Function
            response = requests.post(
                self.cloud_function_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return data.get("token")
                else:
                    print(f"Authentication failed: {data.get('error', 'Unknown error')}")
                    return None
            else:
                print(f"Cloud Function request failed with status {response.status_code}")
                return None
                
        except Exception as e:
            print(f"Error calling Cloud Function: {str(e)}")
            return None
    
    def validate_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate JWT token and extract user information.
        
        Args:
            token: JWT token string
            
        Returns:
            User data if token is valid, None otherwise
        """
        try:
            from jose import JWTError, jwt
            
            print(f"🔧 Token validation debug:")
            print(f"   Token: {token[:50]}...")
            print(f"   JWT Secret: {self.jwt_secret[:10] if self.jwt_secret else 'None'}...")
            
            # Decode and verify token
            payload = jwt.decode(token, self.jwt_secret, algorithms=["HS256"])
            email = payload.get("email")
            
            print(f"   Decoded payload: {payload}")
            print(f"   Email from payload: {email}")
            
            if email is None:
                print(f"   ❌ Email is None - validation failed")
                return None
            
            print(f"   ✅ Token validation successful")
            return {
                "email": email,
                "token_exp": payload.get("exp")
            }
            
        except JWTError as e:
            print(f"❌ JWT Error: {str(e)}")
            return None
        except Exception as e:
            print(f"❌ Error validating token: {str(e)}")
            return None

# Global instance
cloud_auth = CloudAuthService() 