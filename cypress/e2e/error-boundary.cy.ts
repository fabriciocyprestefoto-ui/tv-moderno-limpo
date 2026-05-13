describe('Error Boundary', () => {
  it('mostra fallback global quando ocorre erro de render raiz', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('redx-e2e-throw-root', '1');
      },
    });

    cy.get('[role="alert"]', { timeout: 30000 }).should('be.visible');
    cy.contains(/erro inesperado|algo deu errado/i, { timeout: 30000 }).should('be.visible');
    cy.contains('button', /ir para início|recarregar/i, { timeout: 30000 }).should('be.visible');
  });
});
