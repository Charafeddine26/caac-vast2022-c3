// client/src/components/q3/controlbar/Q3ControlBar.jsx
import { useSelector, useDispatch } from "react-redux";
import {
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3TopN,
  clearQ3Selection,
} from "../../../store/Q3InteractionSlice.js";

export default function Q3ControlBar() {
  const dispatch = useDispatch();
  const topN = useSelector(selectQ3TopN);
  const selectedIds = useSelector(selectQ3SelectedEmployers);

  return (
    <div className="controlbar">
      <h1>VAST 2022 — Employment Dynamics</h1>
      <label>
        Top/bottom employers by turnover:
        <input
          type="number"
          min={1}
          max={50}
          value={topN}
          onChange={(e) => dispatch(setQ3TopN(Number(e.target.value)))}
        />
      </label>
      {selectedIds.length > 0 && (
        <button onClick={() => dispatch(clearQ3Selection())}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  );
}
