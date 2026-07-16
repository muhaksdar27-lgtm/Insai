import * as fs from 'fs';
import * as path from 'path';

let envCache: Record<string, string> = {};
let lastMtime = 0;

export function getEnv(key: string): string | undefined {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const stats = fs.statSync(envPath);
      if (stats.mtimeMs > lastMtime) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.trim() && !line.startsWith('#')) {
            const [k, ...rest] = line.split('=');
            if (k) {
              let val = rest.join('=').trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.substring(1, val.length - 1);
              }
              const trimmedKey = k.trim();
              envCache[trimmedKey] = val;
              // Only overwrite process.env if it is not already set with a truthy value
              if (!process.env[trimmedKey]) {
                process.env[trimmedKey] = val; // sync to process.env
              }
            }
          }
        }
        lastMtime = stats.mtimeMs;
      }
    }
  } catch (e) {
    // ignore
  }
  
  let val = process.env[key] || envCache[key];
  if (key === 'APP_URL' && !val) {
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      val = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    } else if (process.env.VERCEL_URL) {
      val = `https://${process.env.VERCEL_URL}`;
    }
  }
  if (val) {
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
  }
  return val;
}
