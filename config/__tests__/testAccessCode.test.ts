import { describe, expect, it } from 'vitest';
import {
  canUseTestAccessCode,
  isTestBuildChannel,
  shouldBlockProductionTestAccessCode,
  TEST_ACCESS_CODE,
} from '../testAccessCode';

describe('test access code guard', () => {
  it('mantem o codigo de teste esperado', () => {
    expect(TEST_ACCESS_CODE).toBe('000000');
  });

  it('permite o codigo 000000 em dev mesmo sem flag', () => {
    expect(
      canUseTestAccessCode({
        isDev: true,
        tvTestLoginEnabled: false,
        buildChannel: 'development',
      })
    ).toBe(true);
  });

  it('permite 000000 com VITE_TV_TEST_LOGIN em canal de teste', () => {
    expect(isTestBuildChannel('testing')).toBe(true);
    expect(
      canUseTestAccessCode({
        isDev: false,
        tvTestLoginEnabled: true,
        buildChannel: 'testing',
      })
    ).toBe(true);
  });

  it('bloqueia 000000 com VITE_TV_TEST_LOGIN em canal de producao', () => {
    expect(
      canUseTestAccessCode({
        isDev: false,
        tvTestLoginEnabled: true,
        buildChannel: 'production',
      })
    ).toBe(false);
  });

  it('bloqueia build final de producao com VITE_TV_TEST_LOGIN ligado por acidente', () => {
    expect(
      shouldBlockProductionTestAccessCode({
        isProductionBuild: true,
        tvTestLoginEnabled: true,
        buildChannel: 'production',
      })
    ).toBe(true);
  });
});
