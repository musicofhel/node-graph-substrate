describe("Tab Bar", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("renders all 3 tabs: Pipeline, Research, Research v2", () => {
    cy.contains("button", "Pipeline").should("exist");
    cy.contains("button", "Research").should("exist");
    cy.contains("button", "Research v2").should("exist");
  });

  it("highlights the active tab", () => {
    cy.contains("button", "Pipeline").should("have.class", "bg-neutral-800");
  });

  it("switches to Research canvas", () => {
    cy.contains("button", "Research").first().click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.getNode("Research Bridge").should("exist");
  });

  it("switches to Research v2 canvas", () => {
    cy.contains("button", "Research v2").click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
  });

  it("switches back to Pipeline from Research", () => {
    cy.contains("button", "Research").first().click();
    cy.wait(500);
    cy.contains("button", "Pipeline").click();
    cy.wait(500);
    cy.getNode("Prompt Input").should("exist");
  });

  it("shows the new graph (+) button", () => {
    cy.get("button[title='New graph']").should("exist");
  });

  it("creates a new graph when clicking +", () => {
    cy.get("button[title='New graph']").click();
    cy.wait("@createGraph");
  });

  it("palette changes per canvas type", () => {
    cy.contains("Prompt Input").should("exist");
    cy.contains("Feature Bars").should("exist");

    cy.contains("button", "Research").first().click();
    cy.wait(1000);
    cy.contains("Research Bridge").should("exist");
  });

  it("inactive tabs have muted text", () => {
    cy.contains("button", "Research")
      .first()
      .should("have.class", "text-neutral-400");
  });
});
