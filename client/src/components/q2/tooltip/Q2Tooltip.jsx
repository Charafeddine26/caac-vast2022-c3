// client/src/components/q2/tooltip/Q2Tooltip.jsx
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { selectQ2Residents, selectQ2Clusters, selectQ2Monthly } from "../../../store/Q2DataSlice.js";
import { selectHoveredResident, selectHoveredMonth, selectSelectedCluster } from "../../../store/Q2InteractionSlice.js";
import * as d3 from "d3";

export default function Q2Tooltip() {
  const hoveredResidentId = useSelector(selectHoveredResident);
  const hoveredMonth = useSelector(selectHoveredMonth);
  const residents = useSelector(selectQ2Residents);
  const clusters = useSelector(selectQ2Clusters);
  const monthly = useSelector(selectQ2Monthly);
  const selectedCluster = useSelector(selectSelectedCluster);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  const style = {
    position: "fixed",
    left: mouse.x + 15,
    top: mouse.y - 10,
    pointerEvents: "none",
    background: "white",
    border: "1px solid #ccc",
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "13px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    zIndex: 1000,
    lineHeight: 1.5,
  };

  // Mode 1: Resident hover (from Panel F)
  if (hoveredResidentId !== null) {
    const res = residents.find((r) => r.participantId === hoveredResidentId);
    if (!res) return null;
    const cl = clusters.find((c) => c.cluster === res.cluster);

    return (
      <div style={style}>
        <div style={{ fontWeight: "bold" }}>Resident {res.participantId}</div>
        <div style={{ color: cl?.color }}>Cluster: {cl?.label}</div>
        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div>Avg income: ${res.avg_income.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</div>
        <div>Avg expenses: ${res.avg_expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo</div>
        <div>Net balance trend: {res.net_balance_slope >= 0 ? "+" : ""}{res.net_balance_slope.toFixed(1)}/mo</div>
        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div>Age: {res.age}</div>
        <div>Education: {res.educationLevel}</div>
        <div>Household size: {res.householdSize}</div>
      </div>
    );
  }

  // Mode 2: Month hover (from Panel E box plots)
  if (hoveredMonth !== null) {
    // Compute stats for this month
    const activeIds = selectedCluster !== null
      ? new Set(residents.filter((r) => r.cluster === selectedCluster).map((r) => r.participantId))
      : null;
    const monthRecords = monthly.filter((r) => r.month === hoveredMonth);
    const filtered = activeIds ? monthRecords.filter((r) => activeIds.has(r.participantId)) : monthRecords;
    const values = filtered.map((r) => r.net_balance).sort(d3.ascending);
    const median = d3.quantile(values, 0.5);
    const q1 = d3.quantile(values, 0.25);
    const q3 = d3.quantile(values, 0.75);
    const belowZero = values.filter((v) => v < 0).length;
    const label = d3.timeFormat("%B %Y")(new Date(hoveredMonth));

    return (
      <div style={style}>
        <div style={{ fontWeight: "bold" }}>{label}</div>
        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
        <div>Median net balance: ${median?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <div>Q1: ${q1?.toLocaleString(undefined, { maximumFractionDigits: 0 })} &middot; Q3: ${q3?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        <div>Residents below $0: {belowZero}</div>
      </div>
    );
  }

  return null;
}
