/**
 * Session Engine - Single Source of Truth for Trading Sessions & Killzones
 * All subsystems (Node.js brain, Python quant engine, Strategy rule evaluator, Frontend)
 * must derive session data from this exact logic.
 */

export interface SessionDetails {
  primarySession: string;       // e.g. "London", "New York", "London/NY Overlap", "Asian", "Off-Session", "Market Closed"
  activeSessions: string[];      // list of currently active sessions
  isAsian: boolean;
  isLondon: boolean;
  isNewYork: boolean;
  isOverlap: boolean;
  isLondonKillzone: boolean;
  isNYKillzone: boolean;
  isAsianKillzone: boolean;
  isOffSession: boolean;
  isOpen: boolean;
  utcHour: number;
  utcMinute: number;
  utcTime: string;
  sessionRange: string;
  blockReason: string | null;
}

export class SessionEngine {
  /**
   * Computes exact session context from a given date/time (default: current UTC).
   */
  public static getSessionInfo(timestampInput?: string | number | Date): SessionDetails {
    let date: Date;
    if (!timestampInput) {
      date = new Date();
    } else if (timestampInput instanceof Date) {
      date = timestampInput;
    } else if (typeof timestampInput === 'number') {
      date = new Date(timestampInput);
    } else {
      try {
        date = new Date(timestampInput);
        if (isNaN(date.getTime())) date = new Date();
      } catch {
        date = new Date();
      }
    }

    const utcDay = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const utcHour = date.getUTCHours();
    const utcMinute = date.getUTCMinutes();
    const decimalHour = utcHour + (utcMinute / 60);
    const utcTimeStr = date.toISOString();

    let isOpen = true;
    let blockReason: string | null = null;

    // 1. Weekend & Market Closure Check for Gold (XAUUSD Spot)
    // Forex/Gold closes Friday 22:00 UTC and reopens Sunday 22:00 UTC
    if (utcDay === 6) { // Saturday
      isOpen = false;
      blockReason = 'Forex/XAUUSD market closed (Saturday)';
    } else if (utcDay === 5 && decimalHour >= 22.0) { // Friday after 22:00 UTC
      isOpen = false;
      blockReason = 'Forex/XAUUSD weekend close (Friday post-22:00 UTC)';
    } else if (utcDay === 0 && decimalHour < 22.0) { // Sunday before 22:00 UTC
      isOpen = false;
      blockReason = 'Forex/XAUUSD pre-market (Sunday pre-22:00 UTC)';
    } else if (utcDay >= 1 && utcDay <= 4 && decimalHour >= 22.0 && decimalHour < 23.0) {
      // Daily settlement / rollover break (22:00 - 23:00 UTC)
      isOpen = false;
      blockReason = 'Forex/XAUUSD daily rollover maintenance break (22:00-23:00 UTC)';
    }

    if (!isOpen) {
      return {
        primarySession: 'Market Closed',
        activeSessions: [],
        isAsian: false,
        isLondon: false,
        isNewYork: false,
        isOverlap: false,
        isLondonKillzone: false,
        isNYKillzone: false,
        isAsianKillzone: false,
        isOffSession: true,
        isOpen: false,
        utcHour,
        utcMinute,
        utcTime: utcTimeStr,
        sessionRange: 'Closed',
        blockReason
      };
    }

    // 2. Active Session Detection (UTC Standard for Institutional Forex / Gold)
    // - Asian Session: 00:00 - 08:00 UTC
    // - London Session: 07:00 - 16:00 UTC
    // - New York Session: 12:00 - 21:00 UTC
    const isAsian = (decimalHour >= 0 && decimalHour < 8) || (decimalHour >= 23 && decimalHour < 24);
    const isLondon = decimalHour >= 7 && decimalHour < 16;
    const isNewYork = decimalHour >= 12 && decimalHour < 21;
    const isOverlap = isLondon && isNewYork; // 12:00 - 16:00 UTC

    // 3. Killzone Detection (Institutional Smart Money Liquidity Windows)
    // - Asian Killzone: 00:00 - 04:00 UTC
    // - London Open Killzone: 07:00 - 10:00 UTC (08:00 - 11:00 London Time)
    // - New York Open Killzone: 12:00 - 15:00 UTC (07:00 - 10:00 EST)
    const isAsianKillzone = decimalHour >= 0 && decimalHour < 4;
    const isLondonKillzone = decimalHour >= 7 && decimalHour < 10;
    const isNYKillzone = decimalHour >= 12 && decimalHour < 15;

    const activeSessions: string[] = [];
    if (isAsian) activeSessions.push('Asian');
    if (isLondon) activeSessions.push('London');
    if (isNewYork) activeSessions.push('New York');

    // 4. Primary Session Label
    let primarySession = 'Off-Session';
    let sessionRange = '21:00 - 23:00 UTC';
    let isOffSession = false;

    if (isOverlap) {
      primarySession = 'London/NY Overlap';
      sessionRange = '12:00 - 16:00 UTC';
    } else if (isLondon) {
      primarySession = 'London';
      sessionRange = '07:00 - 16:00 UTC';
    } else if (isNewYork) {
      primarySession = 'New York';
      sessionRange = '12:00 - 21:00 UTC';
    } else if (isAsian) {
      primarySession = 'Asian';
      sessionRange = '00:00 - 08:00 UTC';
    } else {
      primarySession = 'Off-Session';
      isOffSession = true;
      sessionRange = '21:00 - 23:00 UTC';
    }

    return {
      primarySession,
      activeSessions,
      isAsian,
      isLondon,
      isNewYork,
      isOverlap,
      isLondonKillzone,
      isNYKillzone,
      isAsianKillzone,
      isOffSession,
      isOpen: true,
      utcHour,
      utcMinute,
      utcTime: utcTimeStr,
      sessionRange,
      blockReason: null
    };
  }
}
