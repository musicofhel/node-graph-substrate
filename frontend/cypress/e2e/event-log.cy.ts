describe("Event Log", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("event log is hidden by default", () => {
    cy.get(".h-\\[250px\\]").should("not.exist");
  });

  it("clicking Log button opens the event log", () => {
    cy.openEventLog();
    cy.get(".h-\\[250px\\]").should("be.visible");
    cy.contains("No events yet").should("be.visible");
  });

  it("clicking Log button again closes the event log", () => {
    cy.openEventLog();
    cy.closeEventLog();
  });

  it("Log button shows active state when open", () => {
    cy.openEventLog();
    cy.contains("button", "Log").should("have.class", "bg-blue-700");
  });

  it("shows Pause/Resume toggle", () => {
    cy.openEventLog();
    cy.contains("button", "Pause").should("exist");
  });

  it("toggling Pause changes to Resume", () => {
    cy.openEventLog();
    cy.contains("button", "Pause").click();
    cy.contains("button", "Resume").should("exist");
    cy.contains("button", "Resume").click();
    cy.contains("button", "Pause").should("exist");
  });

  it("shows Clear button", () => {
    cy.openEventLog();
    cy.contains("button", "Clear").should("exist");
  });

  it("shows stream filter input", () => {
    cy.openEventLog();
    cy.get("input[placeholder='stream...']").should("exist");
  });

  it("shows node_id filter input", () => {
    cy.openEventLog();
    cy.get("input[placeholder='node_id...']").should("exist");
  });

  it("shows type filter select", () => {
    cy.openEventLog();
    cy.get(".h-\\[250px\\]").find("select").should("exist");
    cy.get(".h-\\[250px\\]").find("option").contains("all types");
  });

  it("displays event count", () => {
    cy.openEventLog();
    cy.contains("0/0").should("be.visible");
  });

  it("WS messages appear in log", () => {
    cy.openEventLog();
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:confidence_scored",
      node_id: "gauge-1",
      payload: { confidence: 0.85, mode: "standard" },
    });
    cy.wait(500);
    cy.contains("stream_event").should("exist");
    cy.contains("confidence_scored").should("exist");
  });

  it("Clear button removes all entries", () => {
    cy.openEventLog();
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:test",
      node_id: "gauge-1",
      payload: { confidence: 0.5 },
    });
    cy.wait(300);
    cy.get(".h-\\[250px\\]").contains("button", "Clear").click();
    cy.contains("No events yet").should("be.visible");
  });
});
