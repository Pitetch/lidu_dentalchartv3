/**
 * LIDU — Patient Workspace page component
 * Reached via patient-workspace.html?id=<patientId>
 */
window.LIDU_COMPONENTS = window.LIDU_COMPONENTS || {};

(function () {
  const U = window.LIDU_UTILS;
  const CL = window.LIDU_CLINICAL;
  const ICONS = window.LIDU_ICONS;
  const DATA = window.LIDU_DATA;

  const localState = {
    expandedTooth: null,
    selectedSurfaceKey: null,
    selectedSurfaceLabel: null,
    selectedDisplayLabel: null,
    generalNoteDraft: "",
  };

  async function paint() {
    const app = document.getElementById("pageRoot");
    const patientId = U.qs("id");
    const patient = patientId && (await DATA.getPatientById(patientId));
    if (!patient) {
      app.innerHTML = `<div class="empty-state">${ICONS.empty}<p>Patient not found.</p></div><a class="btn btn-secondary" href="patients.html" style="margin-top:12px;display:inline-flex;">${ICONS.back}Back to patients</a>`;
      return;
    }
    const next = await DATA.getNextAppointmentForPatient(patient.id);
    const apptHistory = await DATA.getAppointmentsForPatient(patient.id);
    const currentTreatment = latestTreatment(patient);
    const assignedDentist = patient.assignedDentist || window.LIDU_CONFIG.clinic.dentistName;

    app.innerHTML = `
      <a class="btn btn-ghost btn-sm back-btn" href="patients.html" style="text-decoration:none;display:inline-flex;">${ICONS.back}Back to patients</a>

      <div class="summary-card">
        <div class="summary-top" style="justify-content:space-between;">
          <div class="row">
            <div class="avatar">${U.initials(patient.name)}</div>
            <div>
              <h2 class="summary-name">${U.escapeHtml(patient.name)}</h2>
              <div class="summary-tags">${U.escapeHtml(patient.address || "No address on file")}</div>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="editPatientBtn">${ICONS.edit}Edit patient</button>
        </div>

        <div class="summary-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="summary-item"><div class="k">Sex</div><div class="v">${U.escapeHtml(patient.gender || "—")}</div></div>
          <div class="summary-item"><div class="k">Age</div><div class="v">${patient.age || "—"}</div></div>
          <div class="summary-item"><div class="k">Birthday</div><div class="v">${patient.birthDate ? U.fmtBirthday(patient.birthDate) : "—"}</div></div>
          <div class="summary-item"><div class="k">Contact number</div><div class="v">${U.escapeHtml(patient.phone || "—")}</div></div>
        </div>

        <div class="summary-grid" style="grid-template-columns:repeat(4,1fr);">
          <div class="summary-item"><div class="k">Email address</div><div class="v">${patient.email ? U.escapeHtml(patient.email) : "—"}</div></div>
          <div class="summary-item"><div class="k">Last visit</div><div class="v">${patient.lastVisit ? U.fmtDateFull(patient.lastVisit) : "—"}</div></div>
          <div class="summary-item"><div class="k">Next appointment</div><div class="v">${next ? U.fmtDateShort(next.date) + " · " + U.fmtTime12(next.time) : "None scheduled"}</div></div>
          <div class="summary-item"><div class="k">Current treatment</div><div class="v">${currentTreatment ? U.escapeHtml(currentTreatment) : '<span style="color:var(--text-muted);font-weight:500;">None active</span>'}</div></div>
        </div>

        <div class="summary-grid" style="grid-template-columns:repeat(2,1fr);">
          <div class="summary-item"><div class="k">Assigned dentist</div><div class="v">${U.escapeHtml(assignedDentist)}</div></div>
          <div class="summary-item"><div class="k">Medical alerts</div><div class="v">${patient.medicalAlerts && patient.medicalAlerts.length ? patient.medicalAlerts.map((a) => `<span class="alert-pill">${ICONS.alert}${U.escapeHtml(a)}</span>`).join(" ") : '<span style="color:var(--text-muted);font-weight:500;">None on file</span>'}</div></div>
        </div>

        <div class="files-section">
          <div class="row-between" style="margin-bottom:10px;">
            <div class="k" style="margin:0;">Patient files</div>
            <label class="btn btn-secondary btn-sm" style="cursor:pointer;">
              ${ICONS.plus}Upload file
              <input type="file" id="fileUploadInput" style="display:none;">
            </label>
          </div>
          <div id="filesList">${renderFilesList(patient)}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">Interactive dental chart</h3><span class="card-count">FDI numbering</span></div>
        <div class="chart-flex-wrap">
          <div id="chartAreaHolder"></div>
          <div class="tooth-panel-box" id="toothPanelBox">
            <div class="tooth-panel" id="toothPanel"></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">Treatment timeline</h3></div>
        <div id="timelineHolder">${renderTimeline(patient)}</div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">Clinical notes</h3></div>
        <textarea class="input" id="generalNoteInput" placeholder="Add a general note, treatment comment, or tooth note...">${U.escapeHtml(localState.generalNoteDraft)}</textarea>
        <div style="margin-top:10px;margin-bottom:14px;"><button class="btn btn-primary btn-sm" id="saveNoteBtn">Save note</button></div>
        <div id="notesHolder">${renderNotesList(patient)}</div>
      </div>

      <div class="card">
        <div class="card-head"><h3 class="card-title">Appointment history</h3><span class="card-count">${apptHistory.length} total</span></div>
        ${renderApptHistory(apptHistory)}
      </div>
    `;

    paintToothPanel(patient);
    paintChartArea(patient);

    document.getElementById("editPatientBtn").onclick = () => window.LIDU_COMPONENTS.openEditPatientModal(patient, paint);

    document.getElementById("generalNoteInput").oninput = (e) => (localState.generalNoteDraft = e.target.value);
    document.getElementById("saveNoteBtn").onclick = async () => {
      if (!localState.generalNoteDraft.trim()) return;
      await DATA.addNote(patient.id, localState.generalNoteDraft.trim());
      localState.generalNoteDraft = "";
      window.LIDU_COMPONENTS.showToast("Note saved");
      paint();
    };

    document.getElementById("fileUploadInput").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const category = guessFileCategory(file);
      await DATA.addPatientFile(patient.id, { category, fileName: file.name, mimeType: file.type || "application/octet-stream" });
      window.LIDU_COMPONENTS.showToast(window.LIDU_CONFIG.dataSource === "mock" ? "File recorded (connect Google Drive to store the actual file)" : "File uploaded to Google Drive");
      paint();
    };
  }

  function guessFileCategory(file) {
    const name = file.name.toLowerCase();
    const type = (file.type || "").toLowerCase();
    if (type.startsWith("image/") && /xray|x-ray|rad/.test(name)) return "X-ray";
    if (type.startsWith("image/")) return "Intraoral photo";
    if (/prescription|rx/.test(name)) return "Prescription";
    if (type === "application/pdf" || /doc|report|treatment/.test(name)) return "Treatment document";
    return "Other";
  }

  const CHART_LEGEND = `
    <div class="chart-legend">
      <div class="legend-item"><span class="legend-dot" style="background:#D9DBE1;"></span>Healthy</div>
      <div class="legend-item"><span class="legend-dot" style="background:#3B7DED;"></span>Composite filling</div>
      <div class="legend-item"><span class="legend-dot" style="background:#E08A1E;"></span>Root canal</div>
      <div class="legend-item"><span class="legend-dot" style="background:#8B5CF6;"></span>Crown / bridge / implant</div>
      <div class="legend-item"><span class="legend-dot" style="background:#9CA3AF;"></span>Extraction</div>
    </div>
  `;

  async function selectSurfaceAndOpenModal(patient, tooth, surfaceKey, surfaceLabel, displayLabel) {
    localState.selectedSurfaceKey = surfaceKey;
    localState.selectedSurfaceLabel = surfaceLabel;
    localState.selectedDisplayLabel = displayLabel;
    paintToothPanel(patient);
    paintChartArea(patient);

    const history = (patient.chart[tooth] && patient.chart[tooth][surfaceLabel]) || [];
    // An existing surface opens Edit (on its latest entry) instead of creating a duplicate;
    // an untreated surface opens Add straight away — no extra click needed either way.
    const editIndex = history.length ? indexOfLatest(history) : null;

    window.LIDU_COMPONENTS.openTreatmentModal(
      { patient, tooth, surfaceKey, editIndex },
      async () => {
        const fresh = await DATA.getPatientById(patient.id);
        paintToothPanel(fresh);
        paintChartArea(fresh);
        paintTimelineAndSummary(fresh);
      }
    );
  }

  function indexOfLatest(history) {
    let bestIdx = 0;
    history.forEach((rec, i) => { if (rec.date >= history[bestIdx].date) bestIdx = i; });
    return bestIdx;
  }

  function paintTimelineAndSummary(patient) {
    const timelineHolder = document.getElementById("timelineHolder");
    if (timelineHolder) timelineHolder.innerHTML = renderTimeline(patient);
  }

  async function paintChartArea(patient) {
    const area = document.getElementById("chartAreaHolder");
    const tooth = localState.expandedTooth;

    if (tooth == null) {
      area.innerHTML = `
        <div class="hero-chart-wrap">
          <div class="hero-chart-svg-holder" id="toothChartHolder"></div>
          ${CHART_LEGEND}
        </div>
      `;
      window.LIDU_COMPONENTS.mountToothChart(document.getElementById("toothChartHolder"), patient, {
        onToothClick: (num) => {
          localState.expandedTooth = num;
          localState.selectedSurfaceKey = null;
          localState.selectedSurfaceLabel = null;
          localState.selectedDisplayLabel = null;
          paintToothPanel(patient);
          paintChartArea(patient);
        },
      });
      return;
    }

    area.innerHTML = `
      <div class="zoom-tooth-wrap">
        <button class="btn btn-ghost btn-sm" id="backToArchBtn">${ICONS.back}Back to full chart</button>
        <div class="zoom-tooth-heading">Tooth ${tooth}</div>
        <div class="zoom-tooth-stage">
          <div class="zoom-label zoom-label-top" id="zoomLabelTop"></div>
          <div class="zoom-label zoom-label-bottom" id="zoomLabelBottom"></div>
          <div class="zoom-label zoom-label-left" id="zoomLabelLeft"></div>
          <div class="zoom-label zoom-label-right" id="zoomLabelRight"></div>
          <div class="zoom-svg-holder" id="zoomChartHolder"></div>
        </div>
        ${CHART_LEGEND}
      </div>
    `;
    document.getElementById("backToArchBtn").onclick = () => {
      localState.expandedTooth = null;
      localState.selectedSurfaceKey = null;
      localState.selectedSurfaceLabel = null;
      localState.selectedDisplayLabel = null;
      paintToothPanel(patient);
      paintChartArea(patient);
    };

    const orientation = await window.LIDU_COMPONENTS.mountZoomedTooth(
      document.getElementById("zoomChartHolder"), patient, tooth,
      {
        selectedSurfaceKey: localState.selectedSurfaceKey,
        onSurfaceClick: (surfaceKey, surfaceLabel, displayLabel) => selectSurfaceAndOpenModal(patient, tooth, surfaceKey, surfaceLabel, displayLabel),
      }
    );

    if (orientation) {
      const facialLabel = orientation.facialLabel, lingualLabel = "Lingual";
      document.getElementById("zoomLabelTop").textContent = orientation.buccalSide === "top" ? facialLabel : lingualLabel;
      document.getElementById("zoomLabelBottom").textContent = orientation.buccalSide === "top" ? lingualLabel : facialLabel;
      document.getElementById("zoomLabelLeft").textContent = orientation.mesialSide === "left" ? "Mesial" : "Distal";
      document.getElementById("zoomLabelRight").textContent = orientation.mesialSide === "left" ? "Distal" : "Mesial";
    }
  }

  function paintToothPanel(patient) {
    const panel = document.getElementById("toothPanel");
    const box = document.getElementById("toothPanelBox");
    const tooth = localState.expandedTooth;
    const surfaceLabel = localState.selectedSurfaceLabel;
    if (box) box.classList.toggle("open", tooth != null);

    if (tooth == null) {
      panel.innerHTML = `<div class="tooth-panel-empty">Hover a tooth to preview it, click to expand its surfaces.</div>`;
      return;
    }

    if (surfaceLabel == null) {
      // Tooth expanded, no surface chosen yet — offer quick-select buttons too,
      // handy on touch devices where the SVG regions can be small to tap precisely.
      // Labels are computed per-tooth so incisors/canines correctly show
      // "Incisal" + "Facial / Labial" while premolars/molars show
      // "Occlusal" + "Buccal".
      const surfaceKeys = Object.keys(CL.SURFACE_KEY_TO_LABEL);
      panel.innerHTML = `
        <div class="tooth-head">
          <h4>Tooth ${tooth}</h4>
          <button class="btn btn-ghost btn-sm" id="deselectToothBtn">${ICONS.close}Deselect</button>
        </div>
        <p style="color:var(--text-muted);font-size:13px;margin:2px 0 10px;">Choose a surface to review or record a treatment.</p>
        <div class="surface-btns">
          ${surfaceKeys.map((key) => `<div class="surface-btn" data-quick-surface-key="${key}">${U.escapeHtml(CL.displayLabelFor(tooth, key))}</div>`).join("")}
        </div>
      `;
      panel.querySelector("#deselectToothBtn").onclick = () => { localState.expandedTooth = null; paint(); };
      panel.querySelectorAll("[data-quick-surface-key]").forEach((btn) => {
        btn.onclick = () => {
          const surfaceKey = btn.dataset.quickSurfaceKey;
          const surfaceLabelForKey = CL.SURFACE_KEY_TO_LABEL[surfaceKey];
          const displayLabelForKey = CL.displayLabelFor(tooth, surfaceKey);
          selectSurfaceAndOpenModal(patient, tooth, surfaceKey, surfaceLabelForKey, displayLabelForKey);
        };
      });
      return;
    }

    const history = (patient.chart[tooth] && patient.chart[tooth][surfaceLabel]) || [];
    const sortedHistory = history
      .map((rec, i) => ({ rec, i }))
      .sort((a, b) => {
        const byDate = b.rec.date.localeCompare(a.rec.date);
        return byDate !== 0 ? byDate : b.i - a.i; // same-date ties: most recently added wins
      });

    panel.innerHTML = `
      <div class="tooth-head">
        <h4>Tooth ${tooth} · ${U.escapeHtml(localState.selectedDisplayLabel)}</h4>
        <button class="btn btn-ghost btn-sm" id="backToSurfacesBtn">${ICONS.back}Surfaces</button>
      </div>
      ${sortedHistory.length ? `
        <div class="history-list">
          ${sortedHistory.map(({ rec, i }) => `
            <div class="tooth-record" data-edit-index="${i}" style="cursor:pointer;">
              <div class="tr-top">
                <div class="tr-surface">${i === sortedHistory[0].i ? "Latest" : "Earlier"}</div>
                <div class="tr-date">${U.fmtDateShort(rec.date)}</div>
              </div>
              <div class="tr-treatment">
                <span class="badge badge-${CL.treatTone(rec.treatment)}">${U.escapeHtml(rec.treatment)}</span>
                ${rec.notes ? `<div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${U.escapeHtml(rec.notes)}</div>` : ""}
              </div>
              <div class="tr-actions"><button class="btn btn-secondary btn-sm" data-edit-index-btn="${i}">${ICONS.edit}Edit</button></div>
            </div>
          `).join("")}
        </div>
      ` : `<p style="color:var(--text-muted);font-size:13px;margin:4px 0 0;">No treatment recorded on this surface yet.</p>`}

      <div style="margin-top:14px;"><button class="btn btn-primary btn-sm" id="startAddBtn">${ICONS.plus}${sortedHistory.length ? "Add another treatment" : "Add treatment"}</button></div>
    `;

    panel.querySelector("#backToSurfacesBtn").onclick = () => {
      localState.selectedSurfaceKey = null; localState.selectedSurfaceLabel = null; localState.selectedDisplayLabel = null;
      paintToothPanel(patient);
      paintChartArea(patient);
    };

    function openEdit(idx) {
      window.LIDU_COMPONENTS.openTreatmentModal(
        { patient, tooth, surfaceKey: localState.selectedSurfaceKey, editIndex: idx },
        async () => {
          const fresh = await DATA.getPatientById(patient.id);
          paintToothPanel(fresh);
          paintChartArea(fresh);
          paintTimelineAndSummary(fresh);
        }
      );
    }
    panel.querySelectorAll("[data-edit-index-btn]").forEach((btn) => {
      btn.onclick = (e) => { e.stopPropagation(); openEdit(Number(btn.dataset.editIndexBtn)); };
    });
    panel.querySelectorAll("[data-edit-index]").forEach((row) => {
      row.onclick = () => openEdit(Number(row.dataset.editIndex));
    });
    panel.querySelector("#startAddBtn").onclick = () => {
      window.LIDU_COMPONENTS.openTreatmentModal(
        { patient, tooth, surfaceKey: localState.selectedSurfaceKey, editIndex: null },
        async () => {
          const fresh = await DATA.getPatientById(patient.id);
          paintToothPanel(fresh);
          paintChartArea(fresh);
          paintTimelineAndSummary(fresh);
        }
      );
    };
  }

  function latestTreatment(patient) {
    let latest = null;
    Object.values(patient.chart).forEach((surfaces) => {
      Object.values(surfaces).forEach((history) => {
        history.forEach((rec) => {
          if (!latest || rec.date > latest.date) latest = rec;
        });
      });
    });
    return latest ? latest.treatment : null;
  }

  function renderFilesList(patient) {
    const files = patient.files || [];
    if (!files.length) return `<p style="color:var(--text-muted);font-size:13px;margin:0;">No files uploaded yet.</p>`;
    return files
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (f) => `
        <div class="file-row">
          <div class="file-icon">${ICONS.empty}</div>
          <div class="file-info">
            <div class="file-name">${U.escapeHtml(f.fileName)}</div>
            <div class="file-meta">${U.escapeHtml(f.category)} · ${U.fmtDateShort(f.date)}${f.driveUrl ? "" : " · pending Google Drive connection"}</div>
          </div>
          ${f.driveUrl ? `<a class="btn btn-secondary btn-sm" href="${f.driveUrl}" target="_blank" rel="noopener">Open</a>` : ""}
        </div>`
      )
      .join("");
  }

  function renderTimeline(patient) {
    const entries = [];
    Object.entries(patient.chart).forEach(([tooth, surfaces]) => {
      Object.entries(surfaces).forEach(([surf, history]) => {
        const surfaceKey = Object.keys(CL.SURFACE_KEY_TO_LABEL).find((k) => CL.SURFACE_KEY_TO_LABEL[k] === surf);
        const label = surfaceKey ? CL.displayLabelFor(tooth, surfaceKey) : surf;
        history.forEach((rec) => {
          entries.push({ date: rec.date, text: rec.treatment, sub: `Tooth ${tooth} · ${label}` });
        });
      });
    });
    entries.sort((a, b) => b.date.localeCompare(a.date));
    if (!entries.length) return `<div class="empty-row">No treatments recorded yet for this patient.</div>`;
    let html = "", lastYear = null;
    entries.forEach((e) => {
      const y = U.yearOf(e.date);
      if (y !== lastYear) { html += `<div class="timeline-year">${y}</div>`; lastYear = y; }
      html += `<div class="timeline-item"><div class="timeline-date">${U.fmtDateShort(e.date)}</div><div><div class="timeline-text">${U.escapeHtml(e.text)}</div><div class="timeline-sub">${U.escapeHtml(e.sub)}</div></div></div>`;
    });
    return html;
  }

  function renderNotesList(patient) {
    const notes = (patient.notes || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    if (!notes.length) return `<div class="empty-row">No notes yet for this patient.</div>`;
    return notes.map((n) => `<div class="note-item"><div class="note-date">${U.fmtDateFull(n.date)}</div><div class="note-text">${U.escapeHtml(n.text)}</div></div>`).join("");
  }

  function renderApptHistory(appts) {
    if (!appts.length) return `<div class="empty-row">No appointments recorded yet.</div>`;
    const TODAY = U.todayISO();
    return appts.map((a) => {
      const upcoming = a.date >= TODAY;
      return `<div class="appt-row">
        <div class="queue-time">${U.fmtDateShort(a.date)}</div>
        <div class="queue-info"><div class="queue-name">${U.fmtTime12(a.time)} · ${U.escapeHtml(a.treatment)}</div></div>
        <span class="badge ${upcoming ? "badge-purple" : "badge-success"}">${upcoming ? "Upcoming" : "Completed"}</span>
      </div>`;
    }).join("");
  }

  window.LIDU_COMPONENTS.initPatientWorkspacePage = window.LIDU_UTILS.withErrorBoundary(paint);
})();
