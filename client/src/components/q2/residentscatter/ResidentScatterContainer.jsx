// client/src/components/q2/residentscatter/ResidentScatterContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ2Residents, selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import {
  selectHoveredResident,
  selectSelectedResidents,
  selectSelectedCluster,
  setHoveredResident,
  toggleSelectedResident,
} from "../../../store/Q2InteractionSlice.js";
import ResidentScatterD3 from "./ResidentScatterD3.js";

export default function ResidentScatterContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const residents = useSelector(selectQ2Residents);
  const clusters = useSelector(selectQ2Clusters);
  const hoveredId = useSelector(selectHoveredResident);
  const selectedIds = useSelector(selectSelectedResidents);
  const selectedCluster = useSelector(selectSelectedCluster);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setHoveredResident(id)),
      handleUnhover: () => dispatch(setHoveredResident(null)),
      handleClick: (id) => dispatch(toggleSelectedResident(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new ResidentScatterD3(ref.current, controllerMethods);
    instance.create({ width: 1080, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && residents.length > 0) {
      d3Ref.current.update(residents, clusters);
    }
  }, [residents, clusters]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds, selectedCluster);
    }
  }, [hoveredId, selectedIds, selectedCluster]);

  return <div ref={ref} className="resident-scatter-panel"><h3 className="panel-title">Resident Financial Trajectories</h3></div>;
}
