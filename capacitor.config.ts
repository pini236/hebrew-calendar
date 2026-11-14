import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The store identifier. It cannot be changed after the first upload to Google Play / App Store.
  appId: 'com.luachivri.app',
  appName: 'לוח עברי',
  webDir: 'dist-native',
  backgroundColor: '#1F3E9E',
  android: {
    backgroundColor: '#1F3E9E',
  },
  ios: {
    backgroundColor: '#1F3E9E',
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
