import { configureStore } from "@reduxjs/toolkit";
import datasetReducer from "./DataSetSlice.js";
import interactionReducer from "./InteractionSlice.js";

export const store = configureStore({
  reducer: {
    dataset: datasetReducer,
    interaction: interactionReducer,
  },
});
