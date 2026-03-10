import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectEmployers } from "../../store/DataSetSlice.js";
import {
  selectHoveredEmployer,
  selectSelectedEmployers,
  selectTopN,
  setHoveredEmployer,
  toggleSelectedEmployer,
} from "../../store/InteractionSlice.js";
import BarChartD3 from "./BarChartD3.js";

export default function BarChartContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

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
    const instance = new BarChartD3(ref.current, controllerMethods);
    instance.create({ width: 350, height: 400 });
    d3Ref.current = instance;
    return () => {
      instance.clear();
    };
  }, [controllerMethods]);

  // Data update
  useEffect(() => {
    if (d3Ref.current && employers.length > 0) {
      d3Ref.current.update(employers, topN);
    }
  }, [employers, topN]);

  // Highlighting update
  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="barchart-panel" />;
}
