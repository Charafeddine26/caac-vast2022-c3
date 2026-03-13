// client/src/components/q3/turnoverbar/TurnoverBarD3.js
import * as d3 from "d3";

export default class TurnoverBarD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 20, bottom: 40, left: 70 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.barsG = this.mainG.append("g").attr("class", "bars");
    this.refLineG = this.mainG.append("g").attr("class", "ref-line");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // X axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "11px")
      .text("Avg turnover rate");
  }

  update(employers, topN) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Sort by turnover, take top N + bottom N
    const sorted = [...employers].sort((a, b) => b.avg_turnover - a.avg_turnover);
    this.topIds = new Set(sorted.slice(0, topN).map((d) => d.employerId));
    this.bottomIds = new Set(sorted.slice(-topN).map((d) => d.employerId));

    const displayed = [
      ...sorted.slice(0, topN),
      ...sorted.slice(-topN),
    ];
    // Remove duplicates if topN * 2 > total
    const seen = new Set();
    const unique = displayed.filter((d) => {
      if (seen.has(d.employerId)) return false;
      seen.add(d.employerId);
      return true;
    });

    // Scales
    this.xScale = d3.scaleLinear()
      .domain([0, d3.max(unique, (d) => d.avg_turnover)])
      .range([0, innerWidth])
      .nice();

    this.yScale = d3.scaleBand()
      .domain(unique.map((d) => d.employerId))
      .range([0, innerHeight])
      .padding(0.15);

    const xScale = this.xScale;
    const yScale = this.yScale;
    const topIds = this.topIds;

    // Median reference line
    const medianTurnover = d3.median(employers, (d) => d.avg_turnover);
    this.refLineG.selectAll("*").remove();
    this.refLineG.append("line")
      .attr("x1", xScale(medianTurnover)).attr("x2", xScale(medianTurnover))
      .attr("y1", 0).attr("y2", innerHeight)
      .attr("stroke", "#999").attr("stroke-dasharray", "4,4").attr("stroke-width", 1);

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

    // Axes
    this.xAxisG.transition().duration(500).call(
      d3.axisBottom(xScale).ticks(5).tickFormat(d3.format(".0%"))
    );
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat((id) => `E${id}`)
    ).selectAll("text").attr("font-size", "9px");
  }

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

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
