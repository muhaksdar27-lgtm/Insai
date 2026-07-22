import time
import numpy as np
candles = [{"open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "timestamp": str(i)} for i in range(1000)]

def extract_old(candles):
    arr = np.array([[c.get('open', 0.0), c.get('high', 0.0), c.get('low', 0.0), c.get('close', 0.0)] for c in candles], dtype=np.float64)
    return arr[:, 0], arr[:, 1], arr[:, 2], arr[:, 3]

def extract_new(candles):
    N = len(candles)
    O = np.fromiter((c.get('open', 0.0) for c in candles), dtype=np.float64, count=N)
    H = np.fromiter((c.get('high', 0.0) for c in candles), dtype=np.float64, count=N)
    L = np.fromiter((c.get('low', 0.0) for c in candles), dtype=np.float64, count=N)
    C = np.fromiter((c.get('close', 0.0) for c in candles), dtype=np.float64, count=N)
    return O, H, L, C

t0 = time.time()
for _ in range(1000):
    extract_old(candles)
print("Old:", time.time() - t0)

t0 = time.time()
for _ in range(1000):
    extract_new(candles)
print("New:", time.time() - t0)
