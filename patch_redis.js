const fs = require('fs');

const pyAnalyzer = `from typing import Dict, Any, List
import math
import os
import json
import hashlib
from core_engine import CoreEngine

# Redis integration
import redis

class TechnicalAnalyzer:
    def __init__(self):
        self.core = CoreEngine()
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
            self.redis_client.ping()
        except Exception as e:
            print(f"Redis not available, falling back to in-memory dict: {e}")
            self.redis_client = None
            
        from collections import OrderedDict
        self._cache = OrderedDict()
        self._max_cache_size = 512

    def _generate_payload_hash(self, data: Dict[str, Any]) -> str:
        keys = []
        for tf in ["H1", "M15", "M5", "M1"]:
            candles = data.get(tf, {}).get("candles", [])
            if candles:
                last_c = candles[-1]
                ts = last_c.get("timestamp", getattr(last_c, "timestamp", ""))
                c = last_c.get("close", getattr(last_c, "close", 0))
                keys.append(f"{tf}_{ts}_{c}")
            else:
                keys.append(f"{tf}_empty")
        return hashlib.md5("_".join(keys).encode()).hexdigest()

    def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        payload_hash = self._generate_payload_hash(data)
        
        # Try Redis Cache First
        if self.redis_client:
            try:
                cached = self.redis_client.get(f"insai:analysis:{payload_hash}")
                if cached:
                    return json.loads(cached)
            except Exception:
                pass
        
        # Fallback to local memory cache
        if payload_hash in self._cache:
            self._cache.move_to_end(payload_hash)
            return self._cache[payload_hash]
            
        result = {}
        
        # 1. H1 Trend (Bias)
        h1_c = data.get("H1", {}).get("candles", [])
        if len(h1_c) >= 5:
            c_first = float(h1_c[-5].get("close", getattr(h1_c[-5], "close", 0)))
            c_last = float(h1_c[-1].get("close", getattr(h1_c[-1], "close", 0)))
            result["trend_h1"] = "bullish" if c_last > c_first else ("bearish" if c_last < c_first else "neutral")
        else:
            result["trend_h1"] = "neutral"
            
        # 2. M15 Structure (Context)
        m15_c = data.get("M15", {}).get("candles", [])
        result["atr"] = data.get("M15", {}).get("atr", 4.0)
        
        if len(m15_c) >= 30:
            try:
                analysis_m15 = self.core.analyze(m15_c, symbol="XAUUSD", timeframe="M15")
                result["bos_bull"] = analysis_m15.get("bos_bull", False)
                result["bos_bear"] = analysis_m15.get("bos_bear", False)
                result["choch_bull"] = analysis_m15.get("choch_bull", False)
                result["choch_bear"] = analysis_m15.get("choch_bear", False)
                result["ob_fvg_bull"] = analysis_m15.get("fvg_bull_active", False) or analysis_m15.get("ob_bull", False)
                result["ob_fvg_bear"] = analysis_m15.get("fvg_bear_active", False) or analysis_m15.get("ob_bear", False)
                result["sd_zone_active"] = analysis_m15.get("snd_bull", False) or analysis_m15.get("snd_bear", False)
                if not result.get("atr") or result["atr"] == 4.0:  
                    result["atr"] = analysis_m15.get("atr", 4.0)
            except Exception:
                pass
        elif len(m15_c) >= 10:
            closes = [float(c.get("close", getattr(c, "close", 0))) for c in m15_c[-10:]]
            highs = [float(c.get("high", getattr(c, "high", 0))) for c in m15_c[-10:]]
            lows = [float(c.get("low", getattr(c, "low", 0))) for c in m15_c[-10:]]
            c_last = closes[-1]
            result["bos_bull"] = c_last > max(highs[:-1])
            result["bos_bear"] = c_last < min(lows[:-1])
            result["choch_bull"] = result["bos_bull"] and closes[-2] < lows[-3]
            result["choch_bear"] = result["bos_bear"] and closes[-2] > highs[-3]
            result["sd_zone_active"] = True
            result["ob_fvg_bull"] = any(closes[i] > highs[i-1] for i in range(1, len(closes)))
            result["ob_fvg_bear"] = any(closes[i] < lows[i-1] for i in range(1, len(closes)))
        else:
            result["bos_bull"] = result["bos_bear"] = False
            result["choch_bull"] = result["choch_bear"] = False
            result["sd_zone_active"] = False
            result["ob_fvg_bull"] = result["ob_fvg_bear"] = False

        # 3. M5 Liquidity Sweep
        m5_c = data.get("M5", {}).get("candles", [])
        if len(m5_c) >= 30:
            try:
                analysis_m5 = self.core.analyze(m5_c, symbol="XAUUSD", timeframe="M5")
                result["liq_sweep_bull"] = analysis_m5.get("liq_sweep_bull", False)
                result["liq_sweep_bear"] = analysis_m5.get("liq_sweep_bear", False)
            except Exception:
                pass
        elif len(m5_c) >= 5:
            lows = [float(c.get("low", getattr(c, "low", 0))) for c in m5_c[-5:]]
            highs = [float(c.get("high", getattr(c, "high", 0))) for c in m5_c[-5:]]
            closes = [float(c.get("close", getattr(c, "close", 0))) for c in m5_c[-5:]]
            result["liq_sweep_bull"] = lows[-1] < min(lows[:-1]) and closes[-1] > lows[-1] + (highs[-1]-lows[-1])*0.3
            result["liq_sweep_bear"] = highs[-1] > max(highs[:-1]) and closes[-1] < highs[-1] - (highs[-1]-lows[-1])*0.3
        else:
            result["liq_sweep_bull"] = result["liq_sweep_bear"] = False

        # 4. M1 Patterns
        m1_c = data.get("M1", {}).get("candles", [])
        if len(m1_c) >= 30:
            try:
                analysis_m1 = self.core.analyze(m1_c, symbol="XAUUSD", timeframe="M1")
                result["engulfing_bull"] = analysis_m1.get("bullish_engulfing", False)
                result["engulfing_bear"] = analysis_m1.get("bearish_engulfing", False)
                result["morning_star"] = analysis_m1.get("morning_star", False)
                result["evening_star"] = analysis_m1.get("evening_star", False)
                result["double_bottom"] = analysis_m1.get("double_bottom", False)
                result["double_top"] = analysis_m1.get("double_top", False)
                result["current_price"] = float(m1_c[-1].get("close", getattr(m1_c[-1], "close", 0)))
            except Exception:
                pass
        elif len(m1_c) >= 3:
            c0_o, c0_h, c0_l, c0_c = m1_c[-3].get("open"), m1_c[-3].get("high"), m1_c[-3].get("low"), m1_c[-3].get("close")
            c1_o, c1_h, c1_l, c1_c = m1_c[-2].get("open"), m1_c[-2].get("high"), m1_c[-2].get("low"), m1_c[-2].get("close")
            c2_o, c2_h, c2_l, c2_c = m1_c[-1].get("open"), m1_c[-1].get("high"), m1_c[-1].get("low"), m1_c[-1].get("close")
            b1 = abs(c1_c - c1_o)
            b2 = abs(c2_c - c2_o)
            result["engulfing_bull"] = (c1_c < c1_o) and (c2_c > c2_o) and (b2 > b1) and (c2_c > c1_o) and (c2_o < c1_c)
            result["engulfing_bear"] = (c1_c > c1_o) and (c2_c < c2_o) and (b2 > b1) and (c2_c < c1_o) and (c2_o > c1_c)
            result["current_price"] = c2_c
        else:
            result["engulfing_bull"] = result["engulfing_bear"] = False
            result["morning_star"] = result["evening_star"] = False
            result["double_bottom"] = result["double_top"] = False
            result["current_price"] = 0

        # Spread/News placeholder logic
        result["spread_acceptable"] = True
        result["news_high_impact_active"] = False
        
        # Save to Redis
        if self.redis_client:
            try:
                self.redis_client.setex(f"insai:analysis:{payload_hash}", 3600, json.dumps(result))
            except Exception:
                pass
                
        # Save to Local memory cache
        self._cache[payload_hash] = result
        if len(self._cache) > self._max_cache_size:
            self._cache.popitem(last=False)
            
        return result
`;

fs.writeFileSync('python-engine/analyzer.py', pyAnalyzer);
