// client/src/store/Q3InteractionSlice.js
import { createSlice } from "@reduxjs/toolkit";

const q3InteractionSlice = createSlice({
  name: "q3Interaction",
  initialState: {
    hoveredEmployerId: null,
    selectedEmployerIds: [],
    topN: 10,
  },
  reducers: {
    setQ3HoveredEmployer(state, action) {
      state.hoveredEmployerId = action.payload;
    },
    toggleQ3SelectedEmployer(state, action) {
      const id = action.payload;
      const index = state.selectedEmployerIds.indexOf(id);
      if (index >= 0) {
        state.selectedEmployerIds.splice(index, 1);
      } else {
        state.selectedEmployerIds.push(id);
      }
    },
    clearQ3Selection(state) {
      state.selectedEmployerIds = [];
    },
    setQ3TopN(state, action) {
      state.topN = action.payload;
    },
  },
});

export const {
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
  clearQ3Selection,
  setQ3TopN,
} = q3InteractionSlice.actions;

export const selectQ3HoveredEmployer = (state) => state.q3Interaction.hoveredEmployerId;
export const selectQ3SelectedEmployers = (state) => state.q3Interaction.selectedEmployerIds;
export const selectQ3TopN = (state) => state.q3Interaction.topN;

export default q3InteractionSlice.reducer;
