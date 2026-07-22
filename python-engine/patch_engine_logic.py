import re

with open('python-engine/core_engine.py', 'r') as f:
    content = f.read()

# Replace the Structure breaks & Liquidity sweeps section
old_struct = """            # Structure breaks & Liquidity sweeps
            bos_bull = bool((c_last > last_swing_high) and (last_swing_high >= prev_swing_high) and (last_swing_high > 0))
            bos_bear = bool((c_last < last_swing_low) and (last_swing_low <= prev_swing_low) and (last_swing_low > 0))
            choch_bull = bool((c_last > last_swing_high) and (last_swing_high < prev_swing_high) and (last_swing_high > 0))
            choch_bear = bool((c_last < last_swing_low) and (last_swing_low > prev_swing_low) and (last_swing_low > 0))
            
            liq_sweep_bull = bool((l_last < last_swing_low) and (c_last > last_swing_low) and (last_swing_low > 0))
            liq_sweep_bear = bool((h_last > last_swing_high) and (c_last < last_swing_high) and (last_swing_high > 0))"""

new_struct = """            # Structure breaks & Liquidity sweeps (Recent 5 candles)
            bos_bull = False
            bos_bear = False
            choch_bull = False
            choch_bear = False
            liq_sweep_bull = False
            liq_sweep_bear = False
            
            if last_swing_high > 0 and prev_swing_high > 0:
                if np.any(C_lb[-5:] > last_swing_high) and (last_swing_high >= prev_swing_high):
                    bos_bull = True
                if np.any(C_lb[-5:] > last_swing_high) and (last_swing_high < prev_swing_high):
                    choch_bull = True
                if np.any(H_lb[-5:] > last_swing_high) and np.any(C_lb[-5:] < last_swing_high):
                    liq_sweep_bear = True
                    
            if last_swing_low > 0 and prev_swing_low > 0:
                if np.any(C_lb[-5:] < last_swing_low) and (last_swing_low <= prev_swing_low):
                    bos_bear = True
                if np.any(C_lb[-5:] < last_swing_low) and (last_swing_low > prev_swing_low):
                    choch_bear = True
                if np.any(L_lb[-5:] < last_swing_low) and np.any(C_lb[-5:] > last_swing_low):
                    liq_sweep_bull = True"""

content = content.replace(old_struct, new_struct)

# Add strict volume or size constraints for engulfing
old_engulfing = """            bullish_engulfing = bool(red_lb[-2] and grn_lb[-1] and (C_lb[-1] > O_lb[-2]) and (O_lb[-1] < C_lb[-2]) and body_lb[-1] > avg_body * 0.5) if lookback >= 2 else False
            bearish_engulfing = bool(grn_lb[-2] and red_lb[-1] and (C_lb[-1] < O_lb[-2]) and (O_lb[-1] > C_lb[-2]) and body_lb[-1] > avg_body * 0.5) if lookback >= 2 else False"""

new_engulfing = """            # Strict Engulfing with solid body
            bullish_engulfing = bool(red_lb[-2] and grn_lb[-1] and (C_lb[-1] > O_lb[-2]) and (O_lb[-1] <= C_lb[-2]) and body_lb[-1] > avg_body * 0.8) if lookback >= 2 else False
            bearish_engulfing = bool(grn_lb[-2] and red_lb[-1] and (C_lb[-1] < O_lb[-2]) and (O_lb[-1] >= C_lb[-2]) and body_lb[-1] > avg_body * 0.8) if lookback >= 2 else False"""

content = content.replace(old_engulfing, new_engulfing)

with open('python-engine/core_engine.py', 'w') as f:
    f.write(content)

print("Patched core_engine.py logic")
