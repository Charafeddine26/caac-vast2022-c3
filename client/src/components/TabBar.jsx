// client/src/components/TabBar.jsx
import { useSelector, useDispatch } from "react-redux";
import { selectActiveTab, setActiveTab } from "../store/NavigationSlice.js";

const TABS = [
  { id: "q1", label: "Q1 \u2014 Prosp\u00e9rit\u00e9 des employeurs" },
  { id: "q2", label: "Q2 \u2014 Sant\u00e9 financi\u00e8re des r\u00e9sidents" },
  { id: "q3", label: "Q3 \u2014 Dynamique de l\u2019emploi" },
];

export default function TabBar() {
  const dispatch = useDispatch();
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn${activeTab === tab.id ? " active" : ""}`}
          disabled={tab.disabled}
          onClick={() => dispatch(setActiveTab(tab.id))}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
