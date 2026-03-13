# Q3 Targeted Reconstruction — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 7 quality issues in Q3 dashboard to match Q1/Q2 rigor: filter heatmap to top/bottom N, add scatter legends, fix event handler pattern, fix ControlBar layout, enhance tooltip.

**Architecture:** Targeted in-place fixes to existing Q3 components. No new panels, no architecture changes, no Redux or data pipeline changes. 6 files modified.

**Tech Stack:** D3.js 7.9, React 19, Redux Toolkit (existing stack — no additions).

**Design doc:** `docs/plans/2026-03-13-q3-targeted-reconstruction-design.md`

---

## Task 1: Rebuild Heatmap — Filter to Top/Bottom N

**Files:**
- Modify: `client/src/components/q3/heatmap/HeatmapContainer.jsx`
- Rewrite: `client/src/components/q3/heatmap/HeatmapD3.js`

**Step 1: Rewrite `HeatmapContainer.jsx`**

Add `useMemo` to compute filtered employers and monthly data before passing to D3:

```jsx
// client/src/components/q3/heatmap/HeatmapContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { selectQ3Monthly, selectQ3Employers } from "../../../store/Q3DataSlice.js";
import {
  selectQ3HoveredEmployer,
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3HoveredEmployer,
  toggleQ3SelectedEmployer,
} from "../../../store/Q3InteractionSlice.js";
import HeatmapD3 from "./HeatmapD3.js";

export default function HeatmapContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);
  const dispatch = useDispatch();

  const monthly = useSelector(selectQ3Monthly);
  const employers = useSelector(selectQ3Employers);
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const selectedIds = useSelector(selectQ3SelectedEmployers);
  const topN = useSelector(selectQ3TopN);

  // Filter to top N + bottom N employers by avg_turnover
  const { filteredMonthly, filteredEmployers, topIds, bottomIds } = useMemo(() => {
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    const topSlice = sorted.slice(0, topN);
    const bottomSlice = sorted.slice(-topN);
    const seen = new Set();
    const unique = [...topSlice, ...bottomSlice].filter((d) => {
      if (seen.has(d.employerId)) return false;
      seen.add(d.employerId);
      return true;
    });
    const idSet = new Set(unique.map((d) => d.employerId));
    return {
      filteredMonthly: monthly.filter((d) => idSet.has(d.employerId)),
      filteredEmployers: unique,
      topIds: new Set(topSlice.map((d) => d.employerId)),
      bottomIds: new Set(bottomSlice.map((d) => d.employerId)),
    };
  }, [employers, monthly, topN]);

  const controllerMethods = useMemo(
    () => ({
      handleHover: (id) => dispatch(setQ3HoveredEmployer(id)),
      handleUnhover: () => dispatch(setQ3HoveredEmployer(null)),
      handleClick: (id) => dispatch(toggleQ3SelectedEmployer(id)),
    }),
    [dispatch]
  );

  useEffect(() => {
    const instance = new HeatmapD3(ref.current, controllerMethods);
    instance.create({ width: 1080, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, [controllerMethods]);

  useEffect(() => {
    if (d3Ref.current && filteredMonthly.length > 0) {
      d3Ref.current.update(filteredMonthly, filteredEmployers, topIds, bottomIds);
    }
  }, [filteredMonthly, filteredEmployers, topIds, bottomIds]);

  useEffect(() => {
    if (d3Ref.current) {
      d3Ref.current.updateHighlighting(hoveredId, selectedIds);
    }
  }, [hoveredId, selectedIds]);

  return <div ref={ref} className="heatmap-panel"><h3 className="panel-title">Employer x Month Turnover Rate</h3></div>;
}
```

**Step 2: Rewrite `HeatmapD3.js`**

Complete rewrite — filtered rows, separator line, fixed highlighting, `.on()` after `.join()`:

