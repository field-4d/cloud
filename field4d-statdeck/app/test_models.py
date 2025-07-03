from pydantic import BaseModel
from typing import List, Literal

class DataPoint(BaseModel):
    timestamp: str
    label: str
    value: float

# Base model for common fields
class BaseTestRequest(BaseModel):
    parameter: str
    data: List[DataPoint]

# Specific test models
class TukeyTestRequest(BaseTestRequest):
    alpha: float = 0.05

# Legacy model for backward compatibility
class TestRequest(BaseModel):
    test_type: Literal["tukey"]
    parameter: str
    data: List[DataPoint] 