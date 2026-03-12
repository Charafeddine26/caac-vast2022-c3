// client/src/components/Q2Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ2Data, selectQ2DataStatus } from "../store/Q2DataSlice.js";
import Q2ControlBar from "./q2/controlbar/Q2ControlBar.jsx";
import Q2Tooltip from "./q2/tooltip/Q2Tooltip.jsx";

export default function Q2Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ2DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ2Data());
    }
  }, [dispatch, status]);

  if (status === "loading")
    return <p>Loading Q2 data...</p>;
  if (status === "failed")
    return <p>Failed to load Q2 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q2ControlBar />
      <div className="panels-row">
        <div className="areachart-panel">
          <h3 className="panel-title">Median Income vs Cost of Living</h3>
          <p style={{ color: "#999" }}>Panel D — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <div className="boxplot-panel">
          <h3 className="panel-title">Net Balance Distribution (per resident)</h3>
          <p style={{ color: "#999" }}>Panel E — coming next</p>
        </div>
      </div>
      <div className="panels-row">
        <div className="resident-scatter-panel">
          <h3 className="panel-title">Resident Financial Trajectories</h3>
          <p style={{ color: "#999" }}>Panel F — coming next</p>
        </div>
      </div>
      <Q2Tooltip />
    </>
  );
}
