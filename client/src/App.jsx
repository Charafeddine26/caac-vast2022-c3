// client/src/App.jsx
import { useSelector } from "react-redux";
import { selectActiveTab } from "./store/NavigationSlice.js";
import TabBar from "./components/TabBar.jsx";
import Q1Dashboard from "./components/Q1Dashboard.jsx";
import "./styles/App.css";

function App() {
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="dashboard">
      <TabBar />
      {activeTab === "q1" && <Q1Dashboard />}
      {activeTab === "q2" && <p>Q2 dashboard coming next...</p>}
      {activeTab === "q3" && <p>Q3 coming soon...</p>}
    </div>
  );
}

export default App;
