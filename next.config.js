/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite build-uri de verificare într-un director separat, ca un `next build`
  // să nu suprascrie `.next`-ul folosit de un `next dev` care rulează în paralel
  // (altfel serverul de dev rămâne fără manifeste și întoarce 500).
  // Nesetat în producție → rămâne `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // DuckDB (sursa Overture din motorul de leaduri) are un binar nativ per
  // platformă: se încarcă din node_modules la runtime, nu se împachetează.
  experimental: {
    serverComponentsExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings'],
  },

  // Antete de securitate pe toate rutele. Fără CSP strict: Clerk, GA și
  // stilurile inline ale aplicației ar cere o listă lungă de excepții.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Aplicația nu se încarcă în iframe-uri străine (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
