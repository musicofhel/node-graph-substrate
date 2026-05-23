const EXPECTED_SCHEMA_MAJOR = 1;
const DATA_BASE = "./data";
const DEFAULT_IDX = 0;
const TOTAL_PROBLEMS = 500;

const COLOR_POINT = "#a0a0c0";
const COLOR_BRIDGE = "#ffd700";
const COLOR_CYCLE = "#00ffff";
const COLOR_BG = "#0f0f23";

const POINT_R = 2.5;
const BRIDGE_R = 5.5;
const CYCLE_STROKE = 2;
const WIDTH = 600;
const HEIGHT = 500;
const MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

const problemCache = new Map();
const state = { manifest: null, currentIdx: DEFAULT_IDX };
let navGeneration = 0;
let dom = {};

function cacheDom() {
  dom = {
    metadata: document.getElementById("metadata"),
    cloudPanel: document.getElementById("cloud-panel"),
    infoPanel: document.getElementById("info-panel"),
    legend: document.getElementById("legend"),
    navStatus: document.getElementById("nav-status"),
    idxInput: document.getElementById("idx-input"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
    errorBanner: document.getElementById("error-banner"),
    app: document.getElementById("app"),
    navBar: document.getElementById("nav-bar"),
  };
}

function showError(msg) {
  dom.errorBanner.textContent = msg;
  dom.errorBanner.classList.add("visible");
  dom.app.style.display = "none";
  dom.legend.style.display = "none";
  dom.navBar.style.display = "none";
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

function clearCloud() {
  d3.select("#cloud-panel").selectAll("svg").remove();
}

function updateNavStatus(idx) {
  dom.idxInput.value = idx;
  dom.navStatus.textContent = "/ " + TOTAL_PROBLEMS;
}

function setLoadingState(loading) {
  dom.cloudPanel.classList.toggle("loading", loading);
  dom.btnPrev.disabled = loading;
  dom.btnNext.disabled = loading;
  dom.idxInput.disabled = loading;
  if (loading) {
    clearCloud();
  }
}

function renderMetadata(problem) {
  const idx = String(problem.idx).padStart(3, "0");
  const correct = problem.correctness.default;

  dom.metadata.innerHTML = [
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
  clearCloud();

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

  dom.infoPanel.innerHTML = `
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
  dom.legend.innerHTML = `
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

function renderProblem(problem) {
  renderMetadata(problem);
  renderCloud(problem);
  renderInfo(problem);
  updateNavStatus(problem.idx);
}

async function goTo(idx) {
  idx = Math.floor(idx);
  if (isNaN(idx)) return;
  idx = Math.max(0, Math.min(TOTAL_PROBLEMS - 1, idx));

  state.currentIdx = idx;
  const gen = ++navGeneration;
  setLoadingState(true);
  updateNavStatus(idx);

  try {
    let problem = problemCache.get(idx);
    if (!problem) {
      problem = await loadProblem(idx, state.manifest);
      problemCache.set(idx, problem);
    }
    if (gen !== navGeneration) return;
    renderProblem(problem);
  } catch (e) {
    if (gen !== navGeneration) return;
    const padded = String(idx).padStart(3, "0");
    dom.metadata.innerHTML =
      `<span class="badge badge-index">Problem #${padded}</span>` +
      `<span class="badge badge-incorrect">LOAD ERROR</span>`;
    dom.infoPanel.innerHTML =
      `<div class="info-section"><h3>Error</h3>` +
      `<p style="color:var(--color-incorrect);font-size:13px;">${e.message}</p></div>`;
  } finally {
    if (gen === navGeneration) {
      setLoadingState(false);
    }
  }
}

function goPrev() {
  goTo((state.currentIdx - 1 + TOTAL_PROBLEMS) % TOTAL_PROBLEMS);
}

function goNext() {
  goTo((state.currentIdx + 1) % TOTAL_PROBLEMS);
}

function bindEvents() {
  dom.btnPrev.addEventListener("click", goPrev);
  dom.btnNext.addEventListener("click", goNext);

  dom.idxInput.addEventListener("change", () => {
    const val = parseInt(dom.idxInput.value, 10);
    if (!isNaN(val)) goTo(val);
  });

  dom.idxInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = parseInt(dom.idxInput.value, 10);
      if (!isNaN(val)) goTo(val);
    }
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.stopPropagation();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === dom.idxInput) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    }
  });
}

async function main() {
  try {
    cacheDom();
    bindEvents();

    const manifest = await loadManifest();
    state.manifest = manifest;

    const problem = await loadProblem(DEFAULT_IDX, manifest);
    problemCache.set(DEFAULT_IDX, problem);
    renderProblem(problem);
    renderLegend();
  } catch (e) {
    showError(e.message);
  }
}

main();
