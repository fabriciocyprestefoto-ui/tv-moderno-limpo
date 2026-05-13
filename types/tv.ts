export type LiveTVFocusArea = 'sidebar' | 'header' | 'channels';

export interface LiveTVFocusState {
  area: LiveTVFocusArea;
  sidebarIndex: number; // -1 = back button
  headerIndex: number; // 0 = guide button, 1 = search input
  channelIndex: number;
}

export interface LiveTVFocusBounds {
  categoriesCount: number;
  headerCount: number;
  channelsCount: number;
}
