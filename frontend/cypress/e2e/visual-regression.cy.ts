describe("Visual Regression Checks", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("CRITICAL: Bridge Monitor label is fully visible within node bounds", () => {
    cy.getNode("Bridge Monitor")
      .find("span.uppercase")
      .first()
      .then(($span) => {
        const span = $span[0];
        const parent = span.closest(".react-flow__node");
        if (parent) {
          const spanRect = span.getBoundingClientRect();
          const parentRect = parent.getBoundingClientRect();
          expect(spanRect.left).to.be.at.least(parentRect.left - 1);
          expect(spanRect.right).to.be.at.most(parentRect.right + 1);
        }
        expect(span.scrollWidth).to.be.at.most(span.clientWidth + 2);
      });
  });

  it("MINOR: Feature bar labels show meaningful text", () => {
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:features_computed",
      node_id: "features-1",
      payload: {
        features: {
          H0_persistence_entropy: 0.45,
          H1_max_lifetime: 0.72,
          bridge_silhouette: 0.63,
          topological_sensitivity: 0.88,
        },
      },
    });
    cy.getNode("Feature Bars")
      .should("contain.text", "0.45")
      .find(".truncate")
      .should("have.length.at.least", 1)
      .first()
      .invoke("text")
      .should("have.length.greaterThan", 3);
  });

  it("all node types render without error boundaries", () => {
    cy.contains("Something went wrong").should("not.exist");
    cy.contains("Error").should("not.exist");

    cy.contains("button", "Research").first().click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.contains("Something went wrong").should("not.exist");

    cy.contains("button", "Research v2").click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.contains("Something went wrong").should("not.exist");
  });

  it("split pane divider is visible when paper pool shown", () => {
    cy.get("[class*='cursor-row-resize']").should("exist");
  });

  it("node palette does not overlap canvas content", () => {
    cy.get(".w-\\[180px\\]").then(($palette) => {
      const paletteRect = $palette[0].getBoundingClientRect();
      cy.get(".react-flow").then(($canvas) => {
        const canvasRect = $canvas[0].getBoundingClientRect();
        expect(canvasRect.left).to.be.at.least(paletteRect.right - 1);
      });
    });
  });
});
