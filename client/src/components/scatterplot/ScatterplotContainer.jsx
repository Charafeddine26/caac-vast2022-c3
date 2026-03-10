import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectEmployers } from "../../store/DataSetSlice.js";
import {
  selectHoveredEmployer,
  selectSelectedEmployers,
  setHoveredEmployer,
  toggleSelectedEmployer,
} from "../../store/InteractionSlice.js";
import ScatterplotD3 from "./ScatterplotD3.js";

export default function ScatterplotContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const employers = useSelector(selectEmployers);
  const hoveredId = useSelector(selectHoveredEmployer);
  const selectedIds = useSelector(selectSelectedEmployers);

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
    const instance = new ScatterplotD3(ref.current, controllerMethods);
    instance.create({ width: 700, height: 350 });
    d3Ref.current = instance;
    return () => {
      instance.clear();
    };
  }, [controllerMethods]);

  // Data update
  useEffect(() => {
    if (d3Ref.current && employers.length > 0) {
      d3Ref.current.update(employers);
    }
  }, [employers]);

  // Highlighting update
  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="scatterplot-panel" />;
}
