from datetime import datetime, timezone
import zoneinfo

def get_session_info(timestamp_str=None):
    if timestamp_str:
        try:
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)
        
    try:
        london_tz = zoneinfo.ZoneInfo("Europe/London")
        london_dt = dt.astimezone(london_tz)
        hour = london_dt.hour
    except Exception:
        hour = dt.hour
        
    sessions = []
    
    # Simple approximations mapping back to London local time structure
    # Asia (Sydney/Tokyo approx overlap)
    if hour >= 22 or hour < 8:
        sessions.append("Asian")
        
    # London: 07:00 - 16:00 Local
    if 7 <= hour < 16:
        sessions.append("London")
        
    # New York: 12:00 - 21:00 Local London (EST is approx 5 hours behind London)
    if 12 <= hour < 21:
        sessions.append("New York")
        
    is_overlap = ("London" in sessions) and ("New York" in sessions)
    is_asian_only = "Asian" in sessions and not ("London" in sessions or "New York" in sessions)
    
    return {
        "sessions": sessions,
        "is_overlap": is_overlap,
        "is_asian_only": is_asian_only,
        "hour": hour
    }
