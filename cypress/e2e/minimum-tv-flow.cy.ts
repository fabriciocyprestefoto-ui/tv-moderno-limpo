function seedAuthAndProfile(win: Window): void {
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

  win.localStorage.setItem(
    'redx-catalog-cache-v9',
    JSON.stringify({
      timestamp: Date.now(),
      movies: [
        {
          id: 'e2e-movie-1',
          title: 'Filme E2E',
          type: 'movie',
          year: 2026,
          genre: ['Ação'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
          stream_url: sampleVideo,
          rating: '8.5',
          description: 'Conteúdo local usado pelo Cypress para validar o fluxo crítico.',
        },
      ],
      series: [],
    })
  );
}

describe('TV Critical Flows', () => {
  beforeEach(() => {
    cy.viewport(1366, 768);
  });

  it('Home -> Details -> Assistir -> Voltar', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        seedAuthAndProfile(win);
      },
    });

    cy.get('[data-nav-item]', { timeout: 30000 }).should('exist');

    cy.get('[data-nav-media-card], [data-nav-poster-card]')
      .first()
      .click({ force: true });

    cy.contains(/assistir/i, { timeout: 30000 }).should('be.visible').click({ force: true });

    cy.get('video, [data-player-control]', { timeout: 30000 }).should('exist');

    cy.get('body').trigger('keydown', { key: 'Backspace' });
    cy.contains(/assistir|minha lista|detalhes/i, { timeout: 30000 }).should('exist');
  });

  it('Live TV abre e volta para fora de /canais', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        seedAuthAndProfile(win);
      },
    });

    cy.get('[data-cy="nav-live"]', { timeout: 30000 }).click({ force: true });

    cy.location({ timeout: 30000 }).should((location) => {
      expect(
        location.pathname === '/canais' || location.hash.includes('/canais'),
        `rota atual: ${location.pathname}${location.hash}`
      ).to.equal(true);
    });

    cy.get('video, [id^="chan-"]', { timeout: 30000 }).should('exist');
    cy.get('body').trigger('keydown', { key: 'Backspace' });

    cy.location({ timeout: 30000 }).should((location) => {
      expect(
        location.pathname === '/canais' || location.hash.includes('/canais'),
        `rota atual: ${location.pathname}${location.hash}`
      ).to.equal(false);
    });
  });

  it('ErrorBoundary global mostra ações de recuperação', () => {
    cy.visit('/?redx_e2e_throw=1');

    cy.get('[role="alert"]', { timeout: 30000 }).should('be.visible');
    cy.contains(/erro inesperado|algo deu errado/i, { timeout: 30000 }).should('be.visible');
    cy.contains('button', /ir para início|recarregar/i, { timeout: 30000 }).should('be.visible');
  });
});