```js
// client/src/components/q3/heatmap/HeatmapD3.js
import * as d3 from "d3";

export default class HeatmapD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 80, bottom: 40, left: 60 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.cellsG = this.mainG.append("g").attr("class", "cells");
    this.separatorG = this.mainG.append("g").attr("class", "separator");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");
    this.legendG = this.mainG.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${this.innerWidth + 10}, 0)`);
  }

  update(monthly, employers, topIds, bottomIds) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Employer order: top N (highest turnover first), then bottom N (lowest last)
    const topEmployers = employers.filter((d) => topIds.has(d.employerId));
    const bottomEmployers = employers.filter((d) => bottomIds.has(d.employerId) && !topIds.has(d.employerId));
    const ordered = [...topEmployers, ...bottomEmployers];
    const employerIds = ordered.map((d) => d.employerId);
    const months = [...new Set(monthly.map((d) => d.month))].sort();

    this.topIds = topIds;
    this.bottomIds = bottomIds;

    // Scales
    this.xScale = d3.scaleBand().domain(months).range([0, innerWidth]).padding(0.02);
    this.yScale = d3.scaleBand().domain(employerIds).range([0, innerHeight]).padding(0.05);

    const maxTurnover = d3.max(monthly, (d) => d.turnover_rate) || 1;
    this.colorScale = d3.scaleSequential(d3.interpolateOrRd).domain([0, maxTurnover]);

    const xScale = this.xScale;
    const yScale = this.yScale;
    const colorScale = this.colorScale;

    // Cells
    this.cellsG.selectAll("rect.cell")
      .data(monthly, (d) => `${d.employerId}-${d.month}`)
      .join(
        (enter) => enter.append("rect")
          .attr("class", "cell")
          .attr("x", (d) => xScale(d.month))
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => colorScale(d.turnover_rate))
          .attr("opacity", 0.9),
        (update) => update.transition().duration(500)
          .attr("x", (d) => xScale(d.month))
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => colorScale(d.turnover_rate)),
        (exit) => exit.remove()
      )
      .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
      .on("mouseleave", () => controllerMethods.handleUnhover())
      .on("click", (event, d) => controllerMethods.handleClick(d.employerId));

    // Separator line between top N and bottom N
    this.separatorG.selectAll("*").remove();
    if (topEmployers.length > 0 && bottomEmployers.length > 0) {
      const firstBottomId = bottomEmployers[0].employerId;
      const separatorY = yScale(firstBottomId) - yScale.step() * yScale.paddingInner() / 2;
      this.separatorG.append("line")
        .attr("x1", 0).attr("x2", innerWidth)
        .attr("y1", separatorY).attr("y2", separatorY)
        .attr("stroke", "#666").attr("stroke-dasharray", "6,3").attr("stroke-width", 1);

      // Labels
      this.separatorG.append("text")
        .attr("x", -5).attr("y", separatorY - 8)
        .attr("text-anchor", "end").attr("font-size", "9px").attr("fill", "#d62728")
        .text("High turnover ↑");
      this.separatorG.append("text")
        .attr("x", -5).attr("y", separatorY + 14)
        .attr("text-anchor", "end").attr("font-size", "9px").attr("fill", "#2ca02c")
        .text("Stable ↓");
    }

    // X axis
    this.xAxisG.call(
      d3.axisBottom(xScale).tickFormat((m) => d3.timeFormat("%b %y")(new Date(m)))
    ).selectAll("text").attr("font-size", "9px");

    // Y axis — all filtered employers get labels now
    this.yAxisG.call(
      d3.axisLeft(yScale).tickFormat((id) => `E${id}`)
    ).selectAll("text").attr("font-size", "8px");

    // Color legend
    this.legendG.selectAll("*").remove();
    const legendHeight = Math.min(innerHeight, 200);
    const legendWidth = 12;

    const defs = this.svg.selectAll("defs").data([0]).join("defs");
    const gradientId = "turnover-gradient";
    const gradient = defs.selectAll(`#${gradientId}`).data([0]).join("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%").attr("y1", "100%")
      .attr("x2", "0%").attr("y2", "0%");

    gradient.selectAll("stop").data([
      { offset: "0%", color: colorScale(0) },
      { offset: "50%", color: colorScale(maxTurnover / 2) },
      { offset: "100%", color: colorScale(maxTurnover) },
    ]).join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    this.legendG.append("rect")
      .attr("width", legendWidth)
      .attr("height", legendHeight)
      .attr("fill", `url(#${gradientId})`);

    const legendScale = d3.scaleLinear().domain([0, maxTurnover]).range([legendHeight, 0]);
    this.legendG.append("g")
      .attr("transform", `translate(${legendWidth}, 0)`)
      .call(d3.axisRight(legendScale).ticks(5).tickFormat(d3.format(".0%")))
      .selectAll("text").attr("font-size", "9px");

    this.legendG.append("text")
      .attr("x", legendWidth / 2)
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text("Turnover");
  }

  updateHighlighting(hoveredId, selectedIds) {
    const cells = this.cellsG.selectAll("rect.cell");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      cells.attr("opacity", 0.9).attr("stroke", "none");
      return;
    }

    cells.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1).attr("stroke", "#000").attr("stroke-width", 1.5);
      } else if (isSelected) {
        el.attr("opacity", 1).attr("stroke", "#000").attr("stroke-width", 1);
      } else {
        el.attr("opacity", hasHover ? 0.3 : 0.5).attr("stroke", "none");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 3: Verify**

- Q3 tab: heatmap renders ~20 rows (top 10 + bottom 10) instead of 249
- Each row is a clearly visible band of colored cells
- Dashed separator line between "High turnover" and "Stable" groups
- All Y-axis labels visible
- Color legend on right
- Hover: entire row highlights with black stroke, others dim
- Click: selection persists
- TopN slider: heatmap re-renders with new top/bottom set
- No DOM mutation errors in console

**Step 4: Commit**

```bash
git add client/src/components/q3/heatmap/HeatmapD3.js client/src/components/q3/heatmap/HeatmapContainer.jsx
git commit -m "fix(q3): rebuild heatmap — filter to top/bottom N, add separator, fix highlighting"
```

---

## Task 2: Fix Scatter Plot — Add Legends + Event Handlers

**Files:**
- Rewrite: `client/src/components/q3/turnoverscatter/TurnoverScatterD3.js`

**Step 1: Rewrite `TurnoverScatterD3.js`**

Add color gradient legend, size legend, move `.on()` after `.join()`, increase right margin:

```js
// client/src/components/q3/turnoverscatter/TurnoverScatterD3.js
import * as d3 from "d3";

export default class TurnoverScatterD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 100, bottom: 50, left: 60 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.dotsG = this.mainG.append("g").attr("class", "dots");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");
    this.legendG = this.mainG.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${this.innerWidth + 10}, 0)`);

    // Axis labels
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 40)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Average headcount");

    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Average turnover rate");
  }

  update(employers) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Scales
    this.xScale = d3.scaleLinear()
      .domain([0, d3.max(employers, (d) => d.avg_headcount)])
      .range([0, innerWidth])
      .nice();

    this.yScale = d3.scaleLinear()
      .domain([0, d3.max(employers, (d) => d.avg_turnover)])
      .range([innerHeight, 0])
      .nice();

    this.sizeScale = d3.scaleSqrt()
      .domain(d3.extent(employers, (d) => d.total_departures))
      .range([3, 18]);

    this.colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain(d3.extent(employers, (d) => d.avg_hourly_rate));

    const xScale = this.xScale;
    const yScale = this.yScale;
    const sizeScale = this.sizeScale;
    const colorScale = this.colorScale;

    // Dots
    this.dotsG.selectAll("circle")
      .data(employers, (d) => d.employerId)
      .join(
        (enter) => enter.append("circle")
          .attr("cx", (d) => xScale(d.avg_headcount))
          .attr("cy", (d) => yScale(d.avg_turnover))
          .attr("r", 0)
          .attr("fill", (d) => colorScale(d.avg_hourly_rate))
          .attr("stroke", "#333")
          .attr("stroke-width", 0.5)
          .attr("opacity", 0.8)
          .call((sel) => sel.transition().duration(500)
            .attr("r", (d) => sizeScale(d.total_departures))),
        (update) => update.transition().duration(500)
          .attr("cx", (d) => xScale(d.avg_headcount))
          .attr("cy", (d) => yScale(d.avg_turnover))
          .attr("r", (d) => sizeScale(d.total_departures)),
        (exit) => exit.transition().duration(300).attr("r", 0).remove()
      )
      .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
      .on("mouseleave", () => controllerMethods.handleUnhover())
      .on("click", (event, d) => controllerMethods.handleClick(d.employerId));

    // Axes
    this.xAxisG.transition().duration(500).call(d3.axisBottom(xScale));
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat(d3.format(".0%"))
    );

    // ── Legends ──────────────────────────────────────────────────────────────
    this.legendG.selectAll("*").remove();

    // Color gradient legend (hourly rate)
    const colorLegendHeight = 120;
    const colorLegendWidth = 12;
    const rateExtent = d3.extent(employers, (d) => d.avg_hourly_rate);

    const defs = this.svg.selectAll("defs").data([0]).join("defs");
    const gradientId = "rate-gradient";
    const gradient = defs.selectAll(`#${gradientId}`).data([0]).join("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%").attr("y1", "100%")
      .attr("x2", "0%").attr("y2", "0%");

    gradient.selectAll("stop").data([
      { offset: "0%", color: colorScale(rateExtent[0]) },
      { offset: "50%", color: colorScale((rateExtent[0] + rateExtent[1]) / 2) },
      { offset: "100%", color: colorScale(rateExtent[1]) },
    ]).join("stop")
      .attr("offset", (d) => d.offset)
      .attr("stop-color", (d) => d.color);

    this.legendG.append("text")
      .attr("x", colorLegendWidth / 2)
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text("Rate ($/h)");

    this.legendG.append("rect")
      .attr("width", colorLegendWidth)
      .attr("height", colorLegendHeight)
      .attr("fill", `url(#${gradientId})`);

    const rateLegendScale = d3.scaleLinear().domain(rateExtent).range([colorLegendHeight, 0]);
    this.legendG.append("g")
      .attr("transform", `translate(${colorLegendWidth}, 0)`)
      .call(d3.axisRight(rateLegendScale).ticks(4).tickFormat(d3.format("$.0f")))
      .selectAll("text").attr("font-size", "9px");

    // Size legend (total departures)
    const sizeLegendG = this.legendG.append("g")
      .attr("transform", `translate(0, ${colorLegendHeight + 30})`);

    sizeLegendG.append("text")
      .attr("x", colorLegendWidth / 2)
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .text("Departures");

    const depExtent = d3.extent(employers, (d) => d.total_departures);
    const depMid = Math.round((depExtent[0] + depExtent[1]) / 2);
    const sizeValues = [depExtent[0], depMid, depExtent[1]];
    let yOffset = 0;

    sizeValues.forEach((val) => {
      const r = sizeScale(val);
      yOffset += r + 4;
      sizeLegendG.append("circle")
        .attr("cx", colorLegendWidth / 2)
        .attr("cy", yOffset)
        .attr("r", r)
        .attr("fill", "none")
        .attr("stroke", "#666")
        .attr("stroke-width", 1);
      sizeLegendG.append("text")
        .attr("x", colorLegendWidth + 8)
        .attr("y", yOffset + 4)
        .attr("font-size", "9px")
        .text(val);
      yOffset += r + 4;
    });
  }

  updateHighlighting(hoveredId, selectedIds) {
    const circles = this.dotsG.selectAll("circle");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      circles.attr("opacity", 0.8).attr("stroke-width", 0.5).attr("stroke", "#333");
      return;
    }

    circles.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1).attr("stroke-width", 2.5).attr("stroke", "#000");
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9).attr("stroke-width", 2).attr("stroke", "#000");
      } else if (hasHover) {
        el.attr("opacity", 0.2).attr("stroke-width", 0.5).attr("stroke", "#333");
      } else {
        el.attr("opacity", 0.8).attr("stroke-width", 0.5).attr("stroke", "#333");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
```

**Step 2: Verify**

- Scatter renders 249 dots with color gradient and size variation
- Color gradient legend on right showing hourly rate range
- Size legend below color legend showing 3 reference circles (min, mid, max departures)
- Hover/click still work correctly
- `.on()` is now chained after `.join()`

**Step 3: Commit**

```bash
git add client/src/components/q3/turnoverscatter/TurnoverScatterD3.js
git commit -m "fix(q3): add scatter legends (color + size) and fix event handler pattern"
```

---

## Task 3: Fix Bar Chart — Event Handlers + Highlighting

**Files:**
- Modify: `client/src/components/q3/turnoverbar/TurnoverBarD3.js`

**Step 1: Fix event handlers and highlighting**

In `TurnoverBarD3.js`, two changes:

1. Move `.on()` calls from inside the `enter` callback to after `.join()`.
2. Remove `this.parentNode.appendChild(this)` from `updateHighlighting`.

Replace the `update` method's bars section (lines 87-109) with:

```js
    // Bars
    this.barsG.selectAll("rect")
      .data(unique, (d) => d.employerId)
      .join(
        (enter) => enter.append("rect")
          .attr("x", 0)
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", 0)
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => topIds.has(d.employerId) ? "#d62728" : "#2ca02c")
          .attr("opacity", 0.8)
          .call((sel) => sel.transition().duration(500)
            .attr("width", (d) => xScale(d.avg_turnover))),
        (update) => update.transition().duration(500)
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", (d) => xScale(d.avg_turnover))
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => topIds.has(d.employerId) ? "#d62728" : "#2ca02c"),
        (exit) => exit.transition().duration(300).attr("width", 0).remove()
      )
      .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
      .on("mouseleave", () => controllerMethods.handleUnhover())
      .on("click", (event, d) => controllerMethods.handleClick(d.employerId));
