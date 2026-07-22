import asyncio
from api.routes import analyze_endpoint, validate_endpoint
from models.schemas import ValidationRequest, Candle

data = {
    "H1": {"candles": [{"open": 1, "high": 2, "low": 0, "close": 1.5, "timestamp": str(i)} for i in range(100)]},
    "M15": {"candles": [{"open": 1, "high": 2, "low": 0, "close": 1.5, "timestamp": str(i)} for i in range(100)]},
    "M5": {"candles": [{"open": 1, "high": 2, "low": 0, "close": 1.5, "timestamp": str(i)} for i in range(100)]},
    "M1": {"candles": [{"open": 1, "high": 2, "low": 0, "close": 1.5, "timestamp": str(i)} for i in range(100)]}
}

async def run():
    print("Testing /v1/analyze")
    res = await analyze_endpoint(data)
    print("Analyze result:", type(res), list(res.keys()))

    print("Testing /validate")
    req = ValidationRequest(
        symbol="XAUUSD",
        timeframe="M15",
        direction="LONG",
        entry_price=1.5,
        sl_price=1.0,
        tp_price=2.5,
        candles=[Candle(open=1, high=2, low=0, close=1.5, timestamp=str(i)) for i in range(100)],
        strategy_id="strategy-4-news"
    )
    res2 = await validate_endpoint(req)
    print("Validate result:", res2.decision, res2.quant_score)

asyncio.run(run())
