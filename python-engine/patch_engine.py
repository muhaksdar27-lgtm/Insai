import re

with open('python-engine/core_engine.py', 'r') as f:
    content = f.read()

# Fix 1: Compute body_size, is_green, is_red dynamically outside hist_data
content = content.replace('body_size = hist_data["body_size"]', 'body_size = np.abs(C - O)')
content = content.replace('is_green = hist_data["is_green"]', 'is_green = C > O')
content = content.replace('is_red = hist_data["is_red"]', 'is_red = C < O')

# Fix 2: Remove body_size, is_green, is_red from _process_historical return
# We don't really need to, but to be clean:
# It's returning a dict, so let's just leave it there in _process_historical, it won't be used by `analyze` anymore.

# Fix 3: Change hist_key to only depend on prev_ts
content = content.replace('hist_key = f"{symbol}_{timeframe}_{N}_{prev_ts}_{curr_ts}"', 'hist_key = f"{symbol}_{timeframe}_{N}_{prev_ts}"')

with open('python-engine/core_engine.py', 'w') as f:
    f.write(content)

print("Patched core_engine.py")
