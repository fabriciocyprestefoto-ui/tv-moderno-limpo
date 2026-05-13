import { useEffect, useState, useCallback } from 'react';

export interface ScreenRecordingState {
  isRecording: boolean;
  isMirroring: boolean;
  detectorType: 'none' | 'document' | 'navigator' | 'visual';
}

const useScreenRecordingDetection = (
  onDetectionChange?: (isRecording: boolean) => void
): ScreenRecordingState => {
  const [state, setState] = useState<ScreenRecordingState>({
    isRecording: false,
    isMirroring: false,
    detectorType: 'none',
  });

  const checkScreenCapture = useCallback(() => {
    let isRecording = false;
    let detectorType: ScreenRecordingState['detectorType'] = 'none';

    if (typeof document !== 'undefined') {
      if (document.pictureInPictureElement) {
        isRecording = true;
        detectorType = 'document';
      }

      const hiddenDiv = document.createElement('div');
      hiddenDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="detect"><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter></svg>`;
      hiddenDiv.style.filter = 'url(#detect)';
      document.body.appendChild(hiddenDiv);

      if (hiddenDiv.offsetLeft === 0) {
        // Screen capture possibly active — detection heuristic
      }
      document.body.removeChild(hiddenDiv);
    }

    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { mediaDevices?: { getDisplayMedia?: unknown } };
      if (nav.mediaDevices?.getDisplayMedia) {
        const originalGetDisplayMedia = nav.mediaDevices.getDisplayMedia;
        (
          nav.mediaDevices as typeof nav.mediaDevices & { getDisplayMedia: unknown }
        ).getDisplayMedia = async function (...args: unknown[]) {
          setState({
            isRecording: true,
            isMirroring: true,
            detectorType: 'navigator',
          });
          onDetectionChange?.(true);
          return (originalGetDisplayMedia as (...args: unknown[]) => Promise<MediaStream>).apply(
            this,
            args
          );
        };
      }
    }

    if (isRecording !== state.isRecording || detectorType !== state.detectorType) {
      setState({
        isRecording,
        isMirroring: isRecording,
        detectorType,
      });
      onDetectionChange?.(isRecording);
    }

    return isRecording;
  }, [state.isRecording, state.detectorType, onDetectionChange]);

  useEffect(() => {
    const interval = setInterval(checkScreenCapture, 2000);
    checkScreenCapture();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkScreenCapture();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkScreenCapture]);

  return state;
};

export const useSecureContent = (options?: {
  onRecordingDetected?: () => void;
  allowedInDemo?: boolean;
}): {
  isSecure: boolean;
  screenRecording: ScreenRecordingState;
  hideContent: boolean;
} => {
  const { isRecording, isMirroring, detectorType } = useScreenRecordingDetection(
    options?.onRecordingDetected
  );
  const [hideContent, setHideContent] = useState(false);

  const isSecure = !isRecording && !isMirroring;
  const screenRecording: ScreenRecordingState = {
    isRecording,
    isMirroring,
    detectorType,
  };

  useEffect(() => {
    if (isRecording && !options?.allowedInDemo) {
      const timer = setTimeout(() => {
        setHideContent(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
    setHideContent(false);
    return undefined;
  }, [isRecording, options?.allowedInDemo]);

  return {
    isSecure,
    screenRecording,
    hideContent,
  };
};

export const SecurityScreenBlock: React.FC<{
  message?: string;
  onClose?: () => void;
}> = ({
  message = 'Gravação de tela detectada. Para segurança, o conteúdo foi ocultado.',
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <h2 className="text-white text-2xl font-bold mb-4">Gravação de Tela Detectada</h2>
        <p className="text-gray-400 mb-6">{message}</p>
        {onClose && (
          <button
            onClick={onClose}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg font-bold"
          >
            Entendi
          </button>
        )}
      </div>
    </div>
  );
};
