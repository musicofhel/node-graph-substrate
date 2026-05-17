describe("Canvas Controls", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("Save button is disabled when not dirty", () => {
    cy.contains("button", "Save").should("be.disabled");
  });

  it("Save button enables after modifying canvas", () => {
    cy.contains("button", "Save").should("be.disabled");
    cy.get(".w-\\[180px\\]").contains("button", "Prompt Input").click();
    cy.get(".react-flow__node", { timeout: 5000 }).should("have.length.at.least", 8);
    cy.contains("button", "Save").should("not.be.disabled");
  });

  it("clicking Save sends PATCH to /api/graphs/*/ops", () => {
    cy.get(".w-\\[180px\\]").contains("button", "Prompt Input").click();
    cy.wait(300);
    cy.contains("button", "Save").click();
    cy.wait("@saveOps");
  });

  it("Load button exists and is clickable", () => {
    cy.contains("button", "Load").should("exist").and("not.be.disabled");
  });

  it("Layout button exists and is clickable", () => {
    cy.contains("button", "Layout").should("exist").and("not.be.disabled");
  });

  it("Layout button is hidden on Research canvas", () => {
    cy.contains("button", "Research").first().click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.contains("button", "Layout").should("not.exist");
  });

  it("Rolling/Baseline toggle buttons switch drift mode", () => {
    cy.contains("button", "Rolling").should("have.class", "bg-blue-700");
    cy.contains("button", "Baseline").click();
    cy.contains("button", "Baseline").should("have.class", "bg-blue-700");
    cy.contains("button", "Rolling").should("not.have.class", "bg-blue-700");
  });

  it("Snapshot button exists and is clickable", () => {
    cy.contains("button", "Snapshot").should("exist");
    cy.contains("button", "Snapshot").click();
  });

  it("version badge shows current version", () => {
    cy.contains("v1").should("be.visible");
  });

  it("Flush button appears only on Research v2", () => {
    cy.contains("button", "Flush").should("not.exist");
    cy.contains("button", "Research v2").click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.contains("button", "Flush").should("exist");
  });

  it("Log button toggles event log", () => {
    cy.contains("button", "Log").click();
    cy.get(".h-\\[250px\\]").should("exist");
    cy.contains("button", "Log").click();
    cy.get(".h-\\[250px\\]").should("not.exist");
  });
});
