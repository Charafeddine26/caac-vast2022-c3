import { configureStore } from "@reduxjs/toolkit";
import datasetReducer from "./DataSetSlice.js";
import interactionReducer from "./InteractionSlice.js";
import navigationReducer from "./NavigationSlice.js";

export const store = configureStore({
  reducer: {
    dataset: datasetReducer,
    interaction: interactionReducer,
    navigation: navigationReducer,
  },
});
