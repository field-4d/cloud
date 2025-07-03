import os
from typing import Dict, Any

class BatchValidationConfig:
    """Configuration for batch size validation."""
    
    # Simple batch size limit
    MAX_BATCH_SIZE = 15000  # Maximum allowed batch size
    
    # Recommended batch sizes based on dataset size
    RECOMMENDED_BATCH_SIZES = {
        50000: 10000,    # ≤ 50K points → recommend 10K batch
        200000: 8000,    # ≤ 200K points → recommend 8K batch
        1000000: 5000,   # ≤ 1M points → recommend 5K batch
        float('inf'): 3000  # > 1M points → recommend 3K batch
    }
    
    # Error message template
    BATCH_SIZE_ERROR_TEMPLATE = """
Batch size validation failed:
- Dataset size: {dataset_size:,} points
- Maximum allowed: {max_allowed:,} points

Recommended batch size for your dataset: {recommended_batch_size:,} points

Please split your data into batches of maximum {recommended_batch_size:,} points.
"""
    
    @classmethod
    def get_recommended_batch_size(cls, dataset_size: int) -> int:
        """
        Get recommended batch size based on dataset size.
        
        Args:
            dataset_size: Total size of the dataset
            
        Returns:
            Recommended batch size
        """
        for threshold, recommended_size in cls.RECOMMENDED_BATCH_SIZES.items():
            if dataset_size <= threshold:
                return recommended_size
        return cls.RECOMMENDED_BATCH_SIZES[float('inf')]
    
    @classmethod
    def validate_batch_size(cls, data_size: int) -> Dict[str, Any]:
        """
        Validate batch size - reject if larger than 15K points.
        
        Args:
            data_size: Number of data points in the batch
            
        Returns:
            Dict with validation result and error message if applicable
        """
        if data_size > cls.MAX_BATCH_SIZE:
            # Get recommended batch size based on the current batch size
            # (assuming this batch represents the total dataset size)
            recommended_batch_size = cls.get_recommended_batch_size(data_size)
            
            error_message = cls.BATCH_SIZE_ERROR_TEMPLATE.format(
                dataset_size=data_size,
                max_allowed=cls.MAX_BATCH_SIZE,
                recommended_batch_size=recommended_batch_size
            )
            return {
                'valid': False,
                'error_message': error_message,
                'max_allowed': cls.MAX_BATCH_SIZE,
                'recommended_batch_size': recommended_batch_size
            }
        
        return {
            'valid': True,
            'max_allowed': cls.MAX_BATCH_SIZE
        }
    
    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary for logging/debugging."""
        return {
            'max_batch_size': cls.MAX_BATCH_SIZE,
            'recommended_batch_sizes': cls.RECOMMENDED_BATCH_SIZES,
            'description': 'Simple batch size validation with 15K limit and recommendations'
        }

class AppConfig:
    """General application configuration."""
    
    # API settings
    API_TITLE = "Field4D StatDeck"
    API_VERSION = "1.0.0"
    
    # Logging
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    
    # Performance
    MAX_REQUEST_SIZE = int(os.getenv("MAX_REQUEST_SIZE", "1000000"))  # 1MB
    
    @classmethod
    def to_dict(cls) -> Dict[str, Any]:
        """Convert config to dictionary for logging/debugging."""
        return {
            'api_title': cls.API_TITLE,
            'api_version': cls.API_VERSION,
            'log_level': cls.LOG_LEVEL,
            'max_request_size': cls.MAX_REQUEST_SIZE
        } 