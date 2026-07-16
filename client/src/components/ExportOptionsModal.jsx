import { useState } from 'react';

// Shown when the admin/commissioner clicks "Download Report (PDF/Excel)" —
// lets them pick which sections go into that one file (Overall, one or more
// zones individually or "All Zones" line-by-line, and a department-wise
// totals summary) instead of always exporting just whatever's on screen.
//
// `initialView`/`initialZoneId` seed sensible defaults so a user who doesn't
// touch any checkbox and just clicks Generate gets exactly the old
// behavior (whatever report they were already looking at) — the new
// combined-sections power only kicks in once they check more boxes.
export default function ExportOptionsModal({ zones, format, initialView, initialZoneId, onClose, onConfirm }) {
  const [overall, setOverall] = useState(initialView === 'overall');
  const [zoneWise, setZoneWise] = useState(initialView === 'zone');
  const [allZones, setAllZones] = useState(false);
  const [selectedZoneIds, setSelectedZoneIds] = useState(
    initialView === 'zone' && initialZoneId != null ? [initialZoneId] : []
  );
  const [deptSummary, setDeptSummary] = useState(false);

  function toggleZone(id) {
    setSelectedZoneIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleZoneWiseToggle(checked) {
    setZoneWise(checked);
    if (checked && !allZones && selectedZoneIds.length === 0 && initialZoneId != null) {
      setSelectedZoneIds([initialZoneId]);
    }
  }

  const zoneIdsToExport = zoneWise ? (allZones ? zones.map((z) => z.id) : selectedZoneIds) : [];
  const nothingSelected = !overall && zoneIdsToExport.length === 0 && !deptSummary;

  function handleGenerate() {
    onConfirm({ overall, zoneIds: zoneIdsToExport, deptSummary });
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card export-options-card">
        <div className="modal-head">
          <div>
            <div className="modal-dept">Choose sections to include</div>
            <div className="modal-title">Download Report ({format === 'pdf' ? 'PDF' : 'Excel'})</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="export-options-body">
          <label className="export-check-row">
            <input type="checkbox" checked={overall} onChange={(e) => setOverall(e.target.checked)} />
            Overall (Citywide)
          </label>

          <label className="export-check-row">
            <input type="checkbox" checked={zoneWise} onChange={(e) => handleZoneWiseToggle(e.target.checked)} />
            Zone-wise
          </label>

          {zoneWise && (
            <div className="export-zone-sub">
              <label className="export-check-row indent">
                <input type="checkbox" checked={allZones} onChange={(e) => setAllZones(e.target.checked)} />
                All Zones (each zone, line by line)
              </label>
              {!allZones &&
                zones.map((z) => (
                  <label className="export-check-row indent" key={z.id}>
                    <input type="checkbox" checked={selectedZoneIds.includes(z.id)} onChange={() => toggleZone(z.id)} />
                    {z.name} Zone
                  </label>
                ))}
            </div>
          )}

          <label className="export-check-row">
            <input type="checkbox" checked={deptSummary} onChange={(e) => setDeptSummary(e.target.checked)} />
            Department-wise Summary (citywide total per department)
          </label>

          {nothingSelected && <p className="export-options-hint">Pick at least one section to generate a report.</p>}
        </div>

        <div className="export-modal-actions">
          <button type="button" className="mini-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="mini-btn save" disabled={nothingSelected} onClick={handleGenerate}>
            Generate {format === 'pdf' ? 'PDF' : 'Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}
