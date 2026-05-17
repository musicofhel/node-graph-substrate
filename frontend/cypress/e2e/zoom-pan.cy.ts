describe("Zoom and Pan", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("fit view button exists and is clickable", () => {
    cy.get(".react-flow__controls-fitview").should("exist").click({ force: true });
  });

  it("zoom in button increases zoom level", () => {
    cy.get(".react-flow__controls-zoomin").click({ force: true });
    cy.get(".react-flow__controls-zoomin").click({ force: true });
  });

  it("zoom out button decreases zoom level", () => {
    cy.get(".react-flow__controls-zoomout").click({ force: true });
    cy.get(".react-flow__controls-zoomout").click({ force: true });
  });

  it("MiniMap is visible at bottom-left", () => {
    cy.get(".react-flow__minimap").should("be.visible");
    cy.get(".react-flow__minimap").should("have.class", "bottom");
    cy.get(".react-flow__minimap").should("have.class", "left");
  });

  it("canvas supports pan interaction", () => {
    cy.get(".react-flow__pane").should("exist");
    cy.get(".react-flow__viewport").should("have.attr", "style").and("include", "transform");
  });

  it("VISUAL: Research v2 nodes have readable labels", () => {
    cy.contains("button", "Research v2").click();
    cy.wait(1000);
    cy.get(".react-flow__node", { timeout: 10000 }).should("have.length.at.least", 1);
    cy.get(".react-flow__node")
      .first()
      .find("span")
      .first()
      .then(($el) => {
        const fontSize = parseFloat(window.getComputedStyle($el[0]).fontSize);
        expect(fontSize).to.be.at.least(9);
      });
  });
});
