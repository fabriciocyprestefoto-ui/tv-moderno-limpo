// Cypress global support file

beforeEach(() => {
  cy.clearCookies();
  cy.clearLocalStorage();
});
