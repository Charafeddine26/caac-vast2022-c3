// client/src/store/Q2DataSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchQ2Data = createAsyncThunk("q2Dataset/fetchQ2Data", async () => {
  const response = await fetch("http://localhost:5000/api/q2/data");
  const data = await response.json();
  return { monthly: data.monthly, residents: data.residents, clusters: data.clusters };
});

const q2DataSlice = createSlice({
  name: "q2Dataset",
  initialState: {
    status: "idle",
    error: null,
    monthly: [],
    residents: [],
    clusters: [],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQ2Data.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchQ2Data.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.monthly = action.payload.monthly;
        state.residents = action.payload.residents;
        state.clusters = action.payload.clusters;
      })
      .addCase(fetchQ2Data.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export const selectQ2Monthly = (state) => state.q2Dataset.monthly;
export const selectQ2Residents = (state) => state.q2Dataset.residents;
export const selectQ2Clusters = (state) => state.q2Dataset.clusters;
export const selectQ2DataStatus = (state) => state.q2Dataset.status;

export default q2DataSlice.reducer;
