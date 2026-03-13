// client/src/components/q3/tooltip/Q3Tooltip.jsx
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { selectQ3Employers } from "../../../store/Q3DataSlice.js";
import { selectQ3HoveredEmployer } from "../../../store/Q3InteractionSlice.js";

export default function Q3Tooltip() {
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const employers = useSelector(selectQ3Employers);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  if (hoveredId === null) return null;

  const emp = employers.find((d) => d.employerId === hoveredId);
  if (!emp) return null;

  return (
    <div
      style={{
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
      }}
    >
      <div style={{ fontWeight: "bold" }}>Employer {emp.employerId}</div>
      <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
      <div>Avg headcount: {emp.avg_headcount.toFixed(1)}</div>
      <div>Avg turnover: {(emp.avg_turnover * 100).toFixed(1)}%</div>
      <div>Total arrivals: {emp.total_arrivals}</div>
      <div>Total departures: {emp.total_departures}</div>
      <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
      <div>Avg tenure: {emp.avg_tenure.toFixed(1)} months</div>
      <div>Avg hourly rate: ${emp.avg_hourly_rate.toFixed(2)}</div>
    </div>
  );
}
