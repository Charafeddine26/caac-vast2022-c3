import { createSlice } from "@reduxjs/toolkit";

const interactionSlice = createSlice({
  name: "interaction",
  initialState: {
    hoveredEmployerId: null,
    selectedEmployerIds: [],
    topN: 10,
  },
  reducers: {
    setHoveredEmployer(state, action) {
      state.hoveredEmployerId = action.payload;
    },
    toggleSelectedEmployer(state, action) {
      const id = action.payload;
      const index = state.selectedEmployerIds.indexOf(id);
      if (index >= 0) {
        state.selectedEmployerIds.splice(index, 1);
      } else {
        state.selectedEmployerIds.push(id);
      }
    },
    clearSelection(state) {
      state.selectedEmployerIds = [];
    },
    setTopN(state, action) {
      state.topN = action.payload;
    },
  },
});

export const {
  setHoveredEmployer,
  toggleSelectedEmployer,
  clearSelection,
  setTopN,
} = interactionSlice.actions;

export const selectHoveredEmployer = (state) =>
  state.interaction.hoveredEmployerId;
export const selectSelectedEmployers = (state) =>
  state.interaction.selectedEmployerIds;
export const selectTopN = (state) => state.interaction.topN;

export default interactionSlice.reducer;
