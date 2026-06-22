import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.myhsbclineloan.app',
  appName: 'MyHSBC LineLoan',
  webDir: 'dist',

  server: {
    url: 'https://myinvest-keepup.webgestion95.workers.dev/',
    cleartext: false
  },

  android: {
  allowMixedContent: true
}
};

export default config;