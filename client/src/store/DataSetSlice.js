import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchData = createAsyncThunk("dataset/fetchData", async () => {
  const response = await fetch("http://localhost:5000/api/data");
  const data = await response.json();
  return { monthly: data.monthly, employers: data.employers };
});

const dataSetSlice = createSlice({
  name: "dataset",
  initialState: {
    status: "idle",
    error: null,
    monthly: [],
    employers: [],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchData.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchData.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.monthly = action.payload.monthly;
        state.employers = action.payload.employers;
      })
      .addCase(fetchData.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export const selectMonthly = (state) => state.dataset.monthly;
export const selectEmployers = (state) => state.dataset.employers;
export const selectDataStatus = (state) => state.dataset.status;

export default dataSetSlice.reducer;
