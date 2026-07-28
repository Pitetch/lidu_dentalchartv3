/**
 * LIDU — appointment row component
 * One appointment, rendered consistently everywhere it appears (Today's
 * Queue, Tomorrow's Appointments, mini calendar day list, Calendar page
 * day view). Clicking the row navigates to that patient's workspace;
 * clicking the edit icon opens the reschedule/edit modal instead.
 */
window.LIDU_COMPONENTS = window.LIDU_COMPONENTS || {};

window.LIDU_COMPONENTS.renderAppointmentRow = function (appt, patient) {
  const U = window.LIDU_UTILS;
  const CL = window.LIDU_CLINICAL;
  const ICONS = window.LIDU_ICONS;
  if (!patient) return "";
  return `<a class="queue-row" href="patient-workspace.html?id=${encodeURIComponent(patient.id)}" style="border-left:3px solid ${CL.getCalColor(appt.treatment)};padding-left:9px;text-decoration:none;color:inherit;">
    <div class="queue-time">${U.fmtTime12(appt.time)}</div>
    <div class="avatar">${U.initials(patient.name)}</div>
    <div class="queue-info"><div class="queue-name">${U.escapeHtml(patient.name)}</div><div class="queue-treat">${U.escapeHtml(appt.treatment)}</div></div>
    <button class="btn btn-ghost btn-sm" data-edit-appt="${appt.id}" title="Edit appointment" style="flex-shrink:0;">${ICONS.edit}</button>
  </a>`;
};

// Call after inserting rendered rows into the DOM: wires up every
// [data-edit-appt] button within `container` to open the edit/reschedule
// modal instead of navigating (the row itself is still a normal link).
window.LIDU_COMPONENTS.wireEditApptButtons = function (container, onSaved) {
  if (!container) return;
  container.querySelectorAll("[data-edit-appt]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const DATA = window.LIDU_DATA;
      const appt = await DATA.getAppointmentById(btn.dataset.editAppt);
      if (!appt) return;
      const patient = await DATA.getPatientById(appt.patientId);
      window.LIDU_COMPONENTS.openEditAppointmentModal(appt, patient ? patient.name : "Unknown patient", onSaved);
    };
  });
};
