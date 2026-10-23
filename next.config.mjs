/** @type {import('next').NextConfig} */
export default {
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
};
