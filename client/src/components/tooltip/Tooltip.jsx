import { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { selectEmployers } from "../../store/DataSetSlice.js";
import { selectHoveredEmployer } from "../../store/InteractionSlice.js";

export default function Tooltip() {
  const hoveredId = useSelector(selectHoveredEmployer);
  const employers = useSelector(selectEmployers);
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
      <div>Avg employees: {emp.avg_employees.toFixed(1)}</div>
      <div>Wage trend: {emp.wage_slope.toFixed(2)}/month</div>
      <div>Employee trend: {emp.employee_slope.toFixed(2)}/month</div>
      <div>Total wages: ${emp.total_wages.toLocaleString()}</div>
    </div>
  );
}
