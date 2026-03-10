import * as d3 from "d3";

export default class ScatterplotD3 {
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

    this.quadrantG = this.mainG.append("g").attr("class", "quadrants");
    this.dotsG = this.mainG.append("g").attr("class", "dots");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // X axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 40)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Employee count trend (slope)");

    // Y axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Wage trend (slope)");
  }

  performanceScore(d) {
    return (this.empNorm(d.employee_slope) + this.salNorm(d.wage_slope)) / 2;
  }

  update(employers) {
    const { innerWidth, innerHeight } = this;

    // Symmetric domains centered on 0
    const empExtent = d3.extent(employers, (d) => d.employee_slope);
    const empMax = Math.max(Math.abs(empExtent[0]), Math.abs(empExtent[1]));
    const wageExtent = d3.extent(employers, (d) => d.wage_slope);
    const wageMax = Math.max(Math.abs(wageExtent[0]), Math.abs(wageExtent[1]));

    this.xScale = d3.scaleLinear()
      .domain([-empMax, empMax])
      .range([0, innerWidth])
      .nice();

    this.yScale = d3.scaleLinear()
      .domain([-wageMax, wageMax])
      .range([innerHeight, 0])
      .nice();

    this.sizeScale = d3.scaleSqrt()
      .domain(d3.extent(employers, (d) => d.total_wages))
      .range([3, 20]);

    this.colorScale = d3.scaleSequential(d3.interpolateRdYlGn)
      .domain([0, 1]);

    this.empNorm = d3.scaleLinear()
      .domain(d3.extent(employers, (d) => d.employee_slope))
      .range([0, 1]);

    this.salNorm = d3.scaleLinear()
      .domain(d3.extent(employers, (d) => d.wage_slope))
      .range([0, 1]);

    // Quadrant reference lines
    this.quadrantG.selectAll("*").remove();

    // Vertical line at x=0
    this.quadrantG.append("line")
      .attr("x1", this.xScale(0))
      .attr("x2", this.xScale(0))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#999")
      .attr("stroke-dasharray", "4,4");

    // Horizontal line at y=0
    this.quadrantG.append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", this.yScale(0))
      .attr("y2", this.yScale(0))
      .attr("stroke", "#999")
      .attr("stroke-dasharray", "4,4");

    // Quadrant labels
    this.quadrantG.append("text")
      .attr("x", innerWidth - 5)
      .attr("y", 15)
      .attr("text-anchor", "end")
      .attr("font-size", "11px")
      .attr("fill", "#999")
      .text("Prosperous");

    this.quadrantG.append("text")
      .attr("x", 5)
      .attr("y", innerHeight - 5)
      .attr("text-anchor", "start")
      .attr("font-size", "11px")
      .attr("fill", "#999")
      .text("Struggling");

    // Axes with transitions
    this.xAxisG.transition().duration(500)
      .call(d3.axisBottom(this.xScale));

    this.yAxisG.transition().duration(500)
      .call(d3.axisLeft(this.yScale));

    // Dots
    const xScale = this.xScale;
    const yScale = this.yScale;
    const sizeScale = this.sizeScale;
    const colorScale = this.colorScale;
    const controllerMethods = this.controllerMethods;
    const self = this;

    this.dotsG.selectAll("circle")
      .data(employers, (d) => d.employerId)
      .join(
        (enter) =>
          enter
            .append("circle")
            .attr("cx", (d) => xScale(d.employee_slope))
            .attr("cy", (d) => yScale(d.wage_slope))
            .attr("r", 0)
            .attr("fill", (d) => colorScale(self.performanceScore(d)))
            .attr("stroke", "#333")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.8)
            .call((sel) =>
              sel.transition().duration(500).attr("r", (d) => sizeScale(d.total_wages))
            ),
        (update) =>
          update.call((sel) =>
            sel
              .transition()
              .duration(500)
              .attr("cx", (d) => xScale(d.employee_slope))
              .attr("cy", (d) => yScale(d.wage_slope))
              .attr("r", (d) => sizeScale(d.total_wages))
          ),
        (exit) =>
          exit.call((sel) =>
            sel.transition().duration(300).attr("r", 0).remove()
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
    const circles = this.dotsG.selectAll("circle");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    if (!hasHover && !hasSelection) {
      circles
        .attr("opacity", 0.8)
        .attr("stroke-width", 0.5)
        .attr("stroke", "#333");
      return;
    }

    circles.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1)
          .attr("stroke-width", 2.5)
          .attr("stroke", "#000");
        // Bring to front
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9)
          .attr("stroke-width", 2)
          .attr("stroke", "#000");
      } else if (hasHover) {
        el.attr("opacity", 0.2)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#333");
      } else {
        // hasSelection but not selected and not hovered
        el.attr("opacity", 0.8)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#333");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
