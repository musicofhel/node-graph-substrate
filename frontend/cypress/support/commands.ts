import { installWsMock, sendWsMessage } from "./ws-mock";

declare global {
  namespace Cypress {
    interface Chainable {
      stubDefaultApi(): Chainable<void>;
      waitForCanvas(): Chainable<void>;
      getNode(label: string): Chainable<JQuery<HTMLElement>>;
      clickNode(label: string): Chainable<void>;
      clickPaneToDeselect(): Chainable<void>;
      switchTab(name: string): Chainable<void>;
      detailTab(name: string): Chainable<void>;
      openEventLog(): Chainable<void>;
      closeEventLog(): Chainable<void>;
      assertNodeCount(n: number): Chainable<void>;
      assertTextNotTruncated(selector: string): Chainable<void>;
      sendWsMessage(msg: Record<string, unknown>): Chainable<void>;
    }
  }
}

Cypress.Commands.add("stubDefaultApi", () => {
  cy.intercept("POST", "**/api/projects", { fixture: "project.json" }).as("createProject");
  cy.intercept("GET", "**/api/projects/*/graphs", { fixture: "project-graphs.json" }).as("getGraphs");
  cy.intercept("GET", "**/api/graphs/test-pipeline-graph", { fixture: "pipeline-graph.json" }).as("getPipelineGraph");
  cy.intercept("GET", "**/api/graphs/test-research-graph", { fixture: "research-graph.json" }).as("getResearchGraph");
  cy.intercept("GET", "**/api/graphs/test-research2-graph", { fixture: "research2-graph.json" }).as("getResearch2Graph");
  cy.intercept("GET", "**/api/graphs/test-new-graph", { fixture: "new-graph.json" }).as("getNewGraph");
  cy.intercept("PATCH", "**/api/graphs/*/ops", { statusCode: 200, body: { version: 2 } }).as("saveOps");
  cy.intercept("PATCH", "**/api/graphs/*", { statusCode: 200, body: {} }).as("patchGraph");
  cy.intercept("POST", "**/api/graphs", { fixture: "new-graph.json" }).as("createGraph");
  cy.intercept("GET", "**/api/linkforge/history*", { fixture: "paper-pool.json" }).as("getPapers");
  cy.intercept("GET", "**/api/linkforge/paper/*", { fixture: "paper-detail.json" }).as("getPaperDetail");
  cy.intercept("GET", "**/health", { statusCode: 200, body: { status: "ok" } }).as("health");

  cy.on("window:before:load", (win) => {
    installWsMock(win);
    win.localStorage.setItem("substrate:lastGraphId", "test-pipeline-graph");
  });
});

Cypress.Commands.add("waitForCanvas", () => {
  cy.get(".react-flow__pane", { timeout: 15000 }).should("exist");
  cy.get(".react-flow__node", { timeout: 15000 }).should("have.length.at.least", 1);
  cy.wait("@getPapers");
});

Cypress.Commands.add("getNode", (label: string) => {
  cy.get(`.react-flow__node`).contains(label).closest(".react-flow__node");
});

Cypress.Commands.add("clickNode", (label: string) => {
  cy.getNode(label).click({ force: true });
  cy.get(".w-\\[420px\\]", { timeout: 5000 }).should("exist");
});

Cypress.Commands.add("clickPaneToDeselect", () => {
  cy.get(".react-flow__pane").click({ force: true });
  cy.get(".w-\\[420px\\]").should("not.exist");
});

Cypress.Commands.add("switchTab", (name: string) => {
  cy.get("button").contains(name).first().click();
  cy.wait(500);
  cy.waitForCanvas();
});

Cypress.Commands.add("detailTab", (name: string) => {
  cy.get(".w-\\[420px\\]").within(() => {
    cy.get("button").contains(name).click();
  });
  cy.wait(300);
});

Cypress.Commands.add("openEventLog", () => {
  cy.get("button").contains("Log").click();
  cy.get(".h-\\[250px\\]", { timeout: 3000 }).should("exist");
});

Cypress.Commands.add("closeEventLog", () => {
  cy.get("button").contains("Log").click();
  cy.get(".h-\\[250px\\]").should("not.exist");
});

Cypress.Commands.add("assertNodeCount", (n: number) => {
  cy.get(".react-flow__node").should("have.length", n);
});

Cypress.Commands.add("assertTextNotTruncated", (selector: string) => {
  cy.get(selector).then(($el) => {
    const el = $el[0];
    expect(el.scrollWidth).to.be.at.most(el.clientWidth + 2);
  });
});

Cypress.Commands.add("sendWsMessage", (msg: Record<string, unknown>) => {
  cy.window().then((win) => {
    return new Cypress.Promise((resolve) => {
      const poll = (attempts: number) => {
        if (sendWsMessage(msg)) {
          win.requestAnimationFrame(() => {
            win.requestAnimationFrame(() => resolve());
          });
        } else if (attempts > 0) {
          setTimeout(() => poll(attempts - 1), 50);
        } else {
          resolve();
        }
      };
      poll(40);
    });
  });
});
