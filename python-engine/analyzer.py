from typing import Dict, Any, List, Optional
import math
import os
import json
import hashlib
import numpy as np
from core_engine import CoreEngine
from deterministic_analyzer import dispatch_analysis, run_full_analysis
from models.schemas import AnalysisRequest, AnalysisResponse, Candle

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
            self.redis_client = None
            
        from collections import OrderedDict
        self._cache = OrderedDict()
        self._max_cache_size = 512

    def _generate_payload_hash(self, data: Dict[str, Any]) -> str:
        keys = []
        if "candles" in data:
            candles = data.get("candles", [])
            if candles:
                last_c = candles[-1]
                ts = last_c.get("timestamp", getattr(last_c, "timestamp", "")) if isinstance(last_c, dict) else getattr(last_c, "timestamp", "")
                c = last_c.get("close", getattr(last_c, "close", 0)) if isinstance(last_c, dict) else getattr(last_c, "close", 0)
                keys.append(f"direct_{len(candles)}_{ts}_{c}_{data.get('analysis_type', 'ALL')}")
        for tf in ["H1", "M15", "M5", "M1"]:
            candles = data.get(tf, {}).get("candles", [])
            if candles:
                last_c = candles[-1]
                ts = last_c.get("timestamp", getattr(last_c, "timestamp", "")) if isinstance(last_c, dict) else getattr(last_c, "timestamp", "")
                c = last_c.get("close", getattr(last_c, "close", 0)) if isinstance(last_c, dict) else getattr(last_c, "close", 0)
                keys.append(f"{tf}_{ts}_{c}")
            else:
                keys.append(f"{tf}_empty")
        return hashlib.md5("_".join(keys).encode()).hexdigest()

    def analyze_deterministic(self, request: AnalysisRequest) -> AnalysisResponse:
        """Strict deterministic analysis using AnalysisRequest schema."""
        return dispatch_analysis(request)

    def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Supports both legacy dict payloads and standardized AnalysisRequest payloads."""
        # If payload is a direct AnalysisRequest structure
        if "candles" in data and isinstance(data.get("candles"), list) and len(data.get("candles")) > 0:
            try:
                # Convert dict to AnalysisRequest if needed
                req_obj = AnalysisRequest(**data) if not isinstance(data, AnalysisRequest) else data
                response = dispatch_analysis(req_obj)
                # If requested as raw dict output with standard structure
                res_dict = response.model_dump()
                # Merge values at top-level for backwards compatibility
                if response.values:
                    res_dict.update(response.values)
                return res_dict
            except Exception as e:
                # Fallback to standard execution
                pass

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
        
        # 1. H1 Trend (Multi-EMA & Swing Structure Bias)
        h1_c = data.get("H1", {}).get("candles", [])
        if len(h1_c) >= 15:
            try:
                closes = np.array([float(c.get("close", getattr(c, "close", 0)) if isinstance(c, dict) else getattr(c, "close", 0)) for c in h1_c], dtype=np.float64)
                highs = np.array([float(c.get("high", getattr(c, "high", 0)) if isinstance(c, dict) else getattr(c, "high", 0)) for c in h1_c], dtype=np.float64)
                lows = np.array([float(c.get("low", getattr(c, "low", 0)) if isinstance(c, dict) else getattr(c, "low", 0)) for c in h1_c], dtype=np.float64)
                
                # Exponential Moving Averages
                def calc_ema(arr, period):
                    alpha = 2.0 / (period + 1.0)
                    ema = np.empty_like(arr)
                    ema[0] = arr[0]
                    for i in range(1, len(arr)):
                        ema[i] = alpha * arr[i] + (1.0 - alpha) * ema[i - 1]
                    return ema[-1]

                ema20 = calc_ema(closes, min(20, len(closes)))
                ema50 = calc_ema(closes, min(50, len(closes)))
                c_last = float(closes[-1])

                is_bull_ma = (c_last >= ema20 and ema20 >= ema50) or (c_last >= ema20 * 1.001)
                is_bear_ma = (c_last <= ema20 and ema20 <= ema50) or (c_last <= ema20 * 0.999)

                # Recent swing structure (Higher Highs / Lower Lows)
                if len(highs) >= 8:
                    hh = np.max(highs[-4:]) > np.max(highs[-8:-4])
                    ll = np.min(lows[-4:]) < np.min(lows[-8:-4])
                else:
                    hh, ll = False, False

                if is_bull_ma or (hh and not ll):
                    result["trend_h1"] = "bullish"
                elif is_bear_ma or (ll and not hh):
                    result["trend_h1"] = "bearish"
                else:
                    result["trend_h1"] = "neutral"
            except Exception:
                result["trend_h1"] = "neutral"
        elif len(h1_c) >= 5:
            c_first = float(h1_c[-5].get("close", getattr(h1_c[-5], "close", 0)) if isinstance(h1_c[-5], dict) else getattr(h1_c[-5], "close", 0))
            c_last = float(h1_c[-1].get("close", getattr(h1_c[-1], "close", 0)) if isinstance(h1_c[-1], dict) else getattr(h1_c[-1], "close", 0))
            result["trend_h1"] = "bullish" if c_last > c_first else ("bearish" if c_last < c_first else "neutral")
        else:
            result["trend_h1"] = "insufficient_data"
            
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
            closes = np.array([c.get("close", getattr(c, "close", 0)) if isinstance(c, dict) else getattr(c, "close", 0) for c in m15_c[-10:]], dtype=np.float64)
            highs = np.array([c.get("high", getattr(c, "high", 0)) if isinstance(c, dict) else getattr(c, "high", 0) for c in m15_c[-10:]], dtype=np.float64)
            lows = np.array([c.get("low", getattr(c, "low", 0)) if isinstance(c, dict) else getattr(c, "low", 0) for c in m15_c[-10:]], dtype=np.float64)
            c_last = float(closes[-1])
            result["bos_bull"] = bool(c_last > np.max(highs[:-1]))
            result["bos_bear"] = bool(c_last < np.min(lows[:-1]))
            result["choch_bull"] = bool(result["bos_bull"] and closes[-2] < lows[-3])
            result["choch_bear"] = bool(result["bos_bear"] and closes[-2] > highs[-3])
            result["sd_zone_active"] = True
            result["ob_fvg_bull"] = bool(np.any(closes[1:] > highs[:-1]))
            result["ob_fvg_bear"] = bool(np.any(closes[1:] < lows[:-1]))
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
            lows = [float(c.get("low", getattr(c, "low", 0)) if isinstance(c, dict) else getattr(c, "low", 0)) for c in m5_c[-5:]]
            highs = [float(c.get("high", getattr(c, "high", 0)) if isinstance(c, dict) else getattr(c, "high", 0)) for c in m5_c[-5:]]
            closes = [float(c.get("close", getattr(c, "close", 0)) if isinstance(c, dict) else getattr(c, "close", 0)) for c in m5_c[-5:]]
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
                result["current_price"] = float(m1_c[-1].get("close", getattr(m1_c[-1], "close", 0)) if isinstance(m1_c[-1], dict) else getattr(m1_c[-1], "close", 0))
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

        # Spread and News status from payload if provided
        result["spread_acceptable"] = data.get("spread_acceptable", True)
        result["news_high_impact_active"] = data.get("news_high_impact_active", False)
        
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

