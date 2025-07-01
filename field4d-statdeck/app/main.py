from fastapi import FastAPI, HTTPException
from app.test_models import TestRequest
from app import stat_engine
import pandas as pd

app = FastAPI(title="Field4D StatDeck")

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze(payload: TestRequest):
    df = pd.DataFrame([d.dict() for d in payload.data])
    try:
        if payload.test_type == "tukey":
            results = stat_engine.run_anova_tukey(df)
        elif payload.test_type == "t_test":
            results = stat_engine.run_t_test(df)
        elif payload.test_type == "dunnett":
            results = stat_engine.run_dunnett(df)
        else:
            results = []
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Statistical test failed: {str(e)}")

    return {
        "parameter": payload.parameter,
        "test_type": payload.test_type,
        "results": results
    } 