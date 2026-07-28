/**
 * LIDU — shared modals
 * Add Walk-in, Add Patient, and Add Appointment all follow the same
 * pattern: they own a small overlay appended to document.body, manage
 * their own form state, save through dataService, then call back into
 * the page that opened them so it can refresh.
 */
window.LIDU_COMPONENTS = window.LIDU_COMPONENTS || {};

(function () {
  const U = window.LIDU_UTILS;
  const CL = window.LIDU_CLINICAL;
  const ICONS = window.LIDU_ICONS;
  const DATA = window.LIDU_DATA;

  let overlayEl = null;
  let bodyOverflowBeforeModal = null;

  function closeModal() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (bodyOverflowBeforeModal != null) { document.body.style.overflow = bodyOverflowBeforeModal; bodyOverflowBeforeModal = null; }
  }

  function trapFocus(container) {
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function mountOverlay(html) {
    closeModal();
    if (window.LIDU_COMPONENTS.hideToothTooltip) window.LIDU_COMPONENTS.hideToothTooltip();
    bodyOverflowBeforeModal = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    overlayEl = document.createElement("div");
    overlayEl.innerHTML = html;
    document.body.appendChild(overlayEl.firstElementChild);
    overlayEl = document.body.lastElementChild;
    overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeModal(); });
    trapFocus(overlayEl);
    return overlayEl;
  }

  // Escape closes whichever modal is currently open, wired once per page load.
  let escapeWired = false;
  if (!escapeWired) {
    escapeWired = true;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlayEl) closeModal(); });
  }

  // ---------------- Add walk-in ----------------
  window.LIDU_COMPONENTS.openWalkinModal = async function (onSaved) {
    const patients = await DATA.getPatients();
    const state = { query: "", matchId: null, time: U.clockTimeNow().replace(/ (AM|PM)/, ""), treatment: "", name: "", phone: "" };

    function matches() {
      if (!state.query.trim()) return [];
      const q = state.query.toLowerCase();
      return patients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q));
    }

    function paint() {
      const m = matches();
      const el = mountOverlay(`<div class="overlay center"></div>`);
      el.innerHTML = `
        <div class="modal">
          <div class="drawer-head"><h3>Add walk-in</h3><span class="close-x" id="wkClose">${ICONS.close}</span></div>
          <div class="field"><label>Search existing patient</label><input class="input" id="wkQuery" placeholder="Search by name or phone" value="${U.escapeHtml(state.query)}"></div>
          ${state.query.trim() ? (m.length ? `<div class="treat-list" style="margin-bottom:16px;">${m.map((p) => `<div class="treat-opt ${state.matchId === p.id ? "selected" : ""}" data-match="${p.id}">${U.escapeHtml(p.name)} · ${U.escapeHtml(p.phone)}</div>`).join("")}</div>` : `<p style="font-size:13px;color:var(--text-muted);margin:0 0 14px;">No matching patient. Fill in the details below to create a new record.</p>`) : ""}
          ${state.matchId || !m.length ? `
            <div class="grid-2">
              <div class="field"><label>Appointment time</label><input type="time" class="input" id="wkTime" value="${state.time}"></div>
              <div class="field"><label>Planned treatment ${state.matchId ? "" : "(optional)"}</label>
                <select class="input" id="wkTreatment"><option value="">Select treatment</option>${CL.TREATMENTS.map((t) => `<option value="${t}" ${state.treatment === t ? "selected" : ""}>${t}</option>`).join("")}</select>
              </div>
            </div>` : ""}
          ${!state.matchId && state.query.trim() && !m.length ? `
            <div class="field"><label>Full name</label><input class="input" id="wkName" value="${U.escapeHtml(state.name)}"></div>
            <div class="field"><label>Contact number</label><input class="input" id="wkPhone" value="${U.escapeHtml(state.phone)}"></div>` : ""}
          <div class="row" style="justify-content:flex-end;margin-top:8px;">
            <button class="btn btn-secondary" id="wkCancel">Cancel</button>
            <button class="btn btn-primary" id="wkSave">Add to queue</button>
          </div>
        </div>
      `;
      el.querySelector("#wkClose").onclick = closeModal;
      el.querySelector("#wkCancel").onclick = closeModal;
      el.querySelector("#wkQuery").oninput = (e) => { state.query = e.target.value; state.matchId = null; paint(); el.querySelector("#wkQuery").focus(); };
      el.querySelectorAll("[data-match]").forEach((row) => (row.onclick = () => { state.matchId = row.dataset.match; paint(); }));
      const timeEl = el.querySelector("#wkTime"); if (timeEl) timeEl.oninput = (e) => (state.time = e.target.value);
      const treatEl = el.querySelector("#wkTreatment"); if (treatEl) treatEl.oninput = (e) => (state.treatment = e.target.value);
      const nameEl = el.querySelector("#wkName"); if (nameEl) nameEl.oninput = (e) => (state.name = e.target.value);
      const phoneEl = el.querySelector("#wkPhone"); if (phoneEl) phoneEl.oninput = (e) => (state.phone = e.target.value);
      el.querySelector("#wkSave").onclick = async () => {
        let patientId = state.matchId;
        if (!patientId) {
          if (!state.name.trim() || !state.phone.trim()) { window.LIDU_COMPONENTS.showToast("Add a name and contact number"); return; }
          const np = await DATA.addPatient({ name: state.name.trim(), phone: state.phone.trim(), age: "", gender: "", address: "" });
          patientId = np.id;
        }
        await DATA.addAppointment({ patientId, date: window.LIDU_MOCK.TODAY, time: state.time || U.clockTimeNow(), treatment: state.treatment || "Walk-in visit" });
        closeModal();
        window.LIDU_COMPONENTS.showToast("Added to today's queue");
        if (onSaved) onSaved();
      };
    }
    paint();
  };

  // ---------------- Add patient ----------------
  function patientFormFields(idPrefix, state) {
    return `
      <div class="grid-2">
        <div class="field"><label>Full name</label><input class="input" id="${idPrefix}Name" value="${U.escapeHtml(state.name)}"></div>
        <div class="field"><label>Age</label><input type="number" min="0" class="input" id="${idPrefix}Age" value="${U.escapeHtml(state.age)}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Gender</label><select class="input" id="${idPrefix}Gender"><option ${state.gender === "Female" ? "selected" : ""}>Female</option><option ${state.gender === "Male" ? "selected" : ""}>Male</option><option ${state.gender === "Other" ? "selected" : ""}>Other</option></select></div>
        <div class="field"><label>Contact number</label><input class="input" id="${idPrefix}Phone" value="${U.escapeHtml(state.phone)}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Birthday</label><input type="date" class="input" id="${idPrefix}Birthday" value="${state.birthDate || ""}"></div>
        <div class="field"><label>Email address</label><input type="email" class="input" id="${idPrefix}Email" value="${U.escapeHtml(state.email)}"></div>
      </div>
      <div class="field"><label>Address (optional)</label><input class="input" id="${idPrefix}Address" value="${U.escapeHtml(state.address)}"></div>
      <div class="field"><label>Medical alerts (optional, comma separated)</label><input class="input" id="${idPrefix}Alerts" value="${U.escapeHtml(state.medicalAlerts)}"></div>
    `;
  }

  function wirePatientFormFields(el, idPrefix, state) {
    el.querySelector(`#${idPrefix}Name`).oninput = (e) => (state.name = e.target.value);
    el.querySelector(`#${idPrefix}Age`).oninput = (e) => (state.age = e.target.value);
    el.querySelector(`#${idPrefix}Gender`).oninput = (e) => (state.gender = e.target.value);
    el.querySelector(`#${idPrefix}Phone`).oninput = (e) => (state.phone = e.target.value);
    el.querySelector(`#${idPrefix}Birthday`).oninput = (e) => (state.birthDate = e.target.value);
    el.querySelector(`#${idPrefix}Email`).oninput = (e) => (state.email = e.target.value);
    el.querySelector(`#${idPrefix}Address`).oninput = (e) => (state.address = e.target.value);
    el.querySelector(`#${idPrefix}Alerts`).oninput = (e) => (state.medicalAlerts = e.target.value);
  }

  window.LIDU_COMPONENTS.openAddPatientModal = function (onSaved) {
    const state = { name: "", age: "", gender: "Female", phone: "", address: "", medicalAlerts: "", email: "", birthDate: "" };
    function paint() {
      const el = mountOverlay(`<div class="overlay center"></div>`);
      el.innerHTML = `
        <div class="modal">
          <div class="drawer-head"><h3>Add patient</h3><span class="close-x" id="apClose">${ICONS.close}</span></div>
          ${patientFormFields("ap", state)}
          <div class="row" style="justify-content:flex-end;margin-top:8px;">
            <button class="btn btn-secondary" id="apCancel">Cancel</button>
            <button class="btn btn-primary" id="apSave">Save patient</button>
          </div>
        </div>
      `;
      el.querySelector("#apClose").onclick = closeModal;
      el.querySelector("#apCancel").onclick = closeModal;
      wirePatientFormFields(el, "ap", state);
      el.querySelector("#apSave").onclick = async () => {
        if (!state.name.trim() || !state.phone.trim()) { window.LIDU_COMPONENTS.showToast("Name and contact number are required"); return; }
        const alerts = state.medicalAlerts.split(",").map((s) => s.trim()).filter(Boolean);
        await DATA.addPatient({
          name: state.name.trim(), age: Number(state.age) || "", gender: state.gender, phone: state.phone.trim(),
          address: state.address.trim(), medicalAlerts: alerts, email: state.email.trim(), birthDate: state.birthDate || "",
        });
        closeModal();
        window.LIDU_COMPONENTS.showToast("Patient added");
        if (onSaved) onSaved();
      };
    }
    paint();
  };

  // ---------------- Edit patient ----------------
  window.LIDU_COMPONENTS.openEditPatientModal = function (patient, onSaved) {
    const state = {
      name: patient.name || "", age: patient.age || "", gender: patient.gender || "Female", phone: patient.phone || "",
      address: patient.address || "", medicalAlerts: (patient.medicalAlerts || []).join(", "),
      email: patient.email || "", birthDate: patient.birthDate || "",
    };
    function paint() {
      const el = mountOverlay(`<div class="overlay center"></div>`);
      el.innerHTML = `
        <div class="modal">
          <div class="drawer-head"><h3>Edit patient</h3><span class="close-x" id="epClose">${ICONS.close}</span></div>
          ${patientFormFields("ep", state)}
          <div class="row" style="justify-content:flex-end;margin-top:8px;">
            <button class="btn btn-secondary" id="epCancel">Cancel</button>
            <button class="btn btn-primary" id="epSave">Save changes</button>
          </div>
        </div>
      `;
      el.querySelector("#epClose").onclick = closeModal;
      el.querySelector("#epCancel").onclick = closeModal;
      wirePatientFormFields(el, "ep", state);
      el.querySelector("#epSave").onclick = async () => {
        if (!state.name.trim() || !state.phone.trim()) { window.LIDU_COMPONENTS.showToast("Name and contact number are required"); return; }
        const alerts = state.medicalAlerts.split(",").map((s) => s.trim()).filter(Boolean);
        await DATA.updatePatient(patient.id, {
          name: state.name.trim(), age: Number(state.age) || "", gender: state.gender, phone: state.phone.trim(),
          address: state.address.trim(), medicalAlerts: alerts, email: state.email.trim(), birthDate: state.birthDate || "",
        });
        closeModal();
        window.LIDU_COMPONENTS.showToast("Patient updated");
        if (onSaved) onSaved();
      };
    }
    paint();
  };

  // ---------------- Add appointment ----------------
  window.LIDU_COMPONENTS.openAddAppointmentModal = async function (defaultDate, onSaved) {
    const patients = await DATA.getPatients();
    const state = { query: "", matchId: null, date: defaultDate || U.todayISO(), time: "09:00", treatment: "" };

    function matches() {
      if (!state.query.trim()) return [];
      const q = state.query.toLowerCase();
      return patients.filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q));
    }

    function paint() {
      const m = matches();
      const el = mountOverlay(`<div class="overlay center"></div>`);
      el.innerHTML = `
        <div class="modal">
          <div class="drawer-head"><h3>Add appointment</h3><span class="close-x" id="aaClose">${ICONS.close}</span></div>
          <div class="field"><label>Patient</label><input class="input" id="aaQuery" placeholder="Search by name or phone" value="${U.escapeHtml(state.query)}"></div>
          ${state.query.trim() ? `<div class="treat-list" style="margin-bottom:16px;">${m.length ? m.map((p) => `<div class="treat-opt ${state.matchId === p.id ? "selected" : ""}" data-match="${p.id}">${U.escapeHtml(p.name)} · ${U.escapeHtml(p.phone)}</div>`).join("") : `<div style="font-size:13px;color:var(--text-muted);padding:8px 2px;">No matching patient found.</div>`}</div>` : ""}
          <div class="grid-2">
            <div class="field"><label>Date</label><input type="date" class="input" id="aaDate" value="${state.date}"></div>
            <div class="field"><label>Time</label><input type="time" class="input" id="aaTime" value="${state.time}"></div>
          </div>
          <div class="field"><label>Planned treatment</label><select class="input" id="aaTreatment"><option value="">Select treatment</option>${CL.TREATMENTS.map((t) => `<option value="${t}" ${state.treatment === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="row" style="justify-content:flex-end;margin-top:8px;">
            <button class="btn btn-secondary" id="aaCancel">Cancel</button>
            <button class="btn btn-primary" id="aaSave" ${state.matchId ? "" : "disabled"}>Save appointment</button>
          </div>
        </div>
      `;
      el.querySelector("#aaClose").onclick = closeModal;
      el.querySelector("#aaCancel").onclick = closeModal;
      el.querySelector("#aaQuery").oninput = (e) => { state.query = e.target.value; state.matchId = null; paint(); el.querySelector("#aaQuery").focus(); };
      el.querySelectorAll("[data-match]").forEach((row) => (row.onclick = () => { state.matchId = row.dataset.match; paint(); }));
      el.querySelector("#aaDate").oninput = (e) => (state.date = e.target.value);
      el.querySelector("#aaTime").oninput = (e) => (state.time = e.target.value);
      el.querySelector("#aaTreatment").oninput = (e) => (state.treatment = e.target.value);
      const saveBtn = el.querySelector("#aaSave");
      saveBtn.onclick = async () => {
        if (!state.matchId || !state.date || !state.time) { window.LIDU_COMPONENTS.showToast("Select a patient, date, and time"); return; }
        await DATA.addAppointment({ patientId: state.matchId, date: state.date, time: state.time, treatment: state.treatment || "Consultation" });
        if (state.date <= U.todayISO()) await DATA.updatePatientLastVisit(state.matchId, state.date);
        closeModal();
        window.LIDU_COMPONENTS.showToast("Appointment added");
        if (onSaved) onSaved();
      };
    }
    paint();
  };

  // ---------------- Add / Edit / Delete treatment ----------------
  /**
   * @param {object} opts - {
   *   patient, tooth, surfaceKey,
   *   editIndex (null when adding a new record, otherwise the history index being edited)
   * }
   * @param {function} onSaved - called after save/delete so the caller can refresh
   */
  window.LIDU_COMPONENTS.openTreatmentModal = function (opts, onSaved) {
    const { patient, tooth } = opts;
    const isEditing = opts.editIndex != null;
    const existingRecord = isEditing ? patient.chart[tooth][CL.SURFACE_KEY_TO_LABEL[opts.surfaceKey]][opts.editIndex] : null;

    const state = {
      surfaceKey: opts.surfaceKey,
      treatment: isEditing ? existingRecord.treatment : null,
      notes: isEditing ? existingRecord.notes || "" : "",
      date: isEditing ? existingRecord.date : U.todayISO(),
    };

    function paint() {
      const surfaceKeys = Object.keys(CL.SURFACE_KEY_TO_LABEL);
      const el = mountOverlay(`<div class="overlay center"></div>`);
      el.innerHTML = `
        <div class="modal">
          <div class="drawer-head"><h3>${isEditing ? "Edit treatment" : "Add treatment"} · Tooth ${tooth}</h3><span class="close-x" id="tmClose">${ICONS.close}</span></div>
          <div class="field">
            <label>Surface</label>
            <div class="surface-btns">
              ${surfaceKeys.map((k) => `<div class="surface-btn ${state.surfaceKey === k ? "selected" : ""}" data-surface-key="${k}">${U.escapeHtml(CL.displayLabelFor(tooth, k))}</div>`).join("")}
            </div>
          </div>
          <div class="field">
            <label>Treatment</label>
            <div class="treat-chip-list">
              ${CL.TREATMENTS.map((t) => `<div class="treat-chip ${state.treatment === t ? "selected" : ""}" data-treatment="${U.escapeHtml(t)}">${t}</div>`).join("")}
            </div>
          </div>
          <div class="field"><label>Date</label><input type="date" class="input" id="tmDate" value="${state.date}"></div>
          <div class="field"><label>Clinical notes (optional)</label><textarea class="input" id="tmNotes" placeholder="Add clinical notes...">${U.escapeHtml(state.notes)}</textarea></div>
          <div class="row" style="justify-content:space-between;margin-top:8px;">
            <div>${isEditing ? `<button class="btn btn-danger btn-sm" id="tmDelete">Delete record</button>` : ""}</div>
            <div class="row">
              <button class="btn btn-secondary" id="tmCancel">Cancel</button>
              <button class="btn btn-primary" id="tmSave" ${state.treatment ? "" : "disabled"}>${isEditing ? "Save changes" : "Save treatment"}</button>
            </div>
          </div>
        </div>
      `;
      el.querySelector("#tmClose").onclick = closeModal;
      el.querySelector("#tmCancel").onclick = closeModal;
      el.querySelectorAll("[data-surface-key]").forEach((btn) => (btn.onclick = () => { state.surfaceKey = btn.dataset.surfaceKey; paint(); }));
      el.querySelectorAll("[data-treatment]").forEach((btn) => (btn.onclick = () => { state.treatment = btn.dataset.treatment; paint(); }));
      el.querySelector("#tmDate").oninput = (e) => (state.date = e.target.value);
      el.querySelector("#tmNotes").oninput = (e) => (state.notes = e.target.value);

      const deleteBtn = el.querySelector("#tmDelete");
      if (deleteBtn) deleteBtn.onclick = async () => {
        const surfaceLabel = CL.SURFACE_KEY_TO_LABEL[opts.surfaceKey];
        await DATA.deleteTreatment(patient.id, tooth, surfaceLabel, opts.editIndex);
        closeModal();
        window.LIDU_COMPONENTS.showToast("Treatment record deleted");
        if (onSaved) onSaved();
      };

      el.querySelector("#tmSave").onclick = async () => {
        if (!state.treatment || !state.date) return;
        const newSurfaceLabel = CL.SURFACE_KEY_TO_LABEL[state.surfaceKey];
        const record = { treatment: state.treatment, notes: state.notes, date: state.date };
        if (isEditing) {
          const oldSurfaceLabel = CL.SURFACE_KEY_TO_LABEL[opts.surfaceKey];
          if (state.surfaceKey !== opts.surfaceKey) {
            // Moved to a different surface: remove from the old one, add fresh to the new one.
            await DATA.deleteTreatment(patient.id, tooth, oldSurfaceLabel, opts.editIndex);
            await DATA.saveTreatment(patient.id, tooth, newSurfaceLabel, record);
          } else {
            await DATA.saveTreatment(patient.id, tooth, newSurfaceLabel, record, opts.editIndex);
          }
        } else {
          await DATA.saveTreatment(patient.id, tooth, newSurfaceLabel, record);
        }
        closeModal();
        window.LIDU_COMPONENTS.showToast("Treatment saved");
        if (onSaved) onSaved(state.surfaceKey);
      };
    }
    paint();
  };
  // ---------------- Edit / reschedule appointment ----------------
  window.LIDU_COMPONENTS.openEditAppointmentModal = function (appt, patientName, onSaved) {
    const state = { date: appt.date, time: appt.time, treatment: appt.treatment || "" };
    function paint() {
      const el = mountOverlay(`<div class="overlay center"></div>`);
      el.innerHTML = `
        <div class="modal">
          <div class="drawer-head"><h3>Edit appointment</h3><span class="close-x" id="eaClose">${ICONS.close}</span></div>
          <div class="field"><label>Patient</label><div style="font-size:14px;font-weight:600;padding:10px 0;">${U.escapeHtml(patientName)}</div></div>
          <div class="grid-2">
            <div class="field"><label>Date</label><input type="date" class="input" id="eaDate" value="${state.date}"></div>
            <div class="field"><label>Time</label><input type="time" class="input" id="eaTime" value="${state.time}"></div>
          </div>
          <div class="field"><label>Planned treatment</label>
            <select class="input" id="eaTreatment">${CL.TREATMENTS.map((t) => `<option value="${t}" ${state.treatment === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
          <div class="row" style="justify-content:space-between;margin-top:8px;">
            <button class="btn btn-danger btn-sm" id="eaCancelAppt">Cancel appointment</button>
            <div class="row">
              <button class="btn btn-secondary" id="eaClose2">Close</button>
              <button class="btn btn-primary" id="eaSave">Save changes</button>
            </div>
          </div>
        </div>
      `;
      el.querySelector("#eaClose").onclick = closeModal;
      el.querySelector("#eaClose2").onclick = closeModal;
      el.querySelector("#eaDate").oninput = (e) => (state.date = e.target.value);
      el.querySelector("#eaTime").oninput = (e) => (state.time = e.target.value);
      el.querySelector("#eaTreatment").oninput = (e) => (state.treatment = e.target.value);
      el.querySelector("#eaCancelAppt").onclick = async () => {
        await DATA.deleteAppointment(appt.id);
        closeModal();
        window.LIDU_COMPONENTS.showToast("Appointment cancelled");
        if (onSaved) onSaved();
      };
      el.querySelector("#eaSave").onclick = async () => {
        if (!state.date || !state.time) { window.LIDU_COMPONENTS.showToast("Date and time are required"); return; }
        await DATA.updateAppointment(appt.id, { date: state.date, time: state.time, treatment: state.treatment });
        closeModal();
        window.LIDU_COMPONENTS.showToast("Appointment updated");
        if (onSaved) onSaved();
      };
    }
    paint();
  };
})();
