/**
 * LIDU — interactive dental chart component
 *
 * Two modes, matching a focus-mode workflow like dedicated dental charting
 * software:
 *
 *   1. Full-arch overview (mountToothChart): hovering any tooth highlights
 *      the WHOLE tooth. Clicking a tooth calls opts.onToothClick(toothNum)
 *      so the page can switch into zoom mode for that tooth.
 *
 *   2. Zoomed single-tooth view (mountZoomedTooth): renders just the
 *      clicked tooth, large, with its 5 anatomical surfaces individually
 *      hoverable/clickable and labeled (Mesial / Distal / Buccal-Labial /
 *      Lingual-Palatal / Occlusal-Incisal) around it.
 *
 * Each surface's fill reflects its LATEST recorded treatment (patient.chart
 * is a history array per surface, oldest first).
 */
window.LIDU_COMPONENTS = window.LIDU_COMPONENTS || {};

(function () {
  let svgMarkupCache = null;
  let svgDocCache = null; // a detached <svg> parsed once, used as the source to clone individual teeth from
  let tooltipEl = null;

  async function loadSvgMarkup() {
    if (svgMarkupCache) return svgMarkupCache;
    const url = window.LIDU_CONFIG.assets.toothChartSvgUrl;
    const res = await fetch(url);
    svgMarkupCache = await res.text();
    return svgMarkupCache;
  }

  async function loadSvgDoc() {
    if (svgDocCache) return svgDocCache;
    const markup = await loadSvgMarkup();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup;
    svgDocCache = wrapper.querySelector("svg");
    return svgDocCache;
  }

  function ensureTooltip() {
    // True singleton, genuinely inserted into the DOM only while visible —
    // never left sitting around hidden-by-CSS, which was the root cause of
    // it surviving clicks, modal opens, and tooth switches.
    if (!tooltipEl) {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "tooth-tooltip";
    }
    if (!tooltipEl.isConnected) document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function toothIsExtracted(toothChart) {
    return Object.values(toothChart).some((history) => {
      const rec = window.LIDU_CLINICAL.latestRecord(history);
      return rec && rec.treatment === "Extraction";
    });
  }

  function showToothTooltip(e, num, isExtracted) {
    const el = ensureTooltip();
    el.innerHTML = `<div class="tt-title">Tooth ${num}</div><div class="tt-sub">${isExtracted ? "Extracted — click to view" : "Click to view surfaces"}</div>`;
    moveTooltip(e);
  }

  function showSurfaceTooltip(e, patient, num, displaySurfaceLabel, surfaceLabel) {
    const U = window.LIDU_UTILS;
    const CL = window.LIDU_CLINICAL;
    const el = ensureTooltip();
    const toothChart = patient.chart[num] || {};
    const rec = CL.latestRecord(toothChart[surfaceLabel]);
    const isExtracted = toothIsExtracted(toothChart);
    let body;
    if (rec) {
      body = `<div>${U.escapeHtml(rec.treatment)}</div><div class="tt-sub">Last treatment · ${U.fmtDateFull(rec.date)}</div>`;
    } else if (isExtracted) {
      body = `<div>Tooth extracted</div><div class="tt-sub">No treatment recorded on this surface</div>`;
    } else {
      body = `<div class="tt-sub">No treatment recorded</div>`;
    }
    el.innerHTML = `<div class="tt-title">Tooth ${num} · ${displaySurfaceLabel}</div>` + body;
    moveTooltip(e);
  }

  function moveTooltip(e) {
    if (!tooltipEl || !tooltipEl.isConnected) return;
    tooltipEl.style.left = e.clientX + "px";
    tooltipEl.style.top = e.clientY + "px";
  }

  // Genuinely removes the tooltip from the DOM rather than just hiding it
  // with CSS. Safe to call even if no tooltip is currently showing.
  function hideTooltip() {
    if (tooltipEl && tooltipEl.isConnected) tooltipEl.remove();
  }
  window.LIDU_COMPONENTS.hideToothTooltip = hideTooltip;

  // Global dismissal, wired up exactly once per page load (guarded so
  // repeated calls to mountToothChart/mountZoomedTooth never attach
  // duplicate listeners): Escape and any click outside the tooltip both
  // dismiss it, matching how the rest of the app's overlays behave.
  let globalDismissalWired = false;
  function wireGlobalDismissal() {
    if (globalDismissalWired) return;
    globalDismissalWired = true;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTooltip(); });
    document.addEventListener("click", (e) => {
      if (tooltipEl && tooltipEl.isConnected && !tooltipEl.contains(e.target)) hideTooltip();
    }, true); // capture phase so this runs before a tooth-surface's own click handler swaps content
  }
  wireGlobalDismissal();

  function fillSurface(el, rec, isExtracted, CL) {
    if (isExtracted) el.style.fill = CL.TREATMENT_FILL["Extraction"];
    else el.style.fill = rec && CL.TREATMENT_FILL[rec.treatment] ? CL.TREATMENT_FILL[rec.treatment] : "";
  }

  /**
   * Full-arch overview.
   * @param {object} opts - { onToothClick(toothNumber) }
   */
  window.LIDU_COMPONENTS.mountToothChart = async function (holder, patient, opts) {
    opts = opts || {};
    hideTooltip(); // repaint is about to destroy whatever element the mouse was over — don't leave its tooltip stranded
    const CL = window.LIDU_CLINICAL;
    const markup = await loadSvgMarkup();
    holder.innerHTML = markup;
    const svgNode = holder.querySelector("svg");
    if (!svgNode) return;

    CL.ALL_TEETH.forEach((num) => {
      const g = svgNode.querySelector('[data-tooth="' + num + '"]');
      if (!g) return;
      const toothChart = patient.chart[num] || {};
      const isExtracted = toothIsExtracted(toothChart);

      Object.keys(CL.SURFACE_KEY_TO_LABEL).forEach((surfaceKey) => {
        const el = g.querySelector('.tooth-surface[data-surface="' + surfaceKey + '"]');
        if (!el) return;
        const surfaceLabel = CL.SURFACE_KEY_TO_LABEL[surfaceKey];
        const rec = CL.latestRecord(toothChart[surfaceLabel]);
        fillSurface(el, rec, isExtracted, CL);

        el.onclick = () => { hideTooltip(); opts.onToothClick && opts.onToothClick(num); };
        el.onmouseenter = (e) => showToothTooltip(e, num, isExtracted);
        el.onmousemove = (e) => moveTooltip(e);
        el.onmouseleave = () => hideTooltip();
      });
    });
  };

  /**
   * Zoomed single-tooth focus view.
   * @param {number} toothNum
   * @param {object} opts - { selectedSurfaceKey, onSurfaceClick(surfaceKey, surfaceLabel, displayLabel) }
   */
  window.LIDU_COMPONENTS.mountZoomedTooth = async function (holder, patient, toothNum, opts) {
    opts = opts || {};
    hideTooltip(); // same reasoning as mountToothChart above
    const CL = window.LIDU_CLINICAL;
    const doc = await loadSvgDoc();
    const sourceGroup = doc.querySelector('[data-tooth="' + toothNum + '"]');
    if (!sourceGroup) { holder.innerHTML = ""; return; }

    const clone = sourceGroup.cloneNode(true);
    const outline = clone.querySelector(".t-outline");
    // Build a proper <clipPath> wrapping a <use> of the outline — clip-path
    // must reference a <clipPath> element, not a plain shape's id directly
    // (that's silently ignored by browsers, which is why surfaces previously
    // rendered as raw unclipped boxes instead of the real tooth silhouette).
    const svgNS = "http://www.w3.org/2000/svg";
    const outlineId = "zoom-outline-" + toothNum;
    const clipId = "zoom-clip-" + toothNum;
    if (outline) outline.setAttribute("id", outlineId);
    const defs = document.createElementNS(svgNS, "defs");
    const clipPathEl = document.createElementNS(svgNS, "clipPath");
    clipPathEl.setAttribute("id", clipId);
    const use = document.createElementNS(svgNS, "use");
    use.setAttribute("href", "#" + outlineId);
    clipPathEl.appendChild(use);
    defs.appendChild(clipPathEl);
    const surfacesGroup = clone.querySelector(".tooth-surfaces");
    if (surfacesGroup) surfacesGroup.setAttribute("clip-path", "url(#" + clipId + ")");

    // Measure the original (unscaled) tooth to compute a tight viewBox.
    const measureHolder = document.createElement("div");
    measureHolder.style.cssText = "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;";
    const measureSvg = doc.cloneNode(true);
    measureHolder.appendChild(measureSvg);
    document.body.appendChild(measureHolder);
    const measureOutline = measureSvg.querySelector('[data-tooth="' + toothNum + '"] .t-outline');
    const bbox = measureOutline ? measureOutline.getBBox() : { x: 0, y: 0, width: 40, height: 50 };
    document.body.removeChild(measureHolder);

    const pad = Math.max(bbox.width, bbox.height) * 0.28;
    const vb = [bbox.x - pad, bbox.y - pad, bbox.width + pad * 2, bbox.height + pad * 2];

    const zoomSvg = document.createElementNS(svgNS, "svg");
    zoomSvg.setAttribute("viewBox", vb.join(" "));
    zoomSvg.appendChild(defs);
    zoomSvg.appendChild(clone);

    holder.innerHTML = "";
    holder.appendChild(zoomSvg);

    const toothChart = patient.chart[toothNum] || {};
    const isExtracted = toothIsExtracted(toothChart);
    const orientation = CL.surfaceOrientation(toothNum);

    Object.keys(CL.SURFACE_KEY_TO_LABEL).forEach((surfaceKey) => {
      const el = clone.querySelector('.tooth-surface[data-surface="' + surfaceKey + '"]');
      if (!el) return;
      const surfaceLabel = CL.SURFACE_KEY_TO_LABEL[surfaceKey];
      const rec = CL.latestRecord(toothChart[surfaceLabel]);
      fillSurface(el, rec, isExtracted, CL);
      el.classList.toggle("selected", opts.selectedSurfaceKey === surfaceKey);

      const displaySurfaceLabel = CL.displayLabelFor(toothNum, surfaceKey);
      el.onclick = () => { hideTooltip(); opts.onSurfaceClick && opts.onSurfaceClick(surfaceKey, surfaceLabel, displaySurfaceLabel); };
      el.onmouseenter = (e) => showSurfaceTooltip(e, patient, toothNum, displaySurfaceLabel, surfaceLabel);
      el.onmousemove = (e) => moveTooltip(e);
      el.onmouseleave = () => hideTooltip();
    });

    return orientation;
  };
})();
