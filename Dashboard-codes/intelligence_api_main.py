import asyncio
import json
from fastapi import FastAPI, Depends, Request
from fastapi.responses import StreamingResponse
from typing import Dict, Any

app = FastAPI(title="Store Intelligence API")

# --- Mock Data Fetchers for Demo Purposes ---
# In a real app, these would query SQLite (WAL)
def get_store_metrics(store_id: str, db=None) -> Dict[str, Any]:
    return {
        "unique_visitors": 47,
        "conversion_rate": 23.4,
        "queue_depth": 3,
        "abandonment_rate": 12.1,
        "data_confidence": "HIGH"
    }

def get_store_anomalies(store_id: str, db=None) -> list:
    return [
        {
            "severity": "CRITICAL",
            "type": "BILLING_QUEUE_SPIKE",
            "message": "Deploy additional cashier immediately",
            "timestamp": 1717520000000
        }
    ]

def get_store_funnel(store_id: str, db=None) -> list:
    return [
        {"stage": "ENTRY", "count": 47, "dropoff_pct": 0.0},
        {"stage": "ZONE_VISIT", "count": 38, "dropoff_pct": 19.1},
        {"stage": "BILLING", "count": 21, "dropoff_pct": 44.7},
        {"stage": "PURCHASE", "count": 11, "dropoff_pct": 47.6}
    ]

def get_store_heatmap(store_id: str, db=None) -> list:
    return [
        {"zone_id": "Skincare", "avg_dwell_seconds": 492, "normalised_score": 82, "visit_frequency": 31},
        {"zone_id": "Haircare", "avg_dwell_seconds": 246, "normalised_score": 41, "visit_frequency": 18},
        {"zone_id": "Fragrance", "avg_dwell_seconds": 72, "normalised_score": 12, "visit_frequency": 5},
        {"zone_id": "Billing", "avg_dwell_seconds": 726, "normalised_score": 95, "visit_frequency": 21}
    ]

# --- SSE Endpoint ---
@app.get("/stores/{store_id}/stream")
async def event_stream(store_id: str, request: Request, db=None):
    """
    Server-Sent Events (SSE) endpoint for real-time dashboard updates.
    """
    async def event_generator():
        try:
            while True:
                # If client closes connection, request.is_disconnected() will be True
                if await request.is_disconnected():
                    break
                
                # Fetch fresh data
                metrics = get_store_metrics(store_id, db)
                anomalies = get_store_anomalies(store_id, db)
                funnel = get_store_funnel(store_id, db)
                heatmap = get_store_heatmap(store_id, db)
                
                # Build payload
                payload = {
                    "metrics": metrics,
                    "anomalies": anomalies,
                    "funnel": funnel,
                    "heatmap": heatmap,
                    "timestamp": asyncio.get_event_loop().time()
                }
                
                # Yield SSE formatted string
                yield f"data: {json.dumps(payload)}\n\n"
                
                await asyncio.sleep(2)
        except asyncio.CancelledError:
            # Handle client disconnect gracefully
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )

# Mock endpoints for the terminal dashboard fallback
@app.get("/stores/{store_id}/metrics")
async def metrics_ep(store_id: str): return get_store_metrics(store_id)

@app.get("/stores/{store_id}/funnel")
async def funnel_ep(store_id: str): return get_store_funnel(store_id)

@app.get("/stores/{store_id}/heatmap")
async def heatmap_ep(store_id: str): return get_store_heatmap(store_id)

@app.get("/stores/{store_id}/anomalies")
async def anomalies_ep(store_id: str): return get_store_anomalies(store_id)