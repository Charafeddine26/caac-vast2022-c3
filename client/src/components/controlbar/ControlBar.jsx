import { useSelector, useDispatch } from "react-redux";
import {
  selectSelectedEmployers,
  selectTopN,
  setTopN,
  clearSelection,
} from "../../store/InteractionSlice.js";

export default function ControlBar() {
  const dispatch = useDispatch();
  const topN = useSelector(selectTopN);
  const selectedIds = useSelector(selectSelectedEmployers);

  return (
    <div className="controlbar">
      <h1 style={{ fontSize: "16px", margin: 0 }}>
        VAST 2022 -- Employer Prosperity
      </h1>
      <label>
        Show top/bottom:
        <input
          type="number"
          min={1}
          max={50}
          value={topN}
          onChange={(e) => dispatch(setTopN(Number(e.target.value)))}
        />
      </label>
      {selectedIds.length > 0 && (
        <button onClick={() => dispatch(clearSelection())}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  );
}
