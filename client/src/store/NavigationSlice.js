// client/src/store/NavigationSlice.js
import { createSlice } from "@reduxjs/toolkit";

const navigationSlice = createSlice({
  name: "navigation",
  initialState: {
    activeTab: "q1",
  },
  reducers: {
    setActiveTab(state, action) {
      state.activeTab = action.payload;
    },
  },
});

export const { setActiveTab } = navigationSlice.actions;
export const selectActiveTab = (state) => state.navigation.activeTab;
export default navigationSlice.reducer;
