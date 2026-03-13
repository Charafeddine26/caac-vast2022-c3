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
        .text("High turnover \u2191");
      this.separatorG.append("text")
        .attr("x", -5).attr("y", separatorY + 14)
        .attr("text-anchor", "end").attr("font-size", "9px").attr("fill", "#2ca02c")
        .text("Stable \u2193");
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
