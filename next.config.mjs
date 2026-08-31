const isProd = process.env.NODE_ENV === 'production';

const cspHeader = [
  "default-src 'self'",
  isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://picsum.photos",
  "font-src 'self' data:",
  "connect-src 'self' wss://ws.twelvedata.com https://api.twelvedata.com https://query1.finance.yahoo.com https://api.polygon.io",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: cspHeader
  },
  {
    key: 'Permissions-Policy',
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  }
];

const nextConfig = {
  reactStrictMode: true,
  
  experimental: {
    
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', 
      },
    ],
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
