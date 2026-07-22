import re

with open('python-engine/core_engine.py', 'r') as f:
    content = f.read()

old_ob = """                # Accurate Unmitigated OB Detection
            is_bull_impulsive = (C > O) & (body_size > avg_body * 1.5)
            is_bear_impulsive = (C < O) & (body_size > avg_body * 1.5)
            
            if lookback >= 10:
                search_start = max(0, N - 30)
                bull_impulse_idx = np.where(is_bull_impulsive[search_start:])[0]
                for idx in reversed(bull_impulse_idx + search_start):
                    opp_idx = np.where(is_red[max(0, idx-8):idx])[0]
                    if len(opp_idx) > 0:
                        ob_idx = opp_idx[-1] + max(0, idx-8)
                        top, bot = float(H[ob_idx]), float(L[ob_idx])
                        mitigated = np.any(L[idx+1:-3] <= top) if idx + 1 < N - 3 else False
                        if not mitigated and (bot * 0.998 <= c_last <= top * 1.002):
                            curr_ob_bull = True
                            break
                
                bear_impulse_idx = np.where(is_bear_impulsive[search_start:])[0]
                for idx in reversed(bear_impulse_idx + search_start):
                    opp_idx = np.where(is_green[max(0, idx-8):idx])[0]
                    if len(opp_idx) > 0:
                        ob_idx = opp_idx[-1] + max(0, idx-8)
                        top, bot = float(H[ob_idx]), float(L[ob_idx])
                        mitigated = np.any(H[idx+1:-3] >= bot) if idx + 1 < N - 3 else False
                        if not mitigated and (bot * 0.998 <= c_last <= top * 1.002):
                            curr_ob_bear = True
                            break"""

new_ob = """                # Accurate Unmitigated OB Detection
            is_bull_impulsive = (C > O) & (body_size > avg_body * 1.5)
            is_bear_impulsive = (C < O) & (body_size > avg_body * 1.5)
            
            if lookback >= 5:
                search_start = max(0, N - 40)
                bull_impulse_idx = np.where(is_bull_impulsive[search_start:])[0]
                for idx in reversed(bull_impulse_idx + search_start):
                    opp_idx = np.where(is_red[max(0, idx-8):idx])[0]
                    if len(opp_idx) > 0:
                        ob_idx = opp_idx[-1] + max(0, idx-8)
                        top, bot = float(H[ob_idx]), float(L[ob_idx])
                        # Mitigated before the last 5 candles?
                        past_mitigated = np.any(L[idx+1:-5] <= top) if idx + 1 < N - 5 else False
                        if not past_mitigated:
                            # Is price currently testing the OB?
                            if np.any(L_lb[-5:] <= top) and np.any(H_lb[-5:] >= bot):
                                curr_ob_bull = True
                                break
                
                bear_impulse_idx = np.where(is_bear_impulsive[search_start:])[0]
                for idx in reversed(bear_impulse_idx + search_start):
                    opp_idx = np.where(is_green[max(0, idx-8):idx])[0]
                    if len(opp_idx) > 0:
                        ob_idx = opp_idx[-1] + max(0, idx-8)
                        top, bot = float(H[ob_idx]), float(L[ob_idx])
                        past_mitigated = np.any(H[idx+1:-5] >= bot) if idx + 1 < N - 5 else False
                        if not past_mitigated:
                            if np.any(H_lb[-5:] >= bot) and np.any(L_lb[-5:] <= top):
                                curr_ob_bear = True
                                break"""

content = content.replace(old_ob, new_ob)

with open('python-engine/core_engine.py', 'w') as f:
    f.write(content)

print("Patched OB logic")
