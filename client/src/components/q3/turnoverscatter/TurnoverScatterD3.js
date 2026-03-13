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
