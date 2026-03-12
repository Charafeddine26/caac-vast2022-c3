// client/src/components/Q1Dashboard.jsx
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchData, selectDataStatus } from "../store/DataSetSlice.js";
import ControlBar from "./controlbar/ControlBar.jsx";
import TimeSeriesContainer from "./timeseries/TimeSeriesContainer.jsx";
import BarChartContainer from "./barchart/BarChartContainer.jsx";
import ScatterplotContainer from "./scatterplot/ScatterplotContainer.jsx";
import Tooltip from "./tooltip/Tooltip.jsx";

export default function Q1Dashboard() {
  const dispatch = useDispatch();
  const status = useSelector(selectDataStatus);

  useEffect(() => {
    if (status === "idle") {
      dispatch(fetchData());
    }
  }, [dispatch, status]);

  if (status === "loading") return <p>Loading Q1 data...</p>;
  if (status === "failed") return <p>Failed to load Q1 data.</p>;
  if (status !== "succeeded") return null;

  return (
    <>
      <ControlBar />
      <div className="panels-row">
        <TimeSeriesContainer />
        <BarChartContainer />
      </div>
      <div className="panels-row">
        <ScatterplotContainer />
      </div>
      <Tooltip />
    </>
  );
}
