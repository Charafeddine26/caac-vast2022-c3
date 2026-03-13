// client/src/components/Q3Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ3Data, selectQ3DataStatus } from "../store/Q3DataSlice.js";
import Q3ControlBar from "./q3/controlbar/Q3ControlBar.jsx";
import HeatmapContainer from "./q3/heatmap/HeatmapContainer.jsx";
import Q3Tooltip from "./q3/tooltip/Q3Tooltip.jsx";

export default function Q3Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectQ3DataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchQ3Data());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q3 data...</p>;
  if (status === "failed") return <p>Failed to load Q3 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <Q3ControlBar />
      <div className="panels-row">
        <HeatmapContainer />
      </div>
      <div className="panels-row">
        <div className="turnoverbar-panel">
          <h3 className="panel-title">Turnover Ranking</h3>
          <p style={{ color: "#999" }}>Panel H — coming next</p>
        </div>
        <div className="turnoverscatter-panel">
          <h3 className="panel-title">Turnover vs Employer Size</h3>
          <p style={{ color: "#999" }}>Panel I — coming next</p>
        </div>
      </div>
      <Q3Tooltip />
    </>
  );
}
