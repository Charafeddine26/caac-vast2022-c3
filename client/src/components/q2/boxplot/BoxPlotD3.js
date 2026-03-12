// client/src/components/q2/boxplot/BoxPlotD3.js
import * as d3 from "d3";

export default class BoxPlotD3 {
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

    this.zeroLineG = this.mainG.append("g").attr("class", "zero-line");
    this.boxesG = this.mainG.append("g").attr("class", "boxes");
    this.referenceG = this.mainG.append("g").attr("class", "reference");
    this.highlightG = this.mainG.append("g").attr("class", "highlight-dots");
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
      .text("Net balance ($)");
  }

  update(boxStats, referenceStats, selectedCluster) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    const months = boxStats.map((d) => d.month);
    this.xScale = d3.scaleBand().domain(months).range([0, innerWidth]).padding(0.3);
    this.months = months;

    const allValues = boxStats.flatMap((d) => [d.whiskerLow, d.whiskerHigh]);
    const yMin = Math.min(d3.min(allValues), 0);
    const yMax = d3.max(allValues);
    this.yScale = d3.scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]).nice();

    const xScale = this.xScale;
    const yScale = this.yScale;
    const bw = xScale.bandwidth();

    // Zero reference line
    this.zeroLineG.selectAll("*").remove();
    this.zeroLineG.append("line")
      .attr("x1", 0).attr("x2", innerWidth)
      .attr("y1", yScale(0)).attr("y2", yScale(0))
      .attr("stroke", "#d32f2f").attr("stroke-dasharray", "6,3").attr("stroke-width", 1);

    // Box groups
    this.boxesG.selectAll("g.box-group")
      .data(boxStats, (d) => d.month)
      .join(
        (enter) => {
          const g = enter.append("g").attr("class", "box-group")
            .attr("transform", (d) => `translate(${xScale(d.month)}, 0)`);

          // Whisker top line
          g.append("line").attr("class", "whisker-top")
            .attr("x1", bw / 2).attr("x2", bw / 2)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.q3))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Whisker top cap
          g.append("line").attr("class", "cap-top")
            .attr("x1", bw * 0.25).attr("x2", bw * 0.75)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.whiskerHigh))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Box
          g.append("rect").attr("class", "box")
            .attr("x", 0).attr("width", bw)
            .attr("y", (d) => yScale(d.q3))
            .attr("height", (d) => Math.max(0, yScale(d.q1) - yScale(d.q3)))
            .attr("fill", "#78909c").attr("opacity", 0.7)
            .attr("stroke", "#455a64").attr("stroke-width", 1);

          // Median line
          g.append("line").attr("class", "median")
            .attr("x1", 0).attr("x2", bw)
            .attr("y1", (d) => yScale(d.median)).attr("y2", (d) => yScale(d.median))
            .attr("stroke", "#263238").attr("stroke-width", 2);

          // Whisker bottom line
          g.append("line").attr("class", "whisker-bottom")
            .attr("x1", bw / 2).attr("x2", bw / 2)
            .attr("y1", (d) => yScale(d.q1)).attr("y2", (d) => yScale(d.whiskerLow))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Whisker bottom cap
          g.append("line").attr("class", "cap-bottom")
            .attr("x1", bw * 0.25).attr("x2", bw * 0.75)
            .attr("y1", (d) => yScale(d.whiskerLow)).attr("y2", (d) => yScale(d.whiskerLow))
            .attr("stroke", "#555").attr("stroke-width", 1);

          // Outlier dots
          g.each(function (d) {
            d3.select(this).selectAll("circle.outlier")
              .data(d.outliers)
              .join("circle")
              .attr("class", "outlier")
              .attr("cx", bw / 2)
              .attr("cy", (v) => yScale(v))
              .attr("r", 2)
              .attr("fill", "#78909c")
              .attr("opacity", 0.5);
          });

          // Invisible hover rect for interaction
          g.append("rect").attr("class", "hover-rect")
            .attr("x", 0).attr("width", bw)
            .attr("y", 0).attr("height", innerHeight)
            .attr("fill", "transparent")
            .on("mouseenter", (event, d) => controllerMethods.handleMonthHover(d.month))
            .on("mouseleave", () => controllerMethods.handleMonthUnhover());

          return g;
        },
        (update) => {
          update.transition().duration(500)
            .attr("transform", (d) => `translate(${xScale(d.month)}, 0)`);

          update.select(".whisker-top").transition().duration(500)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.q3));
          update.select(".cap-top").transition().duration(500)
            .attr("y1", (d) => yScale(d.whiskerHigh)).attr("y2", (d) => yScale(d.whiskerHigh));
          update.select(".box").transition().duration(500)
            .attr("y", (d) => yScale(d.q3))
            .attr("height", (d) => Math.max(0, yScale(d.q1) - yScale(d.q3)));
          update.select(".median").transition().duration(500)
            .attr("y1", (d) => yScale(d.median)).attr("y2", (d) => yScale(d.median));
          update.select(".whisker-bottom").transition().duration(500)
            .attr("y1", (d) => yScale(d.q1)).attr("y2", (d) => yScale(d.whiskerLow));
          update.select(".cap-bottom").transition().duration(500)
            .attr("y1", (d) => yScale(d.whiskerLow)).attr("y2", (d) => yScale(d.whiskerLow));

          update.each(function (d) {
            d3.select(this).selectAll("circle.outlier")
              .data(d.outliers)
              .join("circle")
              .attr("class", "outlier")
              .attr("cx", bw / 2)
              .transition().duration(500)
              .attr("cy", (v) => yScale(v))
              .attr("r", 2)
              .attr("fill", "#78909c")
              .attr("opacity", 0.5);
          });

          return update;
        },
        (exit) => exit.remove()
      );

    // Reference trend line (full-pop medians when cluster focused)
    this.referenceG.selectAll("*").remove();
    if (selectedCluster !== null && referenceStats) {
      const refLine = d3.line()
        .x((d) => xScale(d.month) + bw / 2)
        .y((d) => yScale(d.median))
        .curve(d3.curveMonotoneX);

      this.referenceG.append("path")
        .attr("d", refLine(referenceStats))
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.5);

      this.referenceG.append("text")
        .attr("x", xScale(referenceStats[referenceStats.length - 1].month) + bw + 5)
        .attr("y", yScale(referenceStats[referenceStats.length - 1].median))
        .attr("font-size", "10px").attr("fill", "#999")
        .text("All residents median");
    }

    // Axes
    this.xAxisG.transition().duration(500).call(
      d3.axisBottom(xScale).tickFormat((m) => d3.timeFormat("%b %y")(new Date(m)))
    );
    this.yAxisG.transition().duration(500).call(
      d3.axisLeft(yScale).tickFormat(d3.format("~s"))
    );
  }

  updateHighlighting(hoveredResidentId, selectedResidentIds, monthly, colorScale) {
    this.highlightG.selectAll("*").remove();

    if (!this.xScale || !this.yScale) return;

    const xScale = this.xScale;
    const yScale = this.yScale;
    const bw = xScale.bandwidth();
    const idsToShow = [];

    if (hoveredResidentId !== null) {
      idsToShow.push({ id: hoveredResidentId, r: 4, opacity: 1 });
    }
    selectedResidentIds.forEach((id) => {
      if (id !== hoveredResidentId) {
        idsToShow.push({ id, r: 3, opacity: 0.8 });
      }
    });

    if (idsToShow.length === 0 || !monthly || monthly.length === 0) return;

    idsToShow.forEach(({ id, r, opacity }) => {
      const records = monthly.filter((m) => m.participantId === id);
      const color = colorScale ? colorScale(id) : "#1565c0";

      this.highlightG.selectAll(`circle.hl-${id}`)
        .data(records, (d) => d.month)
        .join("circle")
        .attr("class", `hl-${id}`)
        .attr("cx", (d) => xScale(d.month) + bw / 2)
        .attr("cy", (d) => yScale(d.net_balance))
        .attr("r", r)
        .attr("fill", color)
        .attr("stroke", "#000")
        .attr("stroke-width", 0.5)
        .attr("opacity", opacity);
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