```

Replace the `updateHighlighting` method (lines 120-144) with:

```js
  updateHighlighting(hoveredId, selectedIds) {
    const bars = this.barsG.selectAll("rect");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      bars.attr("opacity", 0.8).attr("stroke", "none");
      return;
    }

    bars.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1).attr("stroke", "#000").attr("stroke-width", 2);
      } else if (isSelected) {
        el.attr("opacity", 0.9).attr("stroke", "#000").attr("stroke-width", 1);
      } else {
        el.attr("opacity", 0.2).attr("stroke", "none");
      }
    });
  }
```

**Step 2: Verify**

- Bar chart still renders top 10 red + bottom 10 green
- Hover: hovered bar gets black stroke, others dim — no DOM reorder flicker
- Click: selection persists

**Step 3: Commit**

```bash
git add client/src/components/q3/turnoverbar/TurnoverBarD3.js
git commit -m "fix(q3): fix bar chart event handlers and remove DOM mutation in highlighting"
```

---

## Task 4: Fix ControlBar + Enhance Tooltip

**Files:**
- Modify: `client/src/components/q3/controlbar/Q3ControlBar.jsx`
- Modify: `client/src/components/q3/tooltip/Q3Tooltip.jsx`

**Step 1: Fix `Q3ControlBar.jsx`**

Replace entire file:

```jsx
// client/src/components/q3/controlbar/Q3ControlBar.jsx
import { useSelector, useDispatch } from "react-redux";
import {
  selectQ3SelectedEmployers,
  selectQ3TopN,
  setQ3TopN,
  clearQ3Selection,
} from "../../../store/Q3InteractionSlice.js";

