// client/src/components/Q3Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ3Data, selectQ3DataStatus } from "../store/Q3DataSlice.js";
import Q3ControlBar from "./q3/controlbar/Q3ControlBar.jsx";
import HeatmapContainer from "./q3/heatmap/HeatmapContainer.jsx";
import TurnoverBarContainer from "./q3/turnoverbar/TurnoverBarContainer.jsx";
import TurnoverScatterContainer from "./q3/turnoverscatter/TurnoverScatterContainer.jsx";
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
        <TurnoverBarContainer />
        <TurnoverScatterContainer />
      </div>
      <Q3Tooltip />
    </>
  );
}
