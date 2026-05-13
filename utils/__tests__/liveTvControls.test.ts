import { describe, expect, it } from 'vitest';
import {
  getAdjacentLiveTvChannelIndex,
  getLiveTvRecoveryDecision,
  getLiveTvRecoveryDelayMsExponential,
} from '../liveTvControls';

describe('live TV controls', () => {
  it('limita recovery de rede e depois falha', () => {
    expect(
      getLiveTvRecoveryDecision({
        errorType: 'networkError',
        networkRetries: 0,
        mediaRetries: 0,
      }).action
    ).toBe('retry-network');

    expect(
      getLiveTvRecoveryDecision({
        errorType: 'networkError',
        networkRetries: 3,
        mediaRetries: 0,
      }).action
    ).toBe('fail');
  });

  it('limita recovery de midia', () => {
    expect(
      getLiveTvRecoveryDecision({
        errorType: 'mediaError',
        networkRetries: 0,
        mediaRetries: 1,
      }).action
    ).toBe('recover-media');

    expect(
      getLiveTvRecoveryDecision({
        errorType: 'mediaError',
        networkRetries: 0,
        mediaRetries: 2,
      }).action
    ).toBe('fail');
  });

  it('modo exponencial aumenta o delay entre tentativas de rede', () => {
    const d1 = getLiveTvRecoveryDecision({
      errorType: 'networkError',
      networkRetries: 0,
      mediaRetries: 0,
      delayMode: 'exponential',
    });
    expect(d1.action).toBe('retry-network');
    if (d1.action === 'retry-network') expect(d1.delayMs).toBe(1000);

    const d2 = getLiveTvRecoveryDecision({
      errorType: 'networkError',
      networkRetries: 1,
      mediaRetries: 0,
      delayMode: 'exponential',
    });
    expect(d2.action).toBe('retry-network');
    if (d2.action === 'retry-network') expect(d2.delayMs).toBe(2000);

    expect(getLiveTvRecoveryDelayMsExponential(1)).toBe(1000);
    expect(getLiveTvRecoveryDelayMsExponential(5)).toBe(16000);
  });

  it('navega ChannelUp/ChannelDown com wrap-around', () => {
    expect(getAdjacentLiveTvChannelIndex({ channelCount: 4, currentIndex: 1, direction: 1 })).toBe(
      2
    );
    expect(getAdjacentLiveTvChannelIndex({ channelCount: 4, currentIndex: 0, direction: -1 })).toBe(
      3
    );
    expect(getAdjacentLiveTvChannelIndex({ channelCount: 0, currentIndex: 0, direction: 1 })).toBe(
      -1
    );
  });

  it('respeita limites customizados para embeds antes de falhar', () => {
    expect(
      getLiveTvRecoveryDecision({
        errorType: 'networkError',
        networkRetries: 4,
        mediaRetries: 0,
        maxNetworkRetries: 5,
      }).action
    ).toBe('retry-network');

    expect(
      getLiveTvRecoveryDecision({
        errorType: 'networkError',
        networkRetries: 5,
        mediaRetries: 0,
        maxNetworkRetries: 5,
      }).action
    ).toBe('fail');
  });

  it('tratamento conservador para tipo de erro desconhecido', () => {
    expect(
      getLiveTvRecoveryDecision({
        errorType: 'unknownError',
        networkRetries: 0,
        mediaRetries: 0,
      }).action
    ).toBe('fail');
  });
});
