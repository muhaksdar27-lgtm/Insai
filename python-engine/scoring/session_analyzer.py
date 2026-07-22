from datetime import datetime, timezone

def get_session_info(timestamp_str=None):
    if timestamp_str:
        try:
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)
        
    hour = dt.hour
    
    sessions = []
    
    # Sydney: 21:00 - 06:00 UTC
    if hour >= 21 or hour < 6:
        sessions.append("Sydney")
        
    # Tokyo: 00:00 - 09:00 UTC
    if 0 <= hour < 9:
        sessions.append("Tokyo")
        
    # London: 07:00 - 16:00 UTC
    if 7 <= hour < 16:
        sessions.append("London")
        
    # New York: 12:00 - 21:00 UTC
    if 12 <= hour < 21:
        sessions.append("New York")
        
    is_overlap = ("London" in sessions) and ("New York" in sessions)
    is_asian_only = ("Tokyo" in sessions or "Sydney" in sessions) and not ("London" in sessions or "New York" in sessions)
    
    return {
        "sessions": sessions,
        "is_overlap": is_overlap,
        "is_asian_only": is_asian_only,
        "hour": hour
    }
