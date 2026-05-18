describe("Paper Pool", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
    cy.contains("button", "Research").first().click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.contains("button", "Papers", { timeout: 5000 }).click();
    cy.get("[class*='cursor-row-resize']", { timeout: 5000 }).should("exist");
  });

  it("paper pool appears when linkforge history has data", () => {
    cy.get("[class*='cursor-row-resize']").should("exist");
  });

  it("renders paper cards with title text", () => {
    cy.contains("Graph Neural Networks").should("exist");
  });

  it("renders paper score indicators", () => {
    cy.get("[class*='h-1\\.5'][class*='w-8'][class*='rounded-full']").should(
      "have.length.at.least",
      1
    );
  });

  it("renders category badges on paper cards", () => {
    cy.contains("machine_learning").should("exist");
  });

  it("category filter dropdown exists", () => {
    cy.get("select").contains("All categories").should("exist");
  });

  it("sort dropdown has expected options", () => {
    cy.get("select").contains("Recent").should("exist");
  });

  it("search input exists and filters papers", () => {
    cy.get("input[placeholder='Search...']").should("exist");
    cy.get("input[placeholder='Search...']").type("Topological");
    cy.wait(300);
    cy.contains("Topological Data Analysis").should("exist");
  });

  it("Research checkbox exists", () => {
    cy.contains("Research").should("exist");
    cy.get("input[type='checkbox']").should("exist");
  });

  it("clicking a paper card shows detail", () => {
    cy.contains("Graph Neural Networks").click();
    cy.wait(500);
    cy.contains("Select a paper").should("not.exist");
  });

  it("shows failed paper indicator", () => {
    cy.contains("failed").should("exist");
  });

  it("VISUAL: paper card titles have meaningful content", () => {
    cy.get("[class*='truncate']")
      .filter(":contains('Graph Neural')")
      .first()
      .then(($el) => {
        expect($el.text().length).to.be.greaterThan(10);
      });
  });
});
