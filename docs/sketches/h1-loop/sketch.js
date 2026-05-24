const EXPECTED_SCHEMA_MAJOR = 1;
const DATA_BASE = "./data";
const DEFAULT_IDX = 0;
const TOTAL_PROBLEMS = 500;

const COLOR_POINT = "#a0a0c0";
const COLOR_BRIDGE = "#ffd700";
const COLOR_CYCLE = "#00ffff";
const COLOR_BG = "#0f0f23";
const COLOR_H0 = "#58a6ff";
const COLOR_H1 = "#22d3ee";
const COLOR_H2 = "#a78bfa";

const POINT_R = 2.5;
const BRIDGE_R = 5.5;
const CYCLE_STROKE = 2;
const WIDTH = 600;
const HEIGHT = 500;
const MARGIN = { top: 20, right: 20, bottom: 20, left: 20 };

const DIAG_SIZE = 300;
const DIAG_MARGIN = { top: 20, right: 20, bottom: 35, left: 40 };
const DIAG_DOT_R = 4;
const DIAG_DOT_R_HIGHLIGHT = 6;

const LS_VIEW_KEY = "h1loop-view-mode";
const THREE_BG = 0x0f0f23;
const THREE_POINT_COLOR = 0xa0a0c0;
const THREE_BRIDGE_COLOR = 0xffd700;
const THREE_CYCLE_COLOR = 0x00ffff;
const THREE_CYCLE_HIGHLIGHT = 0xffffff;
const THREE_POINT_SIZE = 4;
const THREE_BRIDGE_RADIUS = 0.04;
const HOVER_DIST_THRESHOLD = 15;

function cycleColor(rank, maxRank) {
  if (maxRank <= 0) return d3.interpolateTurbo(0.92);
  const t = 0.92 - (rank / maxRank) * 0.84;
  return d3.interpolateTurbo(t);
}

