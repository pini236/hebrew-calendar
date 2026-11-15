import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // The store identifier. It cannot be changed after the first upload to Google Play / App Store.
  appId: 'com.luachyehudi.app',
  appName: 'לוח יהודי',
  webDir: 'dist-native',
  backgroundColor: '#1E5A45',
  android: {
    backgroundColor: '#1E5A45',
  },
  ios: {
    backgroundColor: '#1E5A45',
    contentInset: 'never',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_luachi',
      iconColor: '#E3A73A',
    },
  },
};

export default config;
