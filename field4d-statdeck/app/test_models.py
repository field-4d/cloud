from pydantic import BaseModel
from typing import List, Literal

class DataPoint(BaseModel):
    timestamp: str
    label: str
    value: float

class TestRequest(BaseModel):
    test_type: Literal["tukey", "t_test", "dunnett"]
    parameter: str
    data: List[DataPoint] 