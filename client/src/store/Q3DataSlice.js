// client/src/store/Q3DataSlice.js
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchQ3Data = createAsyncThunk("q3Dataset/fetchQ3Data", async () => {
  const response = await fetch("http://localhost:5000/api/q3/data");
  const data = await response.json();
  return { monthly: data.monthly, employers: data.employers };
});

const q3DataSlice = createSlice({
  name: "q3Dataset",
  initialState: {
    status: "idle",
    error: null,
    monthly: [],
    employers: [],
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchQ3Data.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchQ3Data.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.monthly = action.payload.monthly;
        state.employers = action.payload.employers;
      })
      .addCase(fetchQ3Data.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export const selectQ3Monthly = (state) => state.q3Dataset.monthly;
export const selectQ3Employers = (state) => state.q3Dataset.employers;
export const selectQ3DataStatus = (state) => state.q3Dataset.status;

export default q3DataSlice.reducer;