function cycleColorHex(rank, maxRank) {
  const rgb = d3.color(cycleColor(rank, maxRank));
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

function cycleOpacity(rank) {
  return Math.max(0.25, 0.9 - rank * 0.03);
}

const problemCache = new Map();
const state = {
  manifest: null,
  currentIdx: DEFAULT_IDX,
  highlightedCycleRank: null,
  viewMode: localStorage.getItem(LS_VIEW_KEY) || "2d",
};
let threeState = null;
let navGeneration = 0;
let dom = {};

function cacheDom() {
  dom = {
    metadata: document.getElementById("metadata"),
    cloudPanel: document.getElementById("cloud-panel"),
    rightPanel: document.getElementById("right-panel"),
    diagramPanel: document.getElementById("diagram-panel"),
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

function disposeThreeState() {
  if (!threeState) return;
  threeState.disposed = true;
  cancelAnimationFrame(threeState.animFrameId);
  threeState.trackball.dispose();
  threeState.renderer.domElement.removeEventListener("mousemove", onCanvasMouseMove);
  threeState.renderer.domElement.removeEventListener("mouseleave", onCanvasMouseLeave);
  threeState.pointsMesh.geometry.dispose();
  threeState.pointsMesh.material.dispose();
  threeState.bridgeMesh.geometry.dispose();
  threeState.bridgeMesh.material.dispose();
  for (const line of threeState.cycleMeshes.values()) {
    line.geometry.dispose();
    line.material.dispose();
  }
  threeState.renderer.dispose();
  const canvas = threeState.renderer.domElement;
  if (canvas.parentElement) canvas.parentElement.removeChild(canvas);
  threeState = null;
}

function clearCloud() {
  disposeThreeState();
  d3.select("#cloud-panel").selectAll("svg").remove();
}

function clearDiagram() {
  d3.select("#diagram-panel").selectAll("svg").remove();
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
    clearDiagram();
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
  if (state.viewMode === "3d") {
    renderCloud3D(problem);
  } else {
    renderCloud2D(problem);
  }
}

function renderCloud2D(problem) {
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

  const sortedCycles = [...problem.h1_cycles].sort((a, b) => b.rank - a.rank);
  const maxRank = d3.max(problem.h1_cycles, c => c.rank) || 0;

  for (const cycle of sortedCycles) {
    const cyclePoints = cycle.representative_subsampled_indices.map(
      (i) => `${xScale(pts[i][0])},${yScale(pts[i][1])}`
    );
    const isFallback = cycle.extraction_method === "cocycle_support_walk";
    svg
      .append("polygon")
      .attr("points", cyclePoints.join(" "))
      .attr("class", "cycle" + (isFallback ? " fallback" : ""))
      .attr("data-rank", cycle.rank)
      .attr("fill", "none")
      .attr("stroke", cycleColor(cycle.rank, maxRank))
      .attr("stroke-width", cycle.rank === 0 ? CYCLE_STROKE : 1.5)
      .attr("stroke-dasharray", isFallback ? "6,3" : "none")
      .attr("stroke-opacity", cycleOpacity(cycle.rank))
      .on("mouseenter", () => setHighlight(cycle.rank))
      .on("mouseleave", () => clearHighlight());
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

function normalizePoints3D(points3d) {
  const n = points3d.length;
  const cx = points3d.reduce((s, p) => s + p[0], 0) / n;
  const cy = points3d.reduce((s, p) => s + p[1], 0) / n;
  const cz = points3d.reduce((s, p) => s + p[2], 0) / n;
  let maxExt = 0;
  for (const p of points3d) {
    maxExt = Math.max(maxExt, Math.abs(p[0] - cx), Math.abs(p[1] - cy), Math.abs(p[2] - cz));
  }
  if (maxExt === 0) maxExt = 1;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    positions[i * 3] = (points3d[i][0] - cx) / maxExt;
    positions[i * 3 + 1] = (points3d[i][1] - cy) / maxExt;
    positions[i * 3 + 2] = (points3d[i][2] - cz) / maxExt;
  }
  return { positions, centroid: [cx, cy, cz], scale: maxExt };
}

function createTrackball(camera, domElement, target) {
  const spherical = new THREE.Spherical().setFromVector3(
    new THREE.Vector3().copy(camera.position).sub(target)
  );
  let isDragging = false;
  let button = -1;
  let prevX = 0, prevY = 0;
  const rotateSpeed = 0.005;
  const zoomSpeed = 0.001;
  const panSpeed = 0.003;

  function onMouseDown(e) {
    isDragging = true;
    button = e.button;
    prevX = e.clientX;
    prevY = e.clientY;
  }
  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;
    if (button === 0) {
      spherical.theta -= dx * rotateSpeed;
      spherical.phi -= dy * rotateSpeed;
      spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
    } else if (button === 2) {
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      camera.getWorldDirection(up);
      right.crossVectors(up, camera.up).normalize();
      up.crossVectors(right, up.set(0, 0, -1)).normalize();
      up.copy(camera.up).normalize();
      target.addScaledVector(right, -dx * panSpeed * spherical.radius);
      target.addScaledVector(up, dy * panSpeed * spherical.radius);
    }
    applySpherical();
  }
  function onMouseUp() { isDragging = false; button = -1; }
  function onWheel(e) {
    e.preventDefault();
    spherical.radius *= 1 + e.deltaY * zoomSpeed;
    spherical.radius = Math.max(0.5, Math.min(10, spherical.radius));
    applySpherical();
  }
  function onContext(e) { e.preventDefault(); }
  function applySpherical() {
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
  }

  domElement.addEventListener("mousedown", onMouseDown);
  domElement.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContext);

  return {
    get isDragging() { return isDragging; },
    update() { applySpherical(); },
    dispose() {
      domElement.removeEventListener("mousedown", onMouseDown);
      domElement.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContext);
    },
  };
}

function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function onCanvasMouseMove(event) {
  if (!threeState || threeState.disposed || threeState.trackball.isDragging) return;
  const canvas = threeState.renderer.domElement;
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left;
  const my = event.clientY - rect.top;
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;

  let closestRank = null;
  let closestDist = HOVER_DIST_THRESHOLD;

  for (const [rank, line] of threeState.cycleMeshes) {
    const posAttr = line.geometry.getAttribute("position");
    const count = posAttr.count;
    const projected = [];
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      v.project(threeState.camera);
      projected.push({ x: (v.x * 0.5 + 0.5) * cw, y: (-v.y * 0.5 + 0.5) * ch });
    }
    for (let i = 0; i < projected.length - 1; i++) {
      const d = pointToSegmentDist(mx, my, projected[i].x, projected[i].y, projected[i + 1].x, projected[i + 1].y);
      if (d < closestDist) {
        closestDist = d;
        closestRank = rank;
      }
    }
  }

  if (closestRank !== null && closestRank !== state.highlightedCycleRank) {
    setHighlight(closestRank);
  } else if (closestRank === null && state.highlightedCycleRank !== null) {
    clearHighlight();
  }
}

