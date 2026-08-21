from datetime import datetime, timezone

def get_session_info(timestamp_str=None):
    """
    Python Session Engine matching Node.js SessionEngine exactly (Single Source of Truth in UTC).
    """
    if timestamp_str:
        try:
            dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        except Exception:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)
        
    utc_day = dt.weekday() # 0 = Monday, ..., 4 = Friday, 5 = Saturday, 6 = Sunday
    hour = dt.hour
    minute = dt.minute
    decimal_hour = hour + (minute / 60.0)

    # Weekend / Market Closed check
    is_open = True
    block_reason = None
    if utc_day == 5: # Saturday
        is_open = False
        block_reason = "Forex/XAUUSD market closed (Saturday)"
    elif utc_day == 4 and decimal_hour >= 22.0: # Friday post-22:00 UTC
        is_open = False
        block_reason = "Forex/XAUUSD weekend close (Friday post-22:00 UTC)"
    elif utc_day == 6 and decimal_hour < 22.0: # Sunday pre-22:00 UTC
        is_open = False
        block_reason = "Forex/XAUUSD pre-market (Sunday pre-22:00 UTC)"
    elif 0 <= utc_day <= 3 and 22.0 <= decimal_hour < 23.0:
        is_open = False
        block_reason = "Forex/XAUUSD daily rollover maintenance break (22:00-23:00 UTC)"

    if not is_open:
        return {
            "primary_session": "Market Closed",
            "sessions": [],
            "is_asian": False,
            "is_london": False,
            "is_new_york": False,
            "is_overlap": False,
            "is_london_killzone": False,
            "is_ny_killzone": False,
            "is_asian_killzone": False,
            "is_off_session": True,
            "is_open": False,
            "hour": hour,
            "minute": minute,
            "block_reason": block_reason
        }

    is_asian = (0.0 <= decimal_hour < 8.0) or (23.0 <= decimal_hour < 24.0)
    is_london = 7.0 <= decimal_hour < 16.0
    is_new_york = 12.0 <= decimal_hour < 21.0
    is_overlap = is_london and is_new_york
    
    is_asian_killzone = 0.0 <= decimal_hour < 4.0
    is_london_killzone = 7.0 <= decimal_hour < 10.0
    is_ny_killzone = 12.0 <= decimal_hour < 15.0

    sessions = []
    if is_asian:
        sessions.append("Asian")
    if is_london:
        sessions.append("London")
    if is_new_york:
        sessions.append("New York")

    if is_overlap:
        primary_session = "London/NY Overlap"
        is_off_session = False
    elif is_london:
        primary_session = "London"
        is_off_session = False
    elif is_new_york:
        primary_session = "New York"
        is_off_session = False
    elif is_asian:
        primary_session = "Asian"
        is_off_session = False
    else:
        primary_session = "Off-Session"
        is_off_session = True

    return {
        "primary_session": primary_session,
        "sessions": sessions,
        "is_asian": is_asian,
        "is_london": is_london,
        "is_new_york": is_new_york,
        "is_overlap": is_overlap,
        "is_london_killzone": is_london_killzone,
        "is_ny_killzone": is_ny_killzone,
        "is_asian_killzone": is_asian_killzone,
        "is_off_session": is_off_session,
        "is_open": True,
        "hour": hour,
        "minute": minute,
        "block_reason": None
    }
