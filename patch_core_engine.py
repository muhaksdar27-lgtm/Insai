import os

path = 'python-engine/core_engine.py'
with open(path, 'r') as f:
    code = f.read()

code = code.replace("""        except Exception:
            return np.zeros(N, dtype=np.float64), np.zeros(N, dtype=np.float64), np.zeros(N, dtype=np.float64), np.zeros(N, dtype=np.float64)""", """        except Exception as e:
            from utils.logger import logger
            logger.error(f"Failed to extract OHLC arrays: {e}")
            raise ValueError(f"Invalid candle data format: {e}")""")

with open(path, 'w') as f:
    f.write(code)
