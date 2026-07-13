import CcmcSeal from './CcmcSeal';

// Ported from one.html's `.print-letterhead-wrap` blocks: an official-looking
// masthead (seal + org name, then a report-type badge + generation timestamp)
// that stays hidden on screen and is only shown while a PDF export is being
// captured — see the `.force-letterhead` rules in styles.css. `scopeLabel` is
// "Overall" or the active zone's name, matching the report actually on screen.
export default function PrintLetterhead({ scopeLabel, genDateLabel, genTimeLabel }) {
  return (
    <>
      <div className="print-letterhead-wrap">
        <div className="smart-city-badge">
          <CcmcSeal width={72} height={72} />
          <span className="sc-label">SMART CITY MISSION</span>
        </div>
        <div className="org-name-main">Coimbatore City Municipal Corporation</div>
      </div>
      <div className="print-letterhead-wrap">
        <div className="report-badge-row">
          <span className="report-badge kpi">KPI Parameter Report</span>
          <span className="report-badge overall">{scopeLabel}</span>
        </div>
        <div className="report-timestamp">
          Report generated on <b>{genDateLabel}</b> at <b>{genTimeLabel}</b>
        </div>
      </div>
    </>
  );
}
