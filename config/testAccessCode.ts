export const TEST_ACCESS_CODE = '000000';

const TEST_BUILD_CHANNELS = new Set(['test', 'testing', 'qa', 'staging', 'e2e', 'internal']);

export const normalizeBuildChannel = (channel: string | undefined): string =>
  channel?.trim().toLowerCase() || '';

export const isTestBuildChannel = (channel: string | undefined): boolean =>
  TEST_BUILD_CHANNELS.has(normalizeBuildChannel(channel));

export const canUseTestAccessCode = ({
  isDev,
  tvTestLoginEnabled,
  buildChannel,
}: {
  isDev: boolean;
  tvTestLoginEnabled: boolean;
  /** Em APK/build fora de DEV, o bypass 000000 só abre em canais marcados como teste. */
  buildChannel?: string;
}): boolean => isDev || (tvTestLoginEnabled && isTestBuildChannel(buildChannel));

export const shouldBlockProductionTestAccessCode = ({
  isProductionBuild,
  tvTestLoginEnabled,
  buildChannel,
}: {
  isProductionBuild: boolean;
  tvTestLoginEnabled: boolean;
  buildChannel?: string;
}): boolean => isProductionBuild && tvTestLoginEnabled && !isTestBuildChannel(buildChannel);
