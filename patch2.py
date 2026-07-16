import re

with open("python-engine/strategy/smc_sd_confluence_engine.py", "r") as f:
    content = f.read()

# Replace using regex from `# LAYER 4: Entry Trigger (M1)` to `        if not trigger:\n            return self._no_signal(3, "Layer 4 Gagal: Belum ada pattern konfirmasi (Engulfing/Pin bar)", assumptions)`
pattern = r"# LAYER 4: Entry Trigger \(M1\).*?Belum ada pattern konfirmasi \(Engulfing/Pin bar\)\", assumptions\)"

replacement = """# LAYER 4: Entry Trigger (M1)
        m1_candles = data["M1"]["candles"]
        if len(m1_candles) < 5:
            return self._no_signal(3, "Layer 4 Gagal: Candle M1 tidak cukup", assumptions)
        
        c0, c1, c2 = m1_candles[-3], m1_candles[-2], m1_candles[-1]
        body0 = abs(c0["close"] - c0["open"])
        body1 = abs(c1["close"] - c1["open"])
        body2 = abs(c2["close"] - c2["open"])
        wick_up2 = c2["high"] - max(c2["open"], c2["close"])
        wick_dn2 = min(c2["open"], c2["close"]) - c2["low"]
        
        trigger = False
        pattern_name = ""
        
        # Double bottom / top detection using last 20 M1 candles
        recent_lows = [c["low"] for c in m1_candles[-20:]]
        recent_highs = [c["high"] for c in m1_candles[-20:]]
        min_low = min(recent_lows[:-2]) if len(recent_lows) > 2 else c2["low"]
        max_high = max(recent_highs[:-2]) if len(recent_highs) > 2 else c2["high"]
        
        if bias == "bullish":
            is_engulf = (c1["close"] < c1["open"]) and (c2["close"] > c2["open"]) and (body2 > body1) and (c2["close"] > c1["open"]) and (c2["open"] < c1["close"])
            is_pinbar = (wick_dn2 >= 2 * body2) and (c2["close"] >= c2["high"] - ((c2["high"] - c2["low"]) / 3))
            is_morning_star = (c0["close"] < c0["open"]) and (body1 < body0 * 0.3) and (c2["close"] > c2["open"]) and (c2["close"] > (c0["open"] + c0["close"])/2)
            is_double_bottom = abs(c2["low"] - min_low) / (min_low + 1e-9) < 0.0005 and is_pinbar
            
            if is_engulf: pattern_name = "Bullish Engulfing"
            elif is_morning_star: pattern_name = "Morning Star"
            elif is_double_bottom: pattern_name = "Double Bottom + Pinbar"
            elif is_pinbar: pattern_name = "Bullish Pinbar"
            
            trigger = is_engulf or is_pinbar or is_morning_star or is_double_bottom
        else:
            is_engulf = (c1["close"] > c1["open"]) and (c2["close"] < c2["open"]) and (body2 > body1) and (c2["close"] < c1["open"]) and (c2["open"] > c1["close"])
            is_pinbar = (wick_up2 >= 2 * body2) and (c2["close"] <= c2["low"] + ((c2["high"] - c2["low"]) / 3))
            is_evening_star = (c0["close"] > c0["open"]) and (body1 < body0 * 0.3) and (c2["close"] < c2["open"]) and (c2["close"] < (c0["open"] + c0["close"])/2)
            is_double_top = abs(c2["high"] - max_high) / (max_high + 1e-9) < 0.0005 and is_pinbar
            
            if is_engulf: pattern_name = "Bearish Engulfing"
            elif is_evening_star: pattern_name = "Evening Star"
            elif is_double_top: pattern_name = "Double Top + Pinbar"
            elif is_pinbar: pattern_name = "Bearish Pinbar"
            
            trigger = is_engulf or is_pinbar or is_evening_star or is_double_top
            
        if not trigger:
            return self._no_signal(3, "Layer 4 Gagal: Belum ada pattern konfirmasi (Engulf/Pinbar/Star/DB/DT)", assumptions)
        
        assumptions.append(f"Konfirmasi eksekusi: {pattern_name}")"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
if new_content == content:
    print("Regex not matched!")
else:
    with open("python-engine/strategy/smc_sd_confluence_engine.py", "w") as f:
        f.write(new_content)
    print("Patched!")
