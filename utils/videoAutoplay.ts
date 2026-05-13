interface AutoplayOptions {
  mutedFirst: boolean;
  mutedFallback: boolean;
  canPlay?: () => boolean;
  onMutedFallback?: () => void;
}

const READY_EVENTS = ['loadedmetadata', 'canplay'] as const;
const HAVE_METADATA = 1;

export function prepareVideoForAutoplay(video: HTMLVideoElement, mutedFirst: boolean): void {
  video.autoplay = true;
  video.playsInline = true;
  video.controls = false;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback noplaybackrate');

  if (mutedFirst) {
    video.defaultMuted = true;
    video.muted = true;
    video.volume = 0;
    return;
  }

  video.defaultMuted = false;
  video.muted = false;
  video.volume = 1;
}

export async function playWithAutoplayPolicy(
  video: HTMLVideoElement,
  { mutedFirst, mutedFallback, onMutedFallback }: AutoplayOptions
): Promise<boolean> {
  prepareVideoForAutoplay(video, mutedFirst);

  try {
    await video.play();
    if (mutedFirst && (video.muted || video.volume === 0)) {
      onMutedFallback?.();
    }
    return video.muted || video.volume === 0;
  } catch {
    if (!mutedFallback) return false;
  }

  video.defaultMuted = true;
  video.muted = true;
  video.volume = 0;
  try {
    await video.play();
    onMutedFallback?.();
    return true;
  } catch {
    return false;
  }
}

export function playWhenVideoReady(
  video: HTMLVideoElement,
  options: AutoplayOptions
): () => void {
  let done = false;
  let immediateTimer: number | null = null;

  const tryPlay = () => {
    if (done) return;
    if (video.readyState < HAVE_METADATA) return;
    if (options.canPlay && !options.canPlay()) return;
    done = true;
    void playWithAutoplayPolicy(video, options);
  };

  READY_EVENTS.forEach((eventName) => video.addEventListener(eventName, tryPlay));

  if (video.readyState >= HAVE_METADATA) {
    immediateTimer = window.setTimeout(tryPlay, 0);
  }

  return () => {
    done = true;
    if (immediateTimer !== null) {
      window.clearTimeout(immediateTimer);
      immediateTimer = null;
    }
    READY_EVENTS.forEach((eventName) => video.removeEventListener(eventName, tryPlay));
  };
}
