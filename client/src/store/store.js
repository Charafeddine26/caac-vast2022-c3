// client/src/store/store.js
import { configureStore } from "@reduxjs/toolkit";
import datasetReducer from "./DataSetSlice.js";
import interactionReducer from "./InteractionSlice.js";
import navigationReducer from "./NavigationSlice.js";
import q2DatasetReducer from "./Q2DataSlice.js";
import q2InteractionReducer from "./Q2InteractionSlice.js";
import q3DatasetReducer from "./Q3DataSlice.js";
import q3InteractionReducer from "./Q3InteractionSlice.js";

export const store = configureStore({
  reducer: {
    dataset: datasetReducer,
    interaction: interactionReducer,
    navigation: navigationReducer,
    q2Dataset: q2DatasetReducer,
    q2Interaction: q2InteractionReducer,
    q3Dataset: q3DatasetReducer,
    q3Interaction: q3InteractionReducer,
  },
});
