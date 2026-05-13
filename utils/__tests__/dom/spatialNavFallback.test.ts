import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isElementFocusable, getDirectionalTarget } from '../../spatialNavFallback';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEl(
  overrides: Partial<{
    disabled: boolean;
    ariaHidden: string;
    tabIndex: number;
    display: string;
    visibility: string;
    rect: Partial<DOMRect>;
    tagName: string;
  }> = {}
): HTMLElement {
  const el = document.createElement(overrides.tagName ?? 'button');

  if (overrides.disabled) el.setAttribute('disabled', '');
  if (overrides.ariaHidden) el.setAttribute('aria-hidden', overrides.ariaHidden);
  if (overrides.tabIndex !== undefined) el.tabIndex = overrides.tabIndex;

  const rect = {
    left: 0,
    top: 0,
    right: 100,
    bottom: 50,
    width: 100,
    height: 50,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...overrides.rect,
  } as DOMRect;

  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rect);

  const style = {
    display: 'block',
    visibility: 'visible',
    ...(() => {
      const s: Record<string, string> = {};
      if (overrides.display) s.display = overrides.display;
      if (overrides.visibility) s.visibility = overrides.visibility;
      return s;
    })(),
  };

  vi.spyOn(window, 'getComputedStyle').mockReturnValue(style as CSSStyleDeclaration);

  return el;
}

// ── isElementFocusable ────────────────────────────────────────────────────────

describe('isElementFocusable', () => {
  it('retorna true para botão normal visível', () => {
    const el = makeEl();
    expect(isElementFocusable(el)).toBe(true);
  });

  it('retorna false para elemento disabled', () => {
    const el = makeEl({ disabled: true });
    expect(isElementFocusable(el)).toBe(false);
  });

  it('retorna false para aria-hidden="true"', () => {
    const el = makeEl({ ariaHidden: 'true' });
    expect(isElementFocusable(el)).toBe(false);
  });

  it('retorna false para tabIndex negativo', () => {
    const el = makeEl({ tabIndex: -1 });
    expect(isElementFocusable(el)).toBe(false);
  });

  it('retorna false para display: none', () => {
    const el = makeEl({ display: 'none' });
    expect(isElementFocusable(el)).toBe(false);
  });

  it('retorna false para visibility: hidden', () => {
    const el = makeEl({ visibility: 'hidden' });
    expect(isElementFocusable(el)).toBe(false);
  });

  it('retorna false para elemento com width=0', () => {
    const el = makeEl({ rect: { width: 0, height: 50 } });
    expect(isElementFocusable(el)).toBe(false);
  });

  it('retorna false se não for HTMLElement', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(isElementFocusable(svg)).toBe(false);
  });
});

// ── getDirectionalTarget ──────────────────────────────────────────────────────

describe('getDirectionalTarget', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  function addNavItem(rect: Partial<DOMRect>): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.setAttribute('data-nav-item', '');
    const fullRect = {
      left: 0,
      top: 0,
      right: 100,
      bottom: 50,
      width: 100,
      height: 50,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect;
    vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue(fullRect);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      display: 'block',
      visibility: 'visible',
    } as CSSStyleDeclaration);
    container.appendChild(btn);
    return btn;
  }

  it('retorna null quando não há candidatos', () => {
    const current = addNavItem({ left: 100, top: 100, width: 100, height: 50 });
    expect(getDirectionalTarget(current, 'right')).toBeNull();
  });

  it('encontra o elemento à direita', () => {
    const current = addNavItem({ left: 0, top: 0, width: 100, height: 50 });
    const right = addNavItem({ left: 200, top: 0, width: 100, height: 50 });
    addNavItem({ left: 0, top: 200, width: 100, height: 50 }); // abaixo — não deve ser escolhido

    const result = getDirectionalTarget(current, 'right');
    expect(result).toBe(right);
  });

  it('encontra o elemento acima', () => {
    const current = addNavItem({ left: 0, top: 200, width: 100, height: 50 });
    const above = addNavItem({ left: 0, top: 0, width: 100, height: 50 });
    addNavItem({ left: 0, top: 400, width: 100, height: 50 }); // abaixo — não deve ser escolhido

    const result = getDirectionalTarget(current, 'up');
    expect(result).toBe(above);
  });

  it('prefere elemento alinhado à esquerda sobre desalinhado ao ir para baixo', () => {
    // current: centro em (150, 25)
    const current = addNavItem({ left: 100, top: 0, width: 100, height: 50 });
    // aligned: centro em (150, 225) — alinhado
    const aligned = addNavItem({ left: 100, top: 200, width: 100, height: 50 });
    // offset: centro em (350, 225) — desalinhado
    addNavItem({ left: 300, top: 200, width: 100, height: 50 });

    const result = getDirectionalTarget(current, 'down');
    expect(result).toBe(aligned);
  });

  it('retorna null quando o único candidato está na direção oposta', () => {
    const current = addNavItem({ left: 200, top: 0, width: 100, height: 50 });
    addNavItem({ left: 0, top: 0, width: 100, height: 50 }); // à esquerda

    expect(getDirectionalTarget(current, 'right')).toBeNull();
  });
});
