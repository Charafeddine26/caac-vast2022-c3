// client/src/App.jsx
import { useSelector } from "react-redux";
import { selectActiveTab } from "./store/NavigationSlice.js";
import TabBar from "./components/TabBar.jsx";
import Q1Dashboard from "./components/Q1Dashboard.jsx";
import Q2Dashboard from "./components/Q2Dashboard.jsx";
import Q3Dashboard from "./components/Q3Dashboard.jsx";
import "./styles/App.css";

function App() {
  const activeTab = useSelector(selectActiveTab);

  return (
    <div className="dashboard">
      <TabBar />
      {activeTab === "q1" && <Q1Dashboard />}
      {activeTab === "q2" && <Q2Dashboard />}
      {activeTab === "q3" && <Q3Dashboard />}
    </div>
  );
}

export default App;
