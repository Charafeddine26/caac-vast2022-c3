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
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");
    this.legendG = this.mainG.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${this.innerWidth + 10}, 0)`);
  }

  update(monthly, employers, topN) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Sort employers by avg turnover (highest first)
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    const employerIds = sorted.map((d) => d.employerId);
    const months = [...new Set(monthly.map((d) => d.month))].sort();

    // Determine top/bottom N for Y-axis labels
    this.topIds = new Set(sorted.slice(0, topN).map((d) => d.employerId));
    this.bottomIds = new Set(sorted.slice(-topN).map((d) => d.employerId));

    // Scales
    this.xScale = d3.scaleBand().domain(months).range([0, innerWidth]).padding(0.02);
    this.yScale = d3.scaleBand().domain(employerIds).range([0, innerHeight]).padding(0.02);

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
          .attr("opacity", 0.9)
          .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
          .on("mouseleave", () => controllerMethods.handleUnhover())
          .on("click", (event, d) => controllerMethods.handleClick(d.employerId)),
        (update) => update.transition().duration(500)
          .attr("x", (d) => xScale(d.month))
          .attr("y", (d) => yScale(d.employerId))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", (d) => colorScale(d.turnover_rate)),
        (exit) => exit.remove()
      );

    // X axis
    this.xAxisG.call(
      d3.axisBottom(xScale).tickFormat((m) => d3.timeFormat("%b %y")(new Date(m)))
    ).selectAll("text").attr("font-size", "9px");

    // Y axis — only show labels for top/bottom N employers
    const topIds = this.topIds;
    const bottomIds = this.bottomIds;
    const labeledIds = employerIds.filter((id) => topIds.has(id) || bottomIds.has(id));

    this.yAxisG.call(
      d3.axisLeft(yScale)
        .tickValues(labeledIds)
        .tickFormat((id) => `E${id}`)
    ).selectAll("text").attr("font-size", "8px");

    // Color legend
    this.legendG.selectAll("*").remove();
    const legendHeight = Math.min(innerHeight, 200);
    const legendWidth = 12;

    // Gradient
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
        this.parentNode.appendChild(this);
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
