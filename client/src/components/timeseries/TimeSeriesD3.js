import * as d3 from "d3";

export default class TimeSeriesD3 {
  constructor(container, controllerMethods) {
    this.container = container;
    this.controllerMethods = controllerMethods;
  }

  create({ width, height }) {
    this.width = width;
    this.height = height;
    this.margins = { top: 30, right: 30, bottom: 40, left: 80 };
    this.innerWidth = width - this.margins.left - this.margins.right;
    this.innerHeight = height - this.margins.top - this.margins.bottom;

    this.svg = d3.select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mainG = this.svg.append("g")
      .attr("transform", `translate(${this.margins.left},${this.margins.top})`);

    this.linesG = this.mainG.append("g").attr("class", "bg-lines");
    this.highlightG = this.mainG.append("g").attr("class", "highlight-lines");
    this.xAxisG = this.mainG.append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${this.innerHeight})`);
    this.yAxisG = this.mainG.append("g")
      .attr("class", "y-axis");

    // Y axis label
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -60)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Monthly salary mass ($)");
  }

  update(monthly, employers, topN) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Group monthly into series
    const series = d3.groups(monthly, (d) => d.employerId)
      .map(([id, values]) => ({
        employerId: id,
        values: values.sort((a, b) => new Date(a.month) - new Date(b.month)),
        avgEmployeeCount: d3.mean(values, (v) => v.employee_count),
      }));

    // Determine top/bottom sets
    const sorted = [...employers].sort((a, b) => b.wage_slope - a.wage_slope);
    this.topIds = new Set(sorted.slice(0, topN).map((d) => d.employerId));
    this.bottomIds = new Set(sorted.slice(-topN).map((d) => d.employerId));

    const bgSeries = series.filter(
      (s) => !this.topIds.has(s.employerId) && !this.bottomIds.has(s.employerId)
    );
    const topSeries = series.filter((s) => this.topIds.has(s.employerId));
    const bottomSeries = series.filter((s) => this.bottomIds.has(s.employerId));

    // Scales
    this.xScale = d3.scaleTime()
      .domain(d3.extent(monthly, (d) => new Date(d.month)))
      .range([0, innerWidth]);

    this.yScale = d3.scaleLinear()
      .domain([0, d3.max(monthly, (d) => d.total_wages)])
      .range([innerHeight, 0])
      .nice();

    this.strokeScale = d3.scaleLinear()
      .domain(d3.extent(series, (d) => d.avgEmployeeCount))
      .range([1, 5]);

    // Line generator
    this.line = d3.line()
      .x((d) => this.xScale(new Date(d.month)))
      .y((d) => this.yScale(d.total_wages));

    // Axes
    this.xAxisG.transition().duration(500)
      .call(
        d3.axisBottom(this.xScale)
          .ticks(d3.timeMonth.every(2))
          .tickFormat(d3.timeFormat("%b %y"))
      );

    this.yAxisG.transition().duration(500)
      .call(d3.axisLeft(this.yScale).tickFormat(d3.format("~s")));

    // Background lines
    const line = this.line;
    const strokeScale = this.strokeScale;
    const topIds = this.topIds;

    this.linesG.selectAll("path")
      .data(bgSeries, (d) => d.employerId)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("d", (d) => line(d.values))
            .attr("fill", "none")
            .attr("stroke", "#ddd")
            .attr("stroke-width", 1)
            .attr("opacity", 0.4),
        (update) =>
          update.call((sel) =>
            sel.transition().duration(500)
              .attr("d", (d) => line(d.values))
          ),
        (exit) => exit.remove()
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

    // Highlighted lines (top + bottom)
    const highlightData = [...topSeries, ...bottomSeries];

    this.highlightG.selectAll("path")
      .data(highlightData, (d) => d.employerId)
      .join(
        (enter) =>
          enter
            .append("path")
            .attr("d", (d) => line(d.values))
            .attr("fill", "none")
            .attr("stroke", (d) => (topIds.has(d.employerId) ? "#2ca02c" : "#d62728"))
            .attr("stroke-width", (d) => strokeScale(d.avgEmployeeCount))
            .attr("opacity", 0.7),
        (update) =>
          update.call((sel) =>
            sel.transition().duration(500)
              .attr("d", (d) => line(d.values))
              .attr("stroke", (d) => (topIds.has(d.employerId) ? "#2ca02c" : "#d62728"))
              .attr("stroke-width", (d) => strokeScale(d.avgEmployeeCount))
          ),
        (exit) => exit.remove()
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
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;

    const bgPaths = this.linesG.selectAll("path");
    const hlPaths = this.highlightG.selectAll("path");

    if (!hasHover && !hasSelection) {
      bgPaths
        .attr("opacity", 0.4)
        .attr("stroke", "#ddd")
        .attr("stroke-width", 1);
      hlPaths.each((d, i, nodes) => {
        const el = d3.select(nodes[i]);
        el.attr("opacity", 0.7)
          .attr("stroke-width", this.strokeScale(d.avgEmployeeCount))
          .attr("stroke", this.topIds.has(d.employerId) ? "#2ca02c" : "#d62728");
      });
      return;
    }

    const strokeScale = this.strokeScale;
    const topIds = this.topIds;
    const bottomIds = this.bottomIds;

    // Background paths
    bgPaths.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);

      if (isHovered) {
        el.attr("opacity", 1)
          .attr("stroke", "steelblue")
          .attr("stroke-width", 3);
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9)
          .attr("stroke", "steelblue")
          .attr("stroke-width", 2);
      } else {
        el.attr("opacity", 0.1)
          .attr("stroke", "#ddd")
          .attr("stroke-width", 1);
      }
    });

    // Highlighted paths
    hlPaths.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.employerId === hoveredId;
      const isSelected = selectedIds.includes(d.employerId);
      const baseColor = topIds.has(d.employerId) ? "#2ca02c" : "#d62728";
      const baseWidth = strokeScale(d.avgEmployeeCount);

      if (isHovered) {
        el.attr("opacity", 1)
          .attr("stroke", baseColor)
          .attr("stroke-width", baseWidth + 2);
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9)
          .attr("stroke", baseColor)
          .attr("stroke-width", baseWidth + 1);
      } else {
        el.attr("opacity", 0.1)
          .attr("stroke", baseColor)
          .attr("stroke-width", baseWidth);
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
