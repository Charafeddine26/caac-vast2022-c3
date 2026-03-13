// client/src/components/q3/turnoverbar/TurnoverBarContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ3Employers } from "../../../store/Q3DataSlice.js";
import {
  selectQ3HoveredEmployer,
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
} from "../../../store/Q3InteractionSlice.js";
import TurnoverBarD3 from "./TurnoverBarD3.js";

export default function TurnoverBarContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const employers = useSelector(selectQ3Employers);
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const selectedIds = useSelector(selectQ3SelectedEmployers);
  const topN = useSelector(selectQ3TopN);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setQ3HoveredEmployer(id)),
      handleUnhover: () => dispatch(setQ3HoveredEmployer(null)),
      handleClick: (id) => dispatch(toggleQ3SelectedEmployer(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new TurnoverBarD3(ref.current, controllerMethods);
    instance.create({ width: 350, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && employers.length > 0) {
      d3Ref.current.update(employers, topN);
    }
  }, [employers, topN]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="turnoverbar-panel"><h3 className="panel-title">Turnover Ranking</h3></div>;
}
