// client/src/components/q2/controlbar/Q2ControlBar.jsx
import { useSelector, useDispatch } from "react-redux";
import { selectQ2Clusters } from "../../../store/Q2DataSlice.js";
import {
  selectSelectedResidents,
  selectSelectedCluster,
  setSelectedCluster,
  clearQ2Selection,
} from "../../../store/Q2InteractionSlice.js";

export default function Q2ControlBar() {
  const dispatch = useDispatch();
  const clusters = useSelector(selectQ2Clusters);
  const selectedIds = useSelector(selectSelectedResidents);
  const selectedCluster = useSelector(selectSelectedCluster);

  return (
    <div className="controlbar">
      <h1 style={{ fontSize: "16px", margin: 0 }}>
        VAST 2022 -- Resident Financial Health
      </h1>
      <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
        {clusters.map((cl) => {
          const isActive = selectedCluster === cl.cluster;
          return (
            <button
              key={cl.cluster}
              className={`cluster-btn${isActive ? " active" : ""}`}
              style={isActive ? {
                borderColor: cl.color,
                borderWidth: "2px",
                background: cl.color + "18",
              } : {}}
              onClick={() => dispatch(setSelectedCluster(cl.cluster))}
            >
              <span
                className="cluster-swatch"
                style={{ backgroundColor: cl.color }}
              />
              {cl.label} ({cl.count})
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 && (
        <button onClick={() => dispatch(clearQ2Selection())}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  );
}
