import type { CapacitorConfig } from '@capacitor/cli';

// Beta: Die App lädt PAI von Vercel (immer aktuell, keine neue App-Version für jedes Update).
// Vor der öffentlichen Store-Einreichung wird auf gebündelte Dateien + native Funktionen umgestellt.
const config: CapacitorConfig = {
  appId: 'de.elmerhi.pai',
  appName: 'PAI',
  webDir: 'mobile-www',
  server: { url: 'https://pai-henna-ten.vercel.app', cleartext: false, errorPath: 'index.html' },
  ios: { contentInset: 'never', limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
};
export default config;
