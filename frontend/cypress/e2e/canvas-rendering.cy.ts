describe("Canvas Rendering", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("renders the React Flow canvas with background grid", () => {
    cy.get(".react-flow").should("exist");
    cy.get(".react-flow__background").should("exist");
  });

  it("renders all 7 default Pipeline nodes", () => {
    cy.assertNodeCount(7);
    const labels = [
      "Prompt Input",
      "Hidden State Cloud",
      "Feature Bars",
      "Persistence Diagram",
      "Confidence Gauge",
      "Bridge Monitor",
      "Explain Waterfall",
    ];
    labels.forEach((label) => {
      cy.getNode(label).should("be.visible");
    });
  });

  it("renders edges connecting prompt to all downstream nodes", () => {
    cy.get(".react-flow__edge").should("have.length.at.least", 6);
  });

  it("renders the MiniMap", () => {
    cy.get(".react-flow__minimap").should("exist");
  });

  it("renders the Controls (zoom/pan)", () => {
    cy.get(".react-flow__controls").should("exist");
    cy.get(".react-flow__controls-zoomin").should("exist");
    cy.get(".react-flow__controls-zoomout").should("exist");
    cy.get(".react-flow__controls-fitview").should("exist");
  });

  it("renders the node palette sidebar", () => {
    cy.get(".w-\\[180px\\]").should("exist");
    cy.contains("Node Palette").should("be.visible");
  });

  it("renders canvas controls toolbar", () => {
    cy.contains("button", "Save").should("exist");
    cy.contains("button", "Load").should("exist");
    cy.contains("button", "Log").should("exist");
    cy.contains("button", "Rolling").should("exist");
    cy.contains("button", "Baseline").should("exist");
    cy.contains("button", "Snapshot").should("exist");
  });

  it("renders version badge", () => {
    cy.contains("v1").should("be.visible");
  });

  it("nodes display correct labels with uppercase styling", () => {
    cy.getNode("Prompt Input")
      .find("span.uppercase")
      .first()
      .should("contain.text", "Prompt Input")
      .and(($el) => {
        expect(window.getComputedStyle($el[0]).textTransform).to.eq("uppercase");
      });
    cy.getNode("Bridge Monitor")
      .find("span.uppercase")
      .first()
      .should("contain.text", "Bridge Monitor");
  });

  it("VISUAL: Bridge Monitor title is not clipped", () => {
    cy.getNode("Bridge Monitor")
      .find("span.uppercase")
      .first()
      .then(($el) => {
        const el = $el[0];
        expect(el.scrollWidth).to.be.at.most(el.clientWidth + 2);
      });
  });
});