export default function Q3ControlBar() {
  const dispatch = useDispatch();
  const topN = useSelector(selectQ3TopN);
  const selectedIds = useSelector(selectQ3SelectedEmployers);

  return (
    <div className="controlbar">
      <h1>VAST 2022 — Employment Dynamics</h1>
      <label>
        Top/bottom employers by turnover:
        <input
          type="number"
          min={1}
          max={50}
          value={topN}
          onChange={(e) => dispatch(setQ3TopN(Number(e.target.value)))}
        />
      </label>
      {selectedIds.length > 0 && (
        <button onClick={() => dispatch(clearQ3Selection())}>
          Clear selection ({selectedIds.length})
        </button>
      )}
    </div>
  );
}
```

**Step 2: Fix `Q3Tooltip.jsx`**

Add turnover rank. Replace entire file:

```jsx
// client/src/components/q3/tooltip/Q3Tooltip.jsx
import { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { selectQ3Employers } from "../../../store/Q3DataSlice.js";
import { selectQ3HoveredEmployer } from "../../../store/Q3InteractionSlice.js";

export default function Q3Tooltip() {
  const hoveredId = useSelector(selectQ3HoveredEmployer);
  const employers = useSelector(selectQ3Employers);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handler = (e) => setMouse({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Precompute rank map (sorted by turnover descending)
  const rankMap = useMemo(() => {
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    const map = {};
    sorted.forEach((d, i) => { map[d.employerId] = i + 1; });
    return map;
  }, [employers]);

  if (hoveredId === null) return null;

  const emp = employers.find((d) => d.employerId === hoveredId);
  if (!emp) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: mouse.x + 15,
        top: mouse.y - 10,
        pointerEvents: "none",
        background: "white",
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "8px 12px",
        fontSize: "13px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        zIndex: 1000,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: "bold" }}>Employer {emp.employerId}</div>
      <div style={{ color: "#888", fontSize: "11px" }}>
        Rank #{rankMap[emp.employerId]} of {employers.length} by turnover
      </div>
      <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
      <div>Avg headcount: {emp.avg_headcount.toFixed(1)}</div>
      <div>Avg turnover: {(emp.avg_turnover * 100).toFixed(1)}%</div>
      <div>Total arrivals: {emp.total_arrivals}</div>
      <div>Total departures: {emp.total_departures}</div>
      <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid #eee" }} />
      <div>Avg tenure: {emp.avg_tenure.toFixed(1)} months</div>
      <div>Avg hourly rate: ${emp.avg_hourly_rate.toFixed(2)}</div>
    </div>
  );
}
```

**Step 3: Verify**

- ControlBar: title aligned left, controls pushed right (no inline style override)
- Label reads "Top/bottom employers by turnover:"
- Tooltip: shows "Rank #X of 249 by turnover" below employer ID
- All other tooltip fields unchanged

**Step 4: Commit**

```bash
git add client/src/components/q3/controlbar/Q3ControlBar.jsx client/src/components/q3/tooltip/Q3Tooltip.jsx
git commit -m "fix(q3): fix ControlBar layout and add turnover rank to tooltip"
```

---

## Task 5: End-to-End Verification

**Step 1: Full Q3 user flow test**

Start both servers:
```bash
cd C:/Users/swae2/Documents/DataViz && python server/app.py &
cd C:/Users/swae2/Documents/DataViz/client && npm run dev
```

Walk through:

1. Click Q3 tab → data loads, all 3 panels render
2. **Heatmap:** ~20 rows visible (top 10 + bottom 10), separator line between groups, all Y-axis labels readable
3. **Bar chart:** top 10 red + bottom 10 green, median reference line
4. **Scatter:** 249 dots, color legend (hourly rate) and size legend (departures) visible on right
5. Change topN slider to 5 → heatmap shows 10 rows, bar chart shows 10 bars
6. Change topN slider to 15 → heatmap shows 30 rows, bar chart shows 30 bars
7. Hover an employer in heatmap → row highlights, bar highlights, scatter dot highlights, tooltip shows rank
8. Hover an employer in bar chart → same coordinated highlighting across all panels
9. Hover in scatter → same coordination
10. Click an employer → selection persists across all panels
11. Click "Clear selection" → clears
12. Switch to Q1 tab → works as before
13. Switch to Q2 tab → works as before
14. Switch back to Q3 → data still loaded, no re-fetch

**Step 2: Fix any issues found**

Common things to check:
- SVG dimensions fit within panel borders
- Legends not clipped
- Separator line positioned correctly
- No console errors

**Step 3: Commit if any fixes were made**

```bash
git add -A
git commit -m "fix(q3): polish after end-to-end verification"
```
