describe("Prompt Input Node", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("renders textarea with placeholder", () => {
    cy.get("textarea[placeholder='Enter prompt...']").should("exist");
  });

  it("renders Analyze button", () => {
    cy.getNode("Prompt Input").contains("button", "Analyze").should("exist");
  });

  it("Analyze button is disabled when textarea is empty", () => {
    cy.getNode("Prompt Input")
      .contains("button", "Analyze")
      .should("have.class", "disabled:opacity-50");
  });

  it("typing text enables the Analyze button", () => {
    cy.get("textarea[placeholder='Enter prompt...']").type("What is consciousness?");
    cy.getNode("Prompt Input")
      .contains("button", "Analyze")
      .should("not.be.disabled");
  });

  it("clicking Analyze changes button text", () => {
    cy.get("textarea[placeholder='Enter prompt...']").type("Test prompt");
    cy.getNode("Prompt Input").contains("button", "Analyze").click();
    cy.getNode("Prompt Input").contains("Analyzing...").should("exist");
  });

  it("receiving computation_result resets button to Analyze", () => {
    cy.get("textarea[placeholder='Enter prompt...']").type("Test prompt");
    cy.getNode("Prompt Input").contains("button", "Analyze").click();
    cy.sendWsMessage({
      type: "computation_result",
      node_id: "prompt-1",
      ok: true,
      outputs: { features: { H0_persistence_entropy: 0.5 } },
    });
    cy.wait(500);
    cy.getNode("Prompt Input").contains("button", "Analyze").should("exist");
  });

  it("failed computation shows error state", () => {
    cy.get("textarea[placeholder='Enter prompt...']").type("Test prompt");
    cy.getNode("Prompt Input").contains("button", "Analyze").click();
    cy.sendWsMessage({
      type: "computation_result",
      node_id: "prompt-1",
      ok: false,
    });
    cy.wait(500);
    cy.getNode("Prompt Input").find(".bg-red-500").should("exist");
  });
});
