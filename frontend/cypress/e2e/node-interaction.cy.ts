describe("Node Interaction", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("clicking a node opens the detail panel", () => {
    cy.clickNode("Confidence Gauge");
    cy.get(".w-\\[420px\\]").should("be.visible");
    cy.get(".w-\\[420px\\]").contains("Confidence Gauge");
    cy.get(".w-\\[420px\\]").contains("scoring");
  });

  it("clicking the canvas pane closes the detail panel", () => {
    cy.clickNode("Feature Bars");
    cy.get(".w-\\[420px\\]").should("exist");
    cy.clickPaneToDeselect();
  });

  it("pressing Escape closes the detail panel", () => {
    cy.clickNode("Feature Bars");
    cy.get(".w-\\[420px\\]").should("exist");
    cy.get("body").type("{esc}");
    cy.get(".w-\\[420px\\]").should("not.exist");
  });

  it("clicking a different node switches the detail panel", () => {
    cy.clickNode("Confidence Gauge");
    cy.get(".w-\\[420px\\]").contains("Confidence Gauge");
    cy.getNode("Bridge Monitor").click({ force: true });
    cy.get(".w-\\[420px\\]").contains("Bridge Monitor");
  });

  it("selected node shows resize handles", () => {
    cy.clickNode("Confidence Gauge");
    cy.get(".react-flow__node")
      .contains("Confidence Gauge")
      .closest(".react-flow__node")
      .find(".react-flow__resize-control")
      .should("exist");
  });

  it("adding a node from palette creates it on canvas", () => {
    cy.get(".react-flow__node").its("length").then((initialCount) => {
      cy.get(".w-\\[180px\\]").contains("button", "Prompt Input").click();
      cy.get(".react-flow__node").should("have.length", initialCount + 1);
    });
  });

  it("deleting a node with Delete key removes it", () => {
    cy.get(".react-flow__node").its("length").then((initialCount) => {
      cy.getNode("Explain Waterfall").click({ force: true });
      cy.wait(200);
      cy.get("body").trigger("keydown", { key: "Backspace", code: "Backspace", keyCode: 8 });
      cy.get(".react-flow__node", { timeout: 5000 }).should("have.length", initialCount - 1);
    });
  });
});
