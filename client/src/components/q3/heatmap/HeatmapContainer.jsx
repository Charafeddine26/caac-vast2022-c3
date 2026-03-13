// client/src/components/q3/heatmap/HeatmapContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ3Monthly, selectQ3Employers } from "../../../store/Q3DataSlice.js";
import {
  selectQ3HoveredEmployer,
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
} from "../../../store/Q3InteractionSlice.js";
import HeatmapD3 from "./HeatmapD3.js";

export default function HeatmapContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const monthly = useSelector(selectQ3Monthly);
  const employers = useSelector(selectQ3Employers);
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const selectedIds = useSelector(selectQ3SelectedEmployers);
  const topN = useSelector(selectQ3TopN);

  // Filter to top N + bottom N employers by avg_turnover
  const { filteredMonthly, filteredEmployers, topIds, bottomIds } = useMemo(() => {
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    const topSlice = sorted.slice(0, topN);
    const bottomSlice = sorted.slice(-topN);
    const seen = new Set();
    const unique = [...topSlice, ...bottomSlice].filter((d) => {
      if (seen.has(d.employerId)) return false;
      seen.add(d.employerId);
      return true;
    });
    const idSet = new Set(unique.map((d) => d.employerId));
    return {
      filteredMonthly: monthly.filter((d) => idSet.has(d.employerId)),
      filteredEmployers: unique,
      topIds: new Set(topSlice.map((d) => d.employerId)),
      bottomIds: new Set(bottomSlice.map((d) => d.employerId)),
    };
  }, [employers, monthly, topN]);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setQ3HoveredEmployer(id)),
      handleUnhover: () => dispatch(setQ3HoveredEmployer(null)),
      handleClick: (id) => dispatch(toggleQ3SelectedEmployer(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new HeatmapD3(ref.current, controllerMethods);
    instance.create({ width: 1080, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && filteredMonthly.length > 0) {
      d3Ref.current.update(filteredMonthly, filteredEmployers, topIds, bottomIds);
    }
  }, [filteredMonthly, filteredEmployers, topIds, bottomIds]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="heatmap-panel"><h3 className="panel-title">Employer x Month Turnover Rate</h3></div>;
}
