import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchData, selectDataStatus } from "./store/DataSetSlice.js";
import ControlBar from "./components/controlbar/ControlBar.jsx";
import TimeSeriesContainer from "./components/timeseries/TimeSeriesContainer.jsx";
import BarChartContainer from "./components/barchart/BarChartContainer.jsx";
import ScatterplotContainer from "./components/scatterplot/ScatterplotContainer.jsx";
import Tooltip from "./components/tooltip/Tooltip.jsx";
import "./styles/App.css";

function App() {
  const dispatch = useDispatch();
  const status = useSelector(selectDataStatus);

  useEffect(() => {
    dispatch(fetchData());
  }, [dispatch]);

  if (status === "loading")
    return (
      <div className="dashboard">
        <p>Loading data...</p>
      </div>
    );
  if (status === "failed")
    return (
      <div className="dashboard">
        <p>Failed to load data.</p>
      </div>
    );
  if (status !== "succeeded") return null;

  return (
    <div className="dashboard">
      <ControlBar />
      <div className="panels-row">
        <TimeSeriesContainer />
        <BarChartContainer />
      </div>
      <div className="panels-row">
        <ScatterplotContainer />
      </div>
      <Tooltip />
    </div>
  );
}

export default App;
