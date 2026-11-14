import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The store identifier. It cannot be changed after the first upload to Google Play / App Store.
  appId: 'com.luachi.app',
  appName: 'לוחי',
  webDir: 'dist-native',
  backgroundColor: '#0f1630',
  android: {
    backgroundColor: '#0f1630',
  },
  ios: {
    backgroundColor: '#0f1630',
    contentInset: 'never',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_luachi',
      iconColor: '#E0A33A',
    },
  },
};

export default config;
