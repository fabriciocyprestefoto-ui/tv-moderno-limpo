function seedAuthAndProfile(win: Window): void {
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
  const userId = 'local-access-E2E000';

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
}

describe('Shell Navigation', () => {
  beforeEach(() => {
    cy.viewport(1366, 768);
    cy.visit('/', {
      onBeforeLoad(win) {
        seedAuthAndProfile(win);
      },
    });
  });

  it('renderiza o shell com itens de navegação TV', () => {
    cy.get('[data-nav-item]', { timeout: 30000 }).should('exist');
    cy.get('[data-cy="nav-live"]', { timeout: 30000 }).should('exist');
  });

  it('abre Canais pelo menu lateral', () => {
    cy.get('[data-cy="nav-live"]', { timeout: 30000 }).click({ force: true });
    cy.location({ timeout: 30000 }).should((location) => {
      expect(
        location.pathname === '/canais' || location.hash.includes('/canais'),
        `rota atual: ${location.pathname}${location.hash}`
      ).to.equal(true);
    });
  });
});
