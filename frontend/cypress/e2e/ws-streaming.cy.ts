describe("WebSocket Streaming", () => {
  beforeEach(() => {
    cy.stubDefaultApi();
    cy.visit("/");
    cy.waitForCanvas();
  });

  it("confidence gauge updates when stream_event arrives", () => {
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:confidence_scored",
      node_id: "gauge-1",
      payload: { confidence: 0.82, mode: "standard" },
    });
    cy.getNode("Confidence Gauge").should("contain.text", "82");
  });

  it("feature bars populate when features_computed arrives", () => {
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:features_computed",
      node_id: "features-1",
      payload: {
        features: {
          H0_persistence_entropy: 0.45,
          H1_max_lifetime: 0.72,
          H0_total_persistence: 0.33,
          H0_n_features: 0.21,
          H1_persistence_entropy: 0.56,
          H1_n_features: 0.18,
          H2_n_features: 0.09,
          H2_total_persistence: 0.14,
          H2_persistence_entropy: 0.07,
          bridge_silhouette: 0.63,
          H0_ph_significance: 0.41,
          H1_ph_significance: 0.38,
          topological_sensitivity: 0.88,
        },
      },
    });
    cy.getNode("Feature Bars").should("contain.text", "0.45");
  });

  it("bridge monitor shows HEALTHY status", () => {
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:bridge_health",
      node_id: "monitor-1",
      payload: {
        healthy: true,
        crystallization: 0.92,
        bridge_at_pos0: { "0": true, "1": false, "2": true },
        silhouette_by_layer: { "0": 0.45, "1": 0.32, "2": 0.67 },
      },
    });
    cy.getNode("Bridge Monitor").should("contain.text", "HEALTHY");
  });

  it("bridge monitor shows ANOMALY state", () => {
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:bridge_health",
      node_id: "monitor-1",
      payload: {
        healthy: false,
        crystallization: 0.3,
        anomaly_reason: "Low silhouette score",
        bridge_at_pos0: { "0": false },
        silhouette_by_layer: { "0": 0.1 },
      },
    });
    cy.getNode("Bridge Monitor").should("contain.text", "ANOMALY");
  });

  it("detail panel overview updates with live data", () => {
    cy.clickNode("Confidence Gauge");
    cy.sendWsMessage({
      type: "stream_event",
      stream: "topoconf:scoring:confidence_scored",
      node_id: "gauge-1",
      payload: { confidence: 0.91, mode: "heuristic" },
    });
    cy.get(".w-\\[420px\\]").should("contain.text", "91");
  });

  it("multiple rapid messages do not crash the app", () => {
    for (let i = 0; i < 10; i++) {
      cy.sendWsMessage({
        type: "stream_event",
        stream: "topoconf:scoring:confidence_scored",
        node_id: "gauge-1",
        payload: { confidence: 0.5 + i * 0.05, mode: "standard" },
      });
    }
    cy.wait(1000);
    cy.getNode("Confidence Gauge").should("exist");
  });
});
