describe("Detail Panel", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
    cy.clickNode("Confidence Gauge");
  });

  describe("Tab Navigation", () => {
    it("shows Overview tab by default", () => {
      cy.get(".w-\\[420px\\]")
        .find("button")
        .contains("Overview")
        .should("have.class", "border-b-2");
    });

    it("switches to Series tab", () => {
      cy.detailTab("Series");
      cy.get(".w-\\[420px\\]")
        .find("button")
        .contains("Series")
        .should("have.class", "border-b-2");
    });

    it("switches to Config tab", () => {
      cy.detailTab("Config");
      cy.get(".w-\\[420px\\]").contains("Low Threshold");
    });

    it("switches to Drift tab", () => {
      cy.detailTab("Drift");
      cy.get(".w-\\[420px\\]").contains("Collecting samples");
    });
  });

  describe("Overview Tab Content", () => {
    it("Confidence Gauge overview shows dash when no data", () => {
      cy.get(".w-\\[420px\\]").contains("—");
    });

    it("Prompt Input overview shows idle status", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Prompt Input");
      cy.get(".w-\\[420px\\]").contains("idle");
    });

    it("Bridge Monitor overview shows waiting state", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Bridge Monitor");
      cy.get(".w-\\[420px\\]").contains("—");
    });

    it("Feature Bars overview shows no data state", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Feature Bars");
      cy.get(".w-\\[420px\\]").contains("No feature data");
    });
  });

  describe("Config Tab", () => {
    it("renders slider config fields for Confidence Gauge", () => {
      cy.detailTab("Config");
      cy.get(".w-\\[420px\\]").contains("Low Threshold");
      cy.get(".w-\\[420px\\]").contains("High Threshold");
      cy.get(".w-\\[420px\\]").find("input[type='range']").should("have.length.at.least", 2);
    });

    it("renders checkbox config field for Confidence Gauge", () => {
      cy.detailTab("Config");
      cy.get(".w-\\[420px\\]").contains("Alerts");
      cy.get(".w-\\[420px\\]").find("input[type='checkbox']").should("exist");
    });

    it("renders select config fields for Feature Bars", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Feature Bars");
      cy.detailTab("Config");
      cy.get(".w-\\[420px\\]").contains("Normalization");
      cy.get(".w-\\[420px\\]").find("select").should("have.length.at.least", 1);
    });

    it("changing a checkbox updates state", () => {
      cy.detailTab("Config");
      cy.get(".w-\\[420px\\]")
        .find("input[type='checkbox']")
        .first()
        .click();
    });

    it("Prompt Input config shows text field", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Prompt Input");
      cy.detailTab("Config");
      cy.get(".w-\\[420px\\]").contains("Prompt");
      cy.get(".w-\\[420px\\]").find("textarea").should("exist");
    });
  });

  describe("Drift Tab", () => {
    it("shows not applicable for Prompt Input", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Prompt Input");
      cy.detailTab("Drift");
      cy.get(".w-\\[420px\\]").contains("not applicable");
    });

    it("shows sample count progress for applicable nodes", () => {
      cy.detailTab("Drift");
      cy.get(".w-\\[420px\\]").contains("Collecting samples (0/20 minimum)");
    });

    it("shows not applicable for Explain Waterfall", () => {
      cy.clickPaneToDeselect();
      cy.clickNode("Explain Waterfall");
      cy.detailTab("Drift");
      cy.get(".w-\\[420px\\]").contains("not applicable");
    });
  });
});