function onCanvasMouseLeave() {
  if (state.highlightedCycleRank !== null) clearHighlight();
}

function renderCloud3D(problem) {
  clearCloud();

  if (typeof THREE === "undefined") {
    console.warn("Three.js not loaded, falling back to 2D");
    state.viewMode = "2d";
    renderCloud2D(problem);
    return;
  }

  const panel = dom.cloudPanel;
  const w = panel.clientWidth || 600;
  const h = panel.clientHeight || 500;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) {
    console.warn("WebGL not available:", e.message);
    state.viewMode = "2d";
    dom.btn3d.disabled = true;
    dom.btn2d.classList.add("active");
    dom.btn3d.classList.remove("active");
    renderCloud2D(problem);
    return;
  }

  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(THREE_BG);
  panel.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  camera.position.set(1.5, 1.5, 2.0);
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();

  const { positions } = normalizePoints3D(problem.points_3d);

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const pointsMat = new THREE.PointsMaterial({
    color: THREE_POINT_COLOR,
    size: THREE_POINT_SIZE,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.7,
  });
  const pointsMesh = new THREE.Points(pointsGeo, pointsMat);
  scene.add(pointsMesh);

  const bi = problem.bridge_subsampled_index;
  const bridgeGeo = new THREE.SphereGeometry(THREE_BRIDGE_RADIUS, 16, 16);
  const bridgeMat = new THREE.MeshBasicMaterial({ color: THREE_BRIDGE_COLOR });
  const bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
  bridgeMesh.position.set(positions[bi * 3], positions[bi * 3 + 1], positions[bi * 3 + 2]);
  scene.add(bridgeMesh);

  const cycleMeshes = new Map();
  const maxRank = d3.max(problem.h1_cycles, c => c.rank) || 0;
  for (const cycle of problem.h1_cycles) {
    const indices = cycle.representative_subsampled_indices;
    const cyclePos = new Float32Array(indices.length * 3);
    for (let k = 0; k < indices.length; k++) {
      const idx = indices[k];
      cyclePos[k * 3] = positions[idx * 3];
      cyclePos[k * 3 + 1] = positions[idx * 3 + 1];
      cyclePos[k * 3 + 2] = positions[idx * 3 + 2];
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(cyclePos, 3));

    const isFallback = cycle.extraction_method === "cocycle_support_walk";
    const cHex = cycleColorHex(cycle.rank, maxRank);
    const cOpacity = cycleOpacity(cycle.rank);
    let lineMat;
    if (isFallback) {
      lineMat = new THREE.LineDashedMaterial({
        color: cHex, transparent: true, opacity: cOpacity,
        dashSize: 0.05, gapSize: 0.025,
      });
    } else {
      lineMat = new THREE.LineBasicMaterial({
        color: cHex, transparent: true, opacity: cOpacity,
      });
    }

    const line = new THREE.Line(lineGeo, lineMat);
    if (isFallback) line.computeLineDistances();
    line.userData = { rank: cycle.rank };
    scene.add(line);
    cycleMeshes.set(cycle.rank, line);
  }

  const target = new THREE.Vector3(0, 0, 0);
  const trackball = createTrackball(camera, renderer.domElement, target);

  threeState = {
    renderer, scene, camera, trackball, pointsMesh, bridgeMesh,
    cycleMeshes, positions, maxRank, currentProblem: problem,
    disposed: false, animFrameId: 0,
  };

  renderer.domElement.addEventListener("mousemove", onCanvasMouseMove);
  renderer.domElement.addEventListener("mouseleave", onCanvasMouseLeave);

  function animate() {
    if (!threeState || threeState.disposed) return;
    threeState.animFrameId = requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

function renderInfo(problem) {
  const maxRank = d3.max(problem.h1_cycles, c => c.rank) || 0;

  let cycleHtml = "";
  if (problem.h1_cycles.length > 0) {
    const rows = problem.h1_cycles.map(c => {
      const color = cycleColor(c.rank, maxRank);
      const method = c.extraction_method === "shortest_cycle_at_birth" ? "shortest" : "fallback";
      return `<tr class="cycle-row" data-rank="${c.rank}"
                  onmouseenter="setHighlight(${c.rank})"
                  onmouseleave="clearHighlight()">
        <td><span class="cycle-swatch" style="background:${color}"></span>${c.rank}</td>
        <td>${c.lifetime.toFixed(2)}</td>
        <td>${c.birth.toFixed(2)}</td>
        <td>${c.representative_subsampled_indices.length - 1}</td>
        <td>${method}</td>
      </tr>`;
    }).join("");

    cycleHtml = `
      <div class="info-section">
        <h3>H1 Cycles (${problem.h1_cycles.length})</h3>
        <div class="cycle-table-wrap">
          <table class="cycle-table">
            <thead><tr><th>Rank</th><th>Life</th><th>Birth</th><th>Verts</th><th>Method</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
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

function renderDiagram(problem) {
  clearDiagram();

  const dims = ["H0", "H1", "H2"];
  const dimColors = { H0: COLOR_H0, H1: COLOR_H1, H2: COLOR_H2 };
  const maxH1Rank = d3.max(problem.h1_cycles, c => c.rank) || 0;

  const h1Sorted = problem.persistence_diagram.H1
    .map(([b, d]) => ({ b, d, lifetime: d - b }))
    .sort((a, b) => b.lifetime - a.lifetime);

  const allPoints = [];
  for (const dim of dims) {
    const pairs = problem.persistence_diagram[dim] || [];
    for (const [b, d] of pairs) {
      if (!isFinite(b) || !isFinite(d)) continue;
      const entry = { b, d, dim, rank: null };
      if (dim === "H1") {
        const sortedIdx = h1Sorted.findIndex(
          (s) => Math.abs(s.b - b) < 1e-9 && Math.abs(s.d - d) < 1e-9
        );
        const cycle = problem.h1_cycles.find(
          (c) => Math.abs(c.birth - b) < 1e-9 && Math.abs(c.death - d) < 1e-9
        );
        entry.rank = cycle ? cycle.rank : sortedIdx;
      }
      allPoints.push(entry);
    }
  }

  if (allPoints.length === 0) {
    dom.diagramPanel.innerHTML =
      '<p style="color:var(--text-secondary);font-size:13px;text-align:center;padding:40px 0;">No persistence features.</p>';
    return;
  }

  const maxVal = Math.max(1, ...allPoints.map((p) => Math.max(p.b, p.d)));
  const domainMax = maxVal * 1.08;

  const plotW = DIAG_SIZE - DIAG_MARGIN.left - DIAG_MARGIN.right;
  const plotH = DIAG_SIZE - DIAG_MARGIN.top - DIAG_MARGIN.bottom;

  const xScale = d3.scaleLinear().domain([0, domainMax]).range([DIAG_MARGIN.left, DIAG_MARGIN.left + plotW]);
  const yScale = d3.scaleLinear().domain([0, domainMax]).range([DIAG_MARGIN.top + plotH, DIAG_MARGIN.top]);

  const svg = d3
    .select("#diagram-panel")
    .append("svg")
    .attr("viewBox", `0 0 ${DIAG_SIZE} ${DIAG_SIZE}`);

  svg.append("rect").attr("width", DIAG_SIZE).attr("height", DIAG_SIZE).attr("fill", COLOR_BG);

  svg
    .append("line")
    .attr("x1", xScale(0))
    .attr("y1", yScale(0))
    .attr("x2", xScale(domainMax))
    .attr("y2", yScale(domainMax))
    .attr("stroke", "#555")
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", "4,3");

  const nTicks = 4;
  const tickVals = d3.ticks(0, domainMax, nTicks);

  svg
    .append("line")
    .attr("x1", xScale(0)).attr("y1", yScale(0))
    .attr("x2", xScale(domainMax)).attr("y2", yScale(0))
    .attr("stroke", "#555").attr("stroke-width", 1);

  svg
    .append("line")
    .attr("x1", xScale(0)).attr("y1", yScale(0))
    .attr("x2", xScale(0)).attr("y2", yScale(domainMax))
    .attr("stroke", "#555").attr("stroke-width", 1);

  for (const v of tickVals) {
    svg.append("text")
      .attr("x", xScale(v)).attr("y", yScale(0) + 14)
      .attr("text-anchor", "middle")
      .attr("fill", "#777").attr("font-size", "9px").attr("font-family", "var(--font-mono)")
      .text(v.toFixed(0));

    svg.append("text")
      .attr("x", xScale(0) - 6).attr("y", yScale(v) + 3)
      .attr("text-anchor", "end")
      .attr("fill", "#777").attr("font-size", "9px").attr("font-family", "var(--font-mono)")
      .text(v.toFixed(0));
  }

  svg.append("text")
    .attr("x", xScale(domainMax / 2)).attr("y", DIAG_SIZE - 4)
    .attr("text-anchor", "middle")
    .attr("fill", "#999").attr("font-size", "11px")
    .text("Birth");

  svg.append("text")
    .attr("transform", `rotate(-90)`)
    .attr("x", -(DIAG_MARGIN.top + plotH / 2)).attr("y", 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#999").attr("font-size", "11px")
    .text("Death");

  const paintOrder = ["H0", "H2", "H1"];
  for (const dim of paintOrder) {
    const pts = allPoints.filter((p) => p.dim === dim);
    svg
      .selectAll(null)
      .data(pts)
      .join("circle")
      .attr("class", (d) => {
        let cls = "diagram-dot";
        if (d.dim === "H1" && d.rank === 0) cls += " rank-0";
        return cls;
      })
      .attr("data-dim", dim)
      .attr("data-rank", (d) => (d.rank !== null ? d.rank : ""))
      .attr("cx", (d) => xScale(d.b))
      .attr("cy", (d) => yScale(d.d))
      .attr("r", (d) => (d.dim === "H1" && d.rank === 0 ? DIAG_DOT_R_HIGHLIGHT : DIAG_DOT_R))
      .attr("fill", (d) => d.dim === "H1" && d.rank !== null
        ? cycleColor(d.rank, maxH1Rank) : dimColors[d.dim])
      .attr("stroke", (d) => (d.dim === "H1" && d.rank === 0 ? "#fff" : "none"))
      .attr("stroke-width", (d) => (d.dim === "H1" && d.rank === 0 ? 1.5 : 0))
      .attr("opacity", 0.85)
      .on("mouseenter", (event, d) => {
        if (d.dim === "H1") setHighlight(d.rank);
      })
      .on("mouseleave", (event, d) => {
        if (d.dim === "H1") clearHighlight();
      });
  }

  const legendX = DIAG_MARGIN.left + 6;
  const legendY = DIAG_MARGIN.top + 6;
  const legendItems = [
    { label: "H0", color: COLOR_H0 },
    { label: "H1", color: COLOR_H1 },
    { label: "H2", color: COLOR_H2 },
  ];
  legendItems.forEach((item, i) => {
    const y = legendY + i * 14;
    svg.append("circle").attr("cx", legendX).attr("cy", y).attr("r", 3.5).attr("fill", item.color);
    svg.append("text")
      .attr("x", legendX + 8).attr("y", y + 3.5)
      .attr("fill", "#999").attr("font-size", "10px")
      .text(item.label);
  });
}

function setHighlight(rank) {
  state.highlightedCycleRank = rank;
  d3.selectAll("#diagram-panel .diagram-dot[data-dim='H1']").each(function (d) {
    d3.select(this)
      .classed("highlighted", d.rank === rank)
      .classed("dimmed", d.rank !== rank)
      .attr("r", d.rank === rank ? DIAG_DOT_R_HIGHLIGHT : DIAG_DOT_R);
  });
  d3.selectAll("#diagram-panel .diagram-dot:not([data-dim='H1'])").classed("dimmed", true);

  if (state.viewMode === "2d") {
    d3.selectAll("#cloud-panel .cycle").each(function () {
      const r = +this.getAttribute("data-rank");
      d3.select(this)
        .classed("highlighted", r === rank)
        .classed("dimmed", r !== rank);
    });
  } else if (threeState && !threeState.disposed) {
    const mr = threeState.maxRank;
    for (const [r, line] of threeState.cycleMeshes) {
      line.material.color.setHex(r === rank ? THREE_CYCLE_HIGHLIGHT : cycleColorHex(r, mr));
      line.material.opacity = r === rank ? 1.0 : 0.15;
    }
  }
}

function clearHighlight() {
  state.highlightedCycleRank = null;
  d3.selectAll("#diagram-panel .diagram-dot")
    .classed("highlighted", false)
    .classed("dimmed", false);
  d3.selectAll("#diagram-panel .diagram-dot[data-dim='H1']").each(function (d) {
    d3.select(this).attr("r", d.rank === 0 ? DIAG_DOT_R_HIGHLIGHT : DIAG_DOT_R);
  });

  if (state.viewMode === "2d") {
    d3.selectAll("#cloud-panel .cycle")
      .classed("highlighted", false)
      .classed("dimmed", false);
  } else if (threeState && !threeState.disposed) {
    const mr = threeState.maxRank;
    for (const [r, line] of threeState.cycleMeshes) {
      line.material.color.setHex(cycleColorHex(r, mr));
      line.material.opacity = cycleOpacity(r);
    }
  }
}

function renderLegend() {
  const nSwatches = 12;
  let rampSvg = '<svg width="80" height="12">';
  for (let i = 0; i < nSwatches; i++) {
    const t = 0.92 - (i / (nSwatches - 1)) * 0.84;
    const color = d3.interpolateTurbo(t);
    const x = (i / nSwatches) * 80;
    const w = 80 / nSwatches + 0.5;
    rampSvg += `<rect x="${x}" y="2" width="${w}" height="8" fill="${color}" rx="1"/>`;
  }
  rampSvg += '</svg>';

  dom.legend.innerHTML = `
    <span class="legend-item">
      ${rampSvg}
      H1 cycles (rank 0 &rarr; N)
    </span>
    <span class="legend-item">
      <svg width="30" height="12"><line x1="0" y1="6" x2="30" y2="6" stroke="#999" stroke-width="2" stroke-dasharray="6,3"/></svg>
      Dashed = fallback method
    </span>
    <span class="legend-item">
      <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="${COLOR_BRIDGE}"/></svg>
      Bridge (token 0)
    </span>
    <span class="legend-item">
      <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="${COLOR_H0}"/></svg>
      H0
    </span>
    <span class="legend-item">
      <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="${COLOR_H1}"/></svg>
      H1
    </span>
    <span class="legend-item">
      <svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="${COLOR_H2}"/></svg>
      H2
    </span>
    <span class="legend-item" style="color:var(--text-secondary);font-style:italic;">
      V: toggle 2D/3D
    </span>`;
}

function renderProblem(problem) {
  renderMetadata(problem);
  renderCloud(problem);
  renderDiagram(problem);
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

function switchViewMode(mode) {
  if (mode === state.viewMode) return;
  state.viewMode = mode;
  localStorage.setItem(LS_VIEW_KEY, mode);
  dom.btn2d.classList.toggle("active", mode === "2d");
  dom.btn3d.classList.toggle("active", mode === "3d");
  const problem = problemCache.get(state.currentIdx);
  if (problem) {
    clearHighlight();
    renderCloud(problem);
  }
}

function initViewToggle() {
  dom.btn2d = document.getElementById("btn-2d");
  dom.btn3d = document.getElementById("btn-3d");
  if (state.viewMode === "3d") {
    dom.btn2d.classList.remove("active");
    dom.btn3d.classList.add("active");
  }
  dom.btn2d.addEventListener("click", () => switchViewMode("2d"));
  dom.btn3d.addEventListener("click", () => switchViewMode("3d"));
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
    } else if (e.key === "v" || e.key === "V") {
      e.preventDefault();
      switchViewMode(state.viewMode === "2d" ? "3d" : "2d");
    }
  });
}

async function main() {
  try {
    cacheDom();
    bindEvents();
    initViewToggle();

    const ro = new ResizeObserver((entries) => {
      if (!threeState || threeState.disposed) return;
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      threeState.camera.aspect = width / height;
      threeState.camera.updateProjectionMatrix();
      threeState.renderer.setSize(width, height);
    });
    ro.observe(dom.cloudPanel);

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
