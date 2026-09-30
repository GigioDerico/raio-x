import type { NextConfig } from 'next';

// Cabeçalhos de segurança aplicados a todas as rotas.
// A CSP é restritiva de propósito: este app não carrega script de terceiro.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // logos dos bancos vêm do CDN do Pluggy
  "img-src 'self' data: https://cdn.pluggy.ai https://res.cloudinary.com",
  // o widget de conexão do Pluggy abre em iframe próprio (fatia 4)
  "frame-src 'self' https://connect.pluggy.ai",
  "connect-src 'self' https://api.pluggy.ai",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
