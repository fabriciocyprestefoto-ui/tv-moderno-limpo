declare global {
  interface Window {
    /** Bridge Android (MainActivity): diagnóstico + teclado */
    RedxAndroidBridge?: {
      setInputFocused?: (focused: boolean) => void;
      logPlayer?: (jsonMessage: string) => void;
    };
    __redx: {
      detailsActive?: boolean;
      playerActive?: boolean;
      livetvActive?: boolean;
      whoIsWatchingActive?: boolean;
      canExitApp?: boolean;
      redxBackFromDetails?: () => void;
      spatialNavEnabled?: boolean;
      keyboardVisible?: boolean;
      lastError?: any;
      [key: string]: any;
    };
  }
}

export {};
