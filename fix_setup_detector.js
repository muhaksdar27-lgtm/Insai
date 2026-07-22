const fs = require('fs');

const addition = `
  /**
   * Translates raw market data (pyData) into a strategy-specific snapshot.
   * Recognizes: London session, Asia liquidity sweep, CHoCH, FVG, OB, S&D zone, 
   * engulfing, double top/bottom, news filter, zone overlap.
   */
  public translateMarketDataToSnapshot(strategyId: string, pyData: any): Record<string, any> {
    if (!pyData) {
       return { _assumptions_flagged: true, message: "No data available" };
    }

    const snapshot: Record<string, any> = {
       _assumptions_flagged: false
    };

    // Safe extraction helpers
    const getBool = (key1: string, key2?: string) => {
       const val1 = pyData[key1];
       const val2 = key2 ? pyData[key2] : false;
       return Boolean(val1 || val2);
    };

    const getValue = (key: string, fallback = "ASUMSI PERLU KONFIRMASI") => {
       return pyData[key] !== undefined && pyData[key] !== null ? pyData[key] : fallback;
    };

    // 1. Session
    // If we have time/session data, extract it. Otherwise flag assumption.
    snapshot.session = pyData.current_session || "ASUMSI PERLU KONFIRMASI";
    
    // 2. Liquidity Sweep
    const hasSweep = getBool('liq_sweep_bull', 'liq_sweep_bear');
    snapshot.sweepStatus = hasSweep ? "Detected" : getValue('liq_sweep_status');
    
    // 3. CHoCH
    const hasChoch = getBool('choch_bull', 'choch_bear');
    snapshot.chochStatus = hasChoch ? "Detected" : getValue('choch_status');

    // 4. FVG & OB
    const hasFvgOb = getBool('ob_fvg_bull', 'ob_fvg_bear');
    snapshot.fvgObStatus = hasFvgOb ? "Present" : getValue('ob_fvg_status');

    // 5. S&D Zone
    snapshot.sdZoneStatus = pyData.sd_zone_active ? "Active" : getValue('sd_zone_status');

    // 6. Engulfing
    const hasEngulfing = getBool('engulfing_bull', 'engulfing_bear');
    snapshot.engulfingStatus = hasEngulfing ? "Detected" : getValue('engulfing_status');

    // 7. Double Top/Bottom
    const hasDouble = getBool('double_top', 'double_bottom');
    snapshot.doubleTopBottomStatus = hasDouble ? "Detected" : getValue('double_pattern_status');

    // 8. News Filter
    snapshot.newsStatus = pyData.news_high_impact_active !== undefined ? 
                          (pyData.news_high_impact_active ? "High Impact Active" : "Clear") : 
                          getValue('news_status');

    // 9. Zone Overlap
    snapshot.zoneOverlapStatus = pyData.zone_overlap ? "Overlap Detected" : getValue('zone_overlap');

    // Base properties
    snapshot.h1Bias = getValue('trend_h1');
    snapshot.atr14 = getValue('atr');
    snapshot.entryPrice = getValue('current_price');
    snapshot.direction = pyData.trend_h1 === 'bearish' || pyData.engulfing_bear || pyData.double_top ? 'sell' : 'buy';

    // If any value is still ASUMSI PERLU KONFIRMASI, we flag it.
    for (const val of Object.values(snapshot)) {
       if (val === "ASUMSI PERLU KONFIRMASI") {
           snapshot._assumptions_flagged = true;
           break;
       }
    }

    return snapshot;
  }
`;

let code = fs.readFileSync('/app/applet/lib/trading-engine/setup-detector.ts', 'utf8');
code = code.replace(/public audit\(\): void \{/, addition + '\n  public audit(): void {');
fs.writeFileSync('/app/applet/lib/trading-engine/setup-detector.ts', code);
console.log("Updated setup-detector.ts");
