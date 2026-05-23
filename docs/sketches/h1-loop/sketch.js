const EXPECTED_SCHEMA_MAJOR = 1;
const DATA_BASE = "./data";
const DEFAULT_IDX = 0;

const COLOR_POINT = "#a0a0c0";
const COLOR_BRIDGE = "#ffd700";
const COLOR_CYCLE = "#00ffff";
const COLOR_BG = "#0f0f23";
const COLOR_CORRECT = "#10b981";
const COLOR_INCORRECT = "#ef4444";

const POINT_R = 2.5;
const BRIDGE_R = 5.5;
const CYCLE_STROKE = 2;
const WIDTH = 600;
const HEIGHT = 500;
const MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

function showError(msg) {
  const banner = document.getElementById("error-banner");
  banner.textContent = msg;
  banner.classList.add("visible");
  document.getElementById("app").style.display = "none";
  document.getElementById("legend").style.display = "none";
}

function checkSchema(obj, label) {
  const v = obj.schema_version;
  if (!v || parseInt(v.split(".")[0], 10) !== EXPECTED_SCHEMA_MAJOR) {
    throw new Error(
      `Schema version mismatch in ${label}: expected major ${EXPECTED_SCHEMA_MAJOR}, got "${v}".\n` +
      "Regenerate the cache:\n  python scripts/precompute_h1_cycles.py --force"
    );
  }
}

async function loadManifest() {
  let resp;
  try {
    resp = await fetch(DATA_BASE + "/manifest.json");
  } catch {
    throw new Error(
      "Network error loading manifest.\n" +
      "Serve from the sketch directory:\n" +
      "  cd docs/sketches/h1-loop && python -m http.server --bind 127.0.0.1 8765"
    );
  }
  if (!resp.ok) {
    throw new Error(
      "Data not found (manifest.json returned " + resp.status + ").\n" +
      "Run the precompute script first:\n" +
      "  python scripts/precompute_h1_cycles.py"
    );
  }
  const manifest = await resp.json();
  checkSchema(manifest, "manifest.json");
  return manifest;
}

async function loadProblem(idx, manifest) {
  const entry = manifest.problems.find((p) => p.idx === idx);
  if (!entry) {
    throw new Error("Problem " + idx + " not found in manifest.");
  }
  let resp;
  try {
    resp = await fetch(DATA_BASE + "/" + entry.file);
  } catch {
    throw new Error("Network error loading " + entry.file + ".");
  }
  if (!resp.ok) {
    throw new Error(
      "Problem file " + entry.file + " not found (" + resp.status + ").\n" +
      "Regenerate:\n  python scripts/precompute_h1_cycles.py --problem " + idx + " --force"
    );
  }
  const problem = await resp.json();
  checkSchema(problem, entry.file);
  return problem;
}

function padDomain(values, fraction) {
  const min = d3.min(values);
  const max = d3.max(values);
  const pad = (max - min) * fraction;
  return [min - pad, max + pad];
}

function renderMetadata(problem) {
  const el = document.getElementById("metadata");
  const idx = String(problem.idx).padStart(3, "0");
  const correct = problem.correctness.default;

  el.innerHTML = [
    `<span class="badge badge-index">Problem #${idx}</span>`,
    `<span class="badge badge-subject">${problem.subject}</span>`,
    `<span class="badge badge-level">Level ${problem.level}</span>`,
    correct
      ? `<span class="badge badge-correct">CORRECT</span>`
      : `<span class="badge badge-incorrect">INCORRECT</span>`,
    `<span class="badge badge-stat">${problem.n_tokens} tokens</span>`,
    `<span class="badge badge-stat">logp ${problem.mean_logprob.toFixed(3)}</span>`,
  ].join("");
}

