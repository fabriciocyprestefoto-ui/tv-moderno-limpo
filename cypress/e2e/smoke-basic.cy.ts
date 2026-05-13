describe('Smoke Basic', () => {
  it('abre a home e renderiza a aplicação', () => {
    cy.visit('/');
    cy.get('body').should('be.visible');
    cy.get('#root').should('exist');
  });
});
