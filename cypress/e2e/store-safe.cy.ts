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
          id: 'e2e-store-movie-1',
          title: 'Filme Store Safe',
          type: 'movie',
          year: 2026,
          genre: ['Ação'],
          platform: 'Netflix',
          poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
          backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
          stream_url: sampleVideo,
          rating: '8.5',
          description: 'Conteúdo local usado pelo Cypress no build store-safe.',
        },
      ],
      series: [],
    })
  );
}

describe('Store-safe build', () => {
  beforeEach(() => {
    cy.viewport(1366, 768);
  });

  it('remove a entrada Adulto do menu lateral', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        seedAuthAndProfile(win);
      },
    });

    cy.get('[data-nav-sidebar] [data-nav-item]', { timeout: 30000 }).should('exist');
    cy.get('[data-nav-sidebar] [aria-label="Adulto"]').should('not.exist');
    cy.contains('[data-nav-sidebar]', 'Adulto').should('not.exist');
  });

  it('bloqueia acesso direto a /adulto sem montar AdultoPage', () => {
    cy.visit('/adulto', {
      onBeforeLoad(win) {
        seedAuthAndProfile(win);
      },
    });

    cy.get('body', { timeout: 30000 }).should('be.visible');
    cy.document().its('documentElement').should('not.have.attr', 'data-page', 'adulto');
    cy.contains(/canais adultos/i).should('not.exist');
    cy.window().then((win) => {
      expect((win as Window & { __adultoActive?: boolean }).__adultoActive).to.not.equal(true);
    });
    cy.get('[data-nav-sidebar] [aria-label="Adulto"]').should('not.exist');
  });
});
