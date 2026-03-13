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
    this.margins = { top: 20, right: 30, bottom: 50, left: 60 };
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
      .attr("x", -this.innerHeight / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
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
            .attr("r", (d) => sizeScale(d.total_departures)))
          .on("mouseenter", (event, d) => controllerMethods.handleHover(d.employerId))
          .on("mouseleave", () => controllerMethods.handleUnhover())
          .on("click", (event, d) => controllerMethods.handleClick(d.employerId)),
        (update) => update.transition().duration(500)
          .attr("cx", (d) => xScale(d.avg_headcount))
          .attr("cy", (d) => yScale(d.avg_turnover))
          .attr("r", (d) => sizeScale(d.total_departures)),
        (exit) => exit.transition().duration(300).attr("r", 0).remove()
      );

    // Axes
    this.xAxisG.transition().duration(500).call(d3.axisBottom(xScale));
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat(d3.format(".0%"))
    );
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
