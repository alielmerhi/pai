import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'PAI', short_name: 'PAI', start_url: '/', display: 'standalone', background_color: '#F1F4F2', theme_color: '#F1F4F2', lang: 'de',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }, { src: '/apple-icon', sizes: '180x180', type: 'image/png' }] };
}
