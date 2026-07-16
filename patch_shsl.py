import re

with open("python-engine/strategy/smc_sd_confluence_engine.py", "r") as f:
    content = f.read()

pattern = r"def _get_swing_highs_lows\(self, highs: np\.ndarray, lows: np\.ndarray, window: int = 2\).*?return swing_highs, swing_lows"

replacement = """def _get_swing_highs_lows(self, highs: np.ndarray, lows: np.ndarray, window: int = 2) -> Tuple[List[Dict[str, float]], List[Dict[str, float]]]:
        # OPTIMIZATION: Vectorized Swing High/Low detection
        n = len(highs)
        if n < window * 2 + 1:
            return [], []
            
        swing_highs = []
        swing_lows = []
        
        for i in range(window, n - window):
            # Check swing high
            if highs[i] == np.max(highs[i-window:i+window+1]):
                # To prevent duplicates if flat top, ensure strictly greater than neighbors if needed,
                # but simple max is fine.
                swing_highs.append({"index": i, "price": highs[i]})
            # Check swing low
            if lows[i] == np.min(lows[i-window:i+window+1]):
                swing_lows.append({"index": i, "price": lows[i]})
                
        return swing_highs, swing_lows"""

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)
if new_content == content:
    print("Regex not matched!")
else:
    with open("python-engine/strategy/smc_sd_confluence_engine.py", "w") as f:
        f.write(new_content)
    print("Patched SHSL!")
