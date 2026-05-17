import "./commands";

Cypress.on("uncaught:exception", (err) => {
  if (
    err.message.includes("[WS]") ||
    err.message.includes("WebSocket") ||
    err.message.includes("Cannot use import statement outside a module") ||
    err.message.includes("Cannot read properties of undefined") ||
    err.message.includes("Failed to fetch")
  ) {
    return false;
  }
});
