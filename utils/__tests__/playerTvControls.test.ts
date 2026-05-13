import { describe, expect, it } from 'vitest';
import { getNextResumeAction, getPlayerSettingsOptionsCount } from '../playerTvControls';

describe('player TV controls', () => {
  it('inclui AUTO na contagem de qualidades', () => {
    expect(getPlayerSettingsOptionsCount('quality', { qualities: 3 })).toBe(4);
  });

  it('retorna 0 para panel=none', () => {
    expect(getPlayerSettingsOptionsCount('none', { qualities: 3 })).toBe(0);
  });

  it('aceita 0 qualidades e mantém opção AUTO', () => {
    expect(getPlayerSettingsOptionsCount('quality', { qualities: 0 })).toBe(1);
  });

  it('alterna a acao do overlay de retomada com D-pad horizontal', () => {
    expect(getNextResumeAction('continue', 'ArrowRight')).toBe('restart');
    expect(getNextResumeAction('restart', 'ArrowLeft')).toBe('continue');
    expect(getNextResumeAction('continue', 'ArrowUp')).toBe('continue');
    expect(getNextResumeAction('restart', 'Escape')).toBe('restart');
  });
});
