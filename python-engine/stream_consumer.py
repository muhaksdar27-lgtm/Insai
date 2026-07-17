import os
import asyncio
import orjson
from utils.logger import logger
from core_engine import CoreEngine

try:
    import redis.asyncio as redis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

core_engine_instance = CoreEngine()

class MarketState:
    def __init__(self):
        self.latest_data = {}

    def update(self, symbol, data):
        # Dictionary assignment is atomic in Python due to the GIL. No lock needed for simple assignment.
        self.latest_data[symbol] = data

    def get(self, symbol):
        return self.latest_data.get(symbol)

global_market_state = MarketState()

async def consume_market_stream_async():
    if not HAS_REDIS:
        logger.warning("Redis python package not found, skipping stream consumer.")
        return
        
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        logger.warning("REDIS_URL not set. Skipping Python async stream consumer.")
        return
        
    stream_key = "market_stream:XAUUSD"
    group_name = "python_engine_group"
    consumer_name = "consumer_async_1"
    
    while True:
        r = None
        try:
            r = redis.from_url(redis_url, decode_responses=True)
            await r.ping()
            
            try:
                await r.xgroup_create(stream_key, group_name, id='0', mkstream=True)
            except Exception as e:
                if "BUSYGROUP" not in str(e):
                    logger.error(f"Error creating group: {e}")
                    
            logger.info("Python Engine started consuming from Redis Streams asynchronously...")
            
            while True:
                # Block for up to 1 second waiting for messages
                messages = await r.xreadgroup(groupname=group_name, consumername=consumer_name, streams={stream_key: ">"}, count=100, block=1000)
                if not messages:
                    continue
                    
                # Process in batch
                message_ids_to_ack = []
                for stream, msg_list in messages:
                    for message_id, message_data in msg_list:
                        try:
                            payload = message_data.get("payload")
                            if payload:
                                data = orjson.loads(payload) if isinstance(payload, str) else payload
                                # Incremental state update without lock
                                global_market_state.update("XAUUSD", data)
                        except Exception as e:
                            logger.error(f"Error processing message {message_id}: {e}")
                        finally:
                            message_ids_to_ack.append(message_id)
                            
                # Batch ACK for extreme speed
                if message_ids_to_ack:
                    await r.xack(stream_key, group_name, *message_ids_to_ack)
                        
        except asyncio.CancelledError:
            logger.info("Stream consumer cancelled")
            if r:
                await r.aclose()
            return
        except Exception as e:
            logger.error(f"Error reading from redis stream: {e}. Reconnecting in 5s...")
            if r:
                try:
                    await r.aclose()
                except:
                    pass
            await asyncio.sleep(5)

def start_consumer_thread():
    import threading
    def _run_loop():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(consume_market_stream_async())
        except Exception as e:
            logger.error(f"Consumer loop failed: {e}")
        
    t = threading.Thread(target=_run_loop, daemon=True)
    t.start()
    return t
