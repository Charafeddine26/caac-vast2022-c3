// client/src/components/Q2Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchQ2Data, selectQ2DataStatus } from "../store/Q2DataSlice.js";
import Q2ControlBar from "./q2/controlbar/Q2ControlBar.jsx";
import AreaChartContainer from "./q2/areachart/AreaChartContainer.jsx";
import BoxPlotContainer from "./q2/boxplot/BoxPlotContainer.jsx";
import ResidentScatterContainer from "./q2/residentscatter/ResidentScatterContainer.jsx";
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
        <AreaChartContainer />
      </div>
      <div className="panels-row">
        <BoxPlotContainer />
      </div>
      <div className="panels-row">
        <ResidentScatterContainer />
      </div>
      <Q2Tooltip />
    </>
  );
}
