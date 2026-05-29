import { canUseTestAccessCode, isTestBuildChannel } from './testAccessCode';

const toBool = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const fakeUserEmail = (import.meta.env.VITE_FAKE_LOGIN_EMAIL as string | undefined)?.trim();
const explicitBuildChannel = (import.meta.env.VITE_BUILD_CHANNEL as string | undefined)?.trim();
const e2eBuildEnabled = toBool(import.meta.env.VITE_E2E);
const buildChannel = explicitBuildChannel || (e2eBuildEnabled ? 'e2e' : undefined);
const tvTestLoginEnabled = toBool(import.meta.env.VITE_TV_TEST_LOGIN);
const isInternalBuild = import.meta.env.DEV || isTestBuildChannel(buildChannel);
const rawAppBuildTarget = (import.meta.env.VITE_APP_TARGET as string | undefined)
  ?.trim()
  .toLowerCase();
const appBuildTarget =
  rawAppBuildTarget === 'tv' || rawAppBuildTarget === 'legacy' || rawAppBuildTarget === 'web'
    ? rawAppBuildTarget
    : 'web';
const tvBuildEnabled = toBool(import.meta.env.VITE_TV_BUILD) || appBuildTarget === 'tv';
const webBuildEnabled = toBool(import.meta.env.VITE_WEB_BUILD) || appBuildTarget === 'web';
const legacyBuildEnabled =
  toBool(import.meta.env.VITE_LEGACY_BUILD) || appBuildTarget === 'legacy';
const rawNativeAndroidPlayer = (import.meta.env.VITE_NATIVE_ANDROID_PLAYER as string | undefined)
  ?.trim()
  .toLowerCase();
const nativeAndroidPlayerEnabled = rawNativeAndroidPlayer
  ? toBool(rawNativeAndroidPlayer)
  : tvBuildEnabled;
const storeSafeBuildEnabled = toBool(import.meta.env.VITE_STORE_SAFE_BUILD);
const rawAdultContentEnabled = (import.meta.env.VITE_ENABLE_ADULT_CONTENT as string | undefined)
  ?.trim()
  .toLowerCase();
const adultContentEnabled = rawAdultContentEnabled
  ? toBool(rawAdultContentEnabled)
  : !storeSafeBuildEnabled;

export const runtimeFlags = {
  appBuildTarget,
  isTvBuild: tvBuildEnabled,
  isWebBuild: webBuildEnabled,
  isLegacyBuild: legacyBuildEnabled,
  /** TV moderno usa Media3 por padrão; VITE_NATIVE_ANDROID_PLAYER=false força HTML5. */
  nativeAndroidPlayerEnabled,
  /** Build de loja sem seção/rota adulta. Use VITE_STORE_SAFE_BUILD=true para Play Store. */
  storeSafeBuildEnabled,
  adultContentEnabled,
  officialVodPlayerPipeline: 'NativePlayerPlugin',
  fakeLoginEnabled: import.meta.env.DEV && toBool(import.meta.env.VITE_FAKE_LOGIN),
  adminBypassEnabled: import.meta.env.DEV && toBool(import.meta.env.VITE_ADMIN_BYPASS),
  skipAuthEnabled: isInternalBuild && toBool(import.meta.env.VITE_SKIP_AUTH),
  fakeUserEmail: fakeUserEmail || 'teste@redflix.local',
  buildChannel: buildChannel || (import.meta.env.PROD ? 'production' : 'development'),
  /**
   * Mantém o código `000000` para dev/APKs de teste, mas evita habilitar por acidente
   * em builds finais de produção.
   */
  tvTestAccessCodeEnabled: canUseTestAccessCode({
    isDev: import.meta.env.DEV,
    tvTestLoginEnabled,
    buildChannel,
  }),
} as const;
