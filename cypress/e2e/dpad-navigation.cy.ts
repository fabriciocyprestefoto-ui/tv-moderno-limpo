function seedAuthProfileAndCatalog(win: Window): void {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  const userId = 'local-access-E2E000';
  const sampleVideo =
    'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

  win.localStorage.setItem(
    'redx-local-auth-session-v1',
    JSON.stringify({
      mode: 'access_code',
      userId,
      email: 'viewer@redx.local',
      displayName: 'E2E Viewer',
      isAdmin: false,
      issuedAt,
      expiresAt,
      accessCode: 'E2E000',
    })
  );

  win.localStorage.setItem(`redx-profile-selected:${userId}`, '1');
  win.localStorage.setItem(
    'redx-active-profile',
    JSON.stringify({
      id: 'e2e-profile-1',
      name: 'E2E',
      avatar: 'https://i.pravatar.cc/120?img=8',
      isKids: false,
      created_at: issuedAt,
      updated_at: issuedAt,
    })
  );

  const movies = Array.from({ length: 8 }, (_, index) => ({
    id: `e2e-dpad-movie-${index + 1}`,
    title: `Filme D-pad ${index + 1}`,
    type: 'movie',
    year: 2026,
    genre: ['Ação'],
    platform: index % 2 === 0 ? 'Netflix' : 'Prime Video',
    poster:
      index % 2 === 0
        ? 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'
        : 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    backdrop:
      index % 2 === 0
        ? 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg'
        : 'https://image.tmdb.org/t/p/w1280/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg',
    stream_url: sampleVideo,
    rating: '8.5',
    description: 'Conteúdo local usado pelo Cypress para validar navegação D-pad.',
  }));

  win.localStorage.setItem(
    'redx-catalog-cache-v9',
    JSON.stringify({
      timestamp: Date.now(),
      movies,
      series: [],
    })
  );
}

function dispatchKey(win: Window, target: Element | Window, key: string): void {
  const keyCodes: Record<string, number> = {
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Enter: 13,
    Backspace: 8,
  };
  target.dispatchEvent(
    new win.KeyboardEvent('keydown', {
      key,
      code: key,
      keyCode: keyCodes[key],
      which: keyCodes[key],
      bubbles: true,
      cancelable: true,
    } as KeyboardEventInit)
  );
}

describe('D-pad Navigation', () => {
  beforeEach(() => {
    cy.viewport(1366, 768);
    cy.visit('/', {
      onBeforeLoad(win) {
        seedAuthProfileAndCatalog(win);
      },
    });
    cy.get('[data-nav-media-card], [data-nav-poster-card]', { timeout: 30000 }).should('exist');
    cy.wait(1500);
  });

  it('navega verticalmente no menu lateral com setas do controle remoto', () => {
    cy.window().then((win) => {
      win.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
    });
    cy.get('[data-nav-sidebar] [data-nav-item]').first().focus();
    cy.focused().should('have.attr', 'aria-label', 'Início');

    cy.focused().then(($el) => {
      cy.window().then((win) => dispatchKey(win, $el[0], 'ArrowDown'));
    });
    cy.wait(220);
    cy.focused().should('have.attr', 'aria-label', 'Gêneros');

    cy.get('[data-nav-sidebar] [aria-label="Gêneros"]').should('be.focused');
  });
});
