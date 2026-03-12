// client/src/store/Q2InteractionSlice.js
import { createSlice } from "@reduxjs/toolkit";

const q2InteractionSlice = createSlice({
  name: "q2Interaction",
  initialState: {
    hoveredResidentId: null,
    hoveredMonth: null,
    selectedResidentIds: [],
    selectedCluster: null,
  },
  reducers: {
    setHoveredResident(state, action) {
      state.hoveredResidentId = action.payload;
    },
    setHoveredMonth(state, action) {
      state.hoveredMonth = action.payload;
    },
    toggleSelectedResident(state, action) {
      const id = action.payload;
      const index = state.selectedResidentIds.indexOf(id);
      if (index >= 0) {
        state.selectedResidentIds.splice(index, 1);
      } else {
        state.selectedResidentIds.push(id);
      }
    },
    setSelectedCluster(state, action) {
      // Toggle: if same cluster clicked again, clear it
      if (state.selectedCluster === action.payload) {
        state.selectedCluster = null;
      } else {
        state.selectedCluster = action.payload;
      }
    },
    clearQ2Selection(state) {
      state.selectedResidentIds = [];
      state.selectedCluster = null;
    },
  },
});

export const {
  setHoveredResident,
  setHoveredMonth,
  toggleSelectedResident,
  setSelectedCluster,
  clearQ2Selection,
} = q2InteractionSlice.actions;

export const selectHoveredResident = (state) => state.q2Interaction.hoveredResidentId;
export const selectHoveredMonth = (state) => state.q2Interaction.hoveredMonth;
export const selectSelectedResidents = (state) => state.q2Interaction.selectedResidentIds;
export const selectSelectedCluster = (state) => state.q2Interaction.selectedCluster;

export default q2InteractionSlice.reducer;
