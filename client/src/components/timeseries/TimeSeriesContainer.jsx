import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectMonthly, selectEmployers } from "../../store/DataSetSlice.js";
import {
  selectHoveredEmployer,
  selectSelectedEmployers,
  selectTopN,
  setHoveredEmployer,
  toggleSelectedEmployer,
} from "../../store/InteractionSlice.js";
import TimeSeriesD3 from "./TimeSeriesD3.js";

export default function TimeSeriesContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const monthly = useSelector(selectMonthly);
  const employers = useSelector(selectEmployers);
  const hoveredId = useSelector(selectHoveredEmployer);
  const selectedIds = useSelector(selectSelectedEmployers);
  const topN = useSelector(selectTopN);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (employerId) => dispatch(setHoveredEmployer(employerId)),
      handleUnhover: () => dispatch(setHoveredEmployer(null)),
      handleClick: (employerId) => dispatch(toggleSelectedEmployer(employerId)),
    }),
    [dispatch]
  );

  // Mount / unmount
  useEffect(() => {
    const instance = new TimeSeriesD3(ref.current, controllerMethods);
    instance.create({ width: 700, height: 400 });
    d3Ref.current = instance;
    return () => {
      instance.clear();
    };
  }, [controllerMethods]);

  // Data update
  useEffect(() => {
    if (d3Ref.current && monthly.length > 0) {
      d3Ref.current.update(monthly, employers, topN);
    }
  }, [monthly, employers, topN]);

  // Highlighting update
  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="timeseries-panel" />;
}