function renderCloud(problem) {
  const pts = problem.points_2d;
  const xDomain = padDomain(pts.map((p) => p[0]), 0.05);
  const yDomain = padDomain(pts.map((p) => p[1]), 0.05);

  const xScale = d3
    .scaleLinear()
    .domain(xDomain)
    .range([MARGIN.left, WIDTH - MARGIN.right]);
  const yScale = d3
    .scaleLinear()
    .domain(yDomain)
    .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

  const svg = d3
    .select("#cloud-panel")
    .append("svg")
    .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);

  svg
    .append("rect")
    .attr("width", WIDTH)
    .attr("height", HEIGHT)
    .attr("fill", COLOR_BG);

  const rank0 = problem.h1_cycles.find((c) => c.rank === 0);
  if (rank0) {
    const cyclePoints = rank0.representative_subsampled_indices.map(
      (i) => `${xScale(pts[i][0])},${yScale(pts[i][1])}`
    );
    svg
      .append("polygon")
      .attr("points", cyclePoints.join(" "))
      .attr("class",
        "cycle" + (rank0.extraction_method === "cocycle_support_walk" ? " fallback" : "")
      )
      .attr("fill", "none")
      .attr("stroke", COLOR_CYCLE)
      .attr("stroke-width", CYCLE_STROKE)
      .attr("stroke-dasharray",
        rank0.extraction_method === "cocycle_support_walk" ? "6,3" : "none"
      );
  }

  svg
    .selectAll("circle.point")
    .data(pts)
    .join("circle")
    .attr("class", "point")
    .attr("cx", (d) => xScale(d[0]))
    .attr("cy", (d) => yScale(d[1]))
    .attr("r", POINT_R)
    .attr("fill", COLOR_POINT)
    .attr("opacity", 0.7);

  const bi = problem.bridge_subsampled_index;
  svg
    .append("circle")
    .attr("class", "bridge")
    .attr("cx", xScale(pts[bi][0]))
    .attr("cy", yScale(pts[bi][1]))
    .attr("r", BRIDGE_R)
    .attr("fill", COLOR_BRIDGE)
    .attr("opacity", 1.0);
}

function renderInfo(problem) {
  const el = document.getElementById("info-panel");
  const rank0 = problem.h1_cycles.find((c) => c.rank === 0);

  let cycleHtml = "";
  if (rank0) {
    const method =
      rank0.extraction_method === "shortest_cycle_at_birth"
        ? "Shortest cycle at birth"
        : "Cocycle support walk (fallback)";
    cycleHtml = `
      <div class="info-section">
        <h3>Rank-0 H1 Cycle</h3>
        <div class="info-row"><span class="info-label">Birth</span><span class="info-value">${rank0.birth.toFixed(3)}</span></div>
        <div class="info-row"><span class="info-label">Death</span><span class="info-value">${rank0.death.toFixed(3)}</span></div>
        <div class="info-row"><span class="info-label">Lifetime</span><span class="info-value">${rank0.lifetime.toFixed(3)}</span></div>
        <div class="info-row"><span class="info-label">Vertices</span><span class="info-value">${rank0.representative_subsampled_indices.length - 1}</span></div>
        <div class="info-row"><span class="info-label">Method</span><span class="info-value">${method}</span></div>
      </div>`;
  } else {
    cycleHtml = `
      <div class="info-section">
        <h3>H1 Cycles</h3>
        <p style="color:var(--text-secondary);font-size:13px;">No H1 features detected.</p>
      </div>`;
  }

  el.innerHTML = `
    <div class="info-section">
      <h3>Point Cloud</h3>
      <div class="info-row"><span class="info-label">Original tokens</span><span class="info-value">${problem.n_tokens}</span></div>
      <div class="info-row"><span class="info-label">Subsampled</span><span class="info-value">${problem.n_subsampled}</span></div>
      <div class="info-row"><span class="info-label">H1 features</span><span class="info-value">${problem.persistence_diagram.H1.length}</span></div>
      <div class="info-row"><span class="info-label">Cycles extracted</span><span class="info-value">${problem.h1_cycles.length}</span></div>
    </div>
    ${cycleHtml}`;
}

function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = `
    <span class="legend-item">
      <svg width="30" height="12"><line x1="0" y1="6" x2="30" y2="6" stroke="${COLOR_CYCLE}" stroke-width="2"/></svg>
      Primary cycle (shortest path at birth)
    </span>
    <span class="legend-item">
      <svg width="30" height="12"><line x1="0" y1="6" x2="30" y2="6" stroke="${COLOR_CYCLE}" stroke-width="2" stroke-dasharray="6,3"/></svg>
      Fallback cycle (cocycle support walk)
    </span>
    <span class="legend-item">
      <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="${COLOR_BRIDGE}"/></svg>
      Bridge (token 0)
    </span>`;
}

async function main() {
  try {
    const manifest = await loadManifest();
    const problem = await loadProblem(DEFAULT_IDX, manifest);
    renderMetadata(problem);
    renderCloud(problem);
    renderInfo(problem);
    renderLegend();
  } catch (e) {
    showError(e.message);
  }
}

main();
