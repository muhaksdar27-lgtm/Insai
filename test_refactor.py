import numpy as np

def fast_extract(candles, keys):
    return np.fromiter((c[k] for c in candles for k in keys), dtype=np.float64, count=len(candles)*len(keys)).reshape(-1, len(keys))

cands = [{"open":1, "high":2, "low":0.5, "close":1.5}, {"open":1, "high":2, "low":0.5, "close":1.5}]
print(fast_extract(cands, ["open", "high", "low", "close"]))
