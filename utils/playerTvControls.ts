export type PlayerSettingsPanel = 'none' | 'quality';
export type ResumeAction = 'continue' | 'restart';

export const getPlayerSettingsOptionsCount = (
  panel: PlayerSettingsPanel,
  counts: { qualities: number }
): number => {
  if (panel === 'quality') return counts.qualities + 1;
  return 0;
};

export const getNextResumeAction = (current: ResumeAction, key: string): ResumeAction => {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current;
  return current === 'continue' ? 'restart' : 'continue';
};
