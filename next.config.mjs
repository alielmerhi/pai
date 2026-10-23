/** @type {import('next').NextConfig} */
export default {
  env: { NEXT_PUBLIC_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA || 'lokal').slice(0, 7) },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }, { source: '/', headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }] }];
  },
};
