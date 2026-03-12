// client/src/components/q2/boxplot/BoxPlotContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ2Monthly, selectQ2Residents, selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import {
  selectHoveredResident,
  selectSelectedResidents,
  selectSelectedCluster,
  setHoveredMonth,
} from "../../../store/Q2InteractionSlice.js";
import BoxPlotD3 from "./BoxPlotD3.js";
import * as d3 from "d3";

function computeBoxStats(monthly, residents, selectedCluster) {
  const activeIds = selectedCluster !== null
    ? new Set(residents.filter((r) => r.cluster === selectedCluster).map((r) => r.participantId))
    : null;

  const byMonth = d3.groups(monthly, (d) => d.month);
  return byMonth.map(([month, records]) => {
    const filtered = activeIds ? records.filter((r) => activeIds.has(r.participantId)) : records;
    const values = filtered.map((r) => r.net_balance).sort(d3.ascending);
    const q1 = d3.quantile(values, 0.25);
    const median = d3.quantile(values, 0.5);
    const q3 = d3.quantile(values, 0.75);
    const iqr = q3 - q1;
    const whiskerLow = Math.max(d3.min(values), q1 - 1.5 * iqr);
    const whiskerHigh = Math.min(d3.max(values), q3 + 1.5 * iqr);
    const outliers = values.filter((v) => v < whiskerLow || v > whiskerHigh);
    return { month, q1, median, q3, whiskerLow, whiskerHigh, outliers };
  }).sort((a, b) => new Date(a.month) - new Date(b.month));
}

export default function BoxPlotContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const monthly = useSelector(selectQ2Monthly);
  const residents = useSelector(selectQ2Residents);
  const clusters = useSelector(selectQ2Clusters);
  const hoveredId = useSelector(selectHoveredResident);
  const selectedIds = useSelector(selectSelectedResidents);
  const selectedCluster = useSelector(selectSelectedCluster);

  const fullPopStats = useMemo(
    () => computeBoxStats(monthly, residents, null),
    [monthly, residents]
  );

  const currentStats = useMemo(
    () => selectedCluster !== null
      ? computeBoxStats(monthly, residents, selectedCluster)
      : fullPopStats,
    [monthly, residents, selectedCluster, fullPopStats]
  );

  const controllerMethods = useMemo(
    () => ({
      handleMonthHover: (month) => dispatch(setHoveredMonth(month)),
      handleMonthUnhover: () => dispatch(setHoveredMonth(null)),
    }),
    [dispatch]
  );

  // Build a color scale for highlight dots: participantId → cluster color
  const residentColorScale = useMemo(() => {
    const clusterColorMap = {};
    clusters.forEach((c) => { clusterColorMap[c.cluster] = c.color; });
    const map = {};
    residents.forEach((r) => { map[r.participantId] = clusterColorMap[r.cluster] || "#1565c0"; });
    return (id) => map[id] || "#1565c0";
  }, [residents, clusters]);

  useEffect(() => {
    const instance = new BoxPlotD3(ref.current, controllerMethods);
    instance.create({ width: 700, height: 350 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && currentStats.length > 0) {
      const refStats = selectedCluster !== null ? fullPopStats : null;
      d3Ref.current.update(currentStats, refStats, selectedCluster);
    }
  }, [currentStats, fullPopStats, selectedCluster]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds, monthly, residentColorScale);
    }
  }, [hoveredId, selectedIds, monthly, residentColorScale]);

  return <div ref={ref} className="boxplot-panel"><h3 className="panel-title">Net Balance Distribution (per resident)</h3></div>;
}
