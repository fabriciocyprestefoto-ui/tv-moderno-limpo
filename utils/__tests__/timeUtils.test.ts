import { describe, it, expect } from 'vitest';
import { formatMediaTime } from '../timeUtils';

describe('formatMediaTime', () => {
  it('retorna 0:00 para 0', () => {
    expect(formatMediaTime(0)).toBe('0:00');
  });

  it('formata segundos menores que 1 minuto', () => {
    expect(formatMediaTime(5)).toBe('0:05');
    expect(formatMediaTime(59)).toBe('0:59');
  });

  it('formata minutos sem hora', () => {
    expect(formatMediaTime(60)).toBe('1:00');
    expect(formatMediaTime(90)).toBe('1:30');
    expect(formatMediaTime(3599)).toBe('59:59');
  });

  it('formata com hora quando >= 3600', () => {
    expect(formatMediaTime(3600)).toBe('1:00:00');
    expect(formatMediaTime(3661)).toBe('1:01:01');
    expect(formatMediaTime(7384)).toBe('2:03:04');
  });

  it('retorna 0:00 para NaN', () => {
    expect(formatMediaTime(NaN)).toBe('0:00');
  });

  it('retorna 0:00 para Infinity', () => {
    expect(formatMediaTime(Infinity)).toBe('0:00');
  });

  it('retorna 0:00 para negativo', () => {
    expect(formatMediaTime(-1)).toBe('0:00');
    expect(formatMediaTime(-3600)).toBe('0:00');
  });

  it('trunca frações de segundo (não arredonda)', () => {
    expect(formatMediaTime(1.9)).toBe('0:01');
    expect(formatMediaTime(59.999)).toBe('0:59');
  });
});
