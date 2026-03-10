import * as d3 from "d3";

export default class BarChartD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 20, right: 30, bottom: 40, left: 80 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.barsG = this.mainG.append("g").attr("class", "bars");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // Zero reference line
    this.zeroLine = this.mainG.append("line")
      .attr("class", "zero-line")
      .attr("stroke", "#333")
      .attr("stroke-dasharray", "4,2");

    // X axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 35)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Wage trend (slope per month)");
  }

  update(employers, topN) {
    const { innerWidth, innerHeight } = this;

    // Build visible set: top N + bottom N by wage_slope
    const sorted = [...employers].sort((a, b) => b.wage_slope - a.wage_slope);
    let visible;
    if (topN * 2 >= employers.length) {
      visible = sorted;
    } else {
      const top = sorted.slice(0, topN);
      const bottom = sorted.slice(-topN);
      // Deduplicate by employerId
      const seen = new Set(top.map((d) => d.employerId));
      const deduped = [...top];
      for (const d of bottom) {
        if (!seen.has(d.employerId)) {
          deduped.push(d);
          seen.add(d.employerId);
        }
      }
      visible = deduped;
    }

    // Scales
    const maxAbsSlope = d3.max(visible, (d) => Math.abs(d.wage_slope));

    this.xScale = d3.scaleLinear()
      .domain([-maxAbsSlope, maxAbsSlope])
      .range([0, innerWidth])
      .nice();

    this.yScale = d3.scaleBand()
      .domain(visible.map((d) => d.employerId))
      .range([0, innerHeight])
      .padding(0.15);

    // Update zero line
    this.zeroLine
      .attr("x1", this.xScale(0))
      .attr("x2", this.xScale(0))
      .attr("y1", 0)
      .attr("y2", innerHeight);

    // Axes
    this.xAxisG.transition().duration(500)
      .call(d3.axisBottom(this.xScale).ticks(5));

    this.yAxisG.transition().duration(500)
      .call(d3.axisLeft(this.yScale).tickFormat((d) => "E-" + d));

    // Bars
    const xScale = this.xScale;
    const yScale = this.yScale;
    const controllerMethods = this.controllerMethods;

    this.barsG.selectAll("rect")
      .data(visible, (d) => d.employerId)
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("y", (d) => yScale(d.employerId))
            .attr("height", yScale.bandwidth())
            .attr("x", (d) => xScale(Math.min(0, d.wage_slope)))
            .attr("width", 0)
            .attr("fill", (d) => (d.wage_slope >= 0 ? "#2ca02c" : "#d62728"))
            .attr("opacity", 0.8)
            .call((sel) =>
              sel.transition().duration(500)
                .attr("width", (d) => Math.abs(xScale(d.wage_slope) - xScale(0)))
            ),
        (update) =>
          update.call((sel) =>
            sel.transition().duration(500)
              .attr("y", (d) => yScale(d.employerId))
              .attr("height", yScale.bandwidth())
              .attr("x", (d) => xScale(Math.min(0, d.wage_slope)))
              .attr("width", (d) => Math.abs(xScale(d.wage_slope) - xScale(0)))
              .attr("fill", (d) => (d.wage_slope >= 0 ? "#2ca02c" : "#d62728"))
          ),
        (exit) =>
          exit.call((sel) =>
            sel.transition().duration(300).attr("width", 0).remove()
          )
      )
      .on("mouseenter", (event, d) => {
        controllerMethods.handleHover(d.employerId);
      })
      .on("mouseleave", () => {
        controllerMethods.handleUnhover();
      })
      .on("click", (event, d) => {
        controllerMethods.handleClick(d.employerId);
      });
  }

  updateHighlighting(hoveredId, selectedIds) {
    const bars = this.barsG.selectAll("rect");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      bars
        .attr("opacity", 0.8)
        .attr("stroke", null)
        .attr("stroke-width", null);
      return;
    }

    bars.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1)
          .attr("stroke", "#000")
          .attr("stroke-width", 2);
      } else if (isSelected) {
        el.attr("opacity", 0.9)
          .attr("stroke", "#000")
          .attr("stroke-width", 2);
      } else if (hasHover) {
        el.attr("opacity", 0.3)
          .attr("stroke", null)
          .attr("stroke-width", null);
      } else {
        el.attr("opacity", 0.8)
          .attr("stroke", null)
          .attr("stroke-width", null);
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
