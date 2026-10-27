import Constants from 'expo-constants';

// The build profile sets EXPO_PUBLIC_RELEASE_CHANNEL at build time via eas.json.
// Falls back to 'development' when running locally in Expo Go.
const channel =
  process.env.EXPO_PUBLIC_RELEASE_CHANNEL ??
  Constants.expoConfig?.extra?.releaseChannel ??
  'development';

const BASE_URLS: Record<string, string> = {
  development: 'http://localhost:3000/v1',
  staging:     'https://fundly-backend-staging.up.railway.app/v1',
  production:  'https://fundly-backend-production.up.railway.app/v1',
};

const ENV = {
  BASE_URL: BASE_URLS[channel] ?? BASE_URLS.development,
  IS_DEV:   channel === 'development',
  channel,
};

export default ENV;
