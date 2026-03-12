// client/src/components/q2/areachart/AreaChartD3.js
import * as d3 from "d3";

const EXPENSE_KEYS = ["shelter", "food", "recreation", "education"];
const EXPENSE_COLORS = {
  shelter: "#bf360c",
  food: "#e65100",
  recreation: "#ff8f00",
  education: "#ffb74d",
};
const INCOME_COLOR = "#1565c0";

export default class AreaChartD3 {
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

    this.areasG = this.mainG.append("g").attr("class", "areas");
    this.referenceG = this.mainG.append("g").attr("class", "reference-lines");
    this.incomeLineG = this.mainG.append("g").attr("class", "income-line");
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
      .text("Monthly amount ($)");

    // Legend
    const legendG = this.mainG.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${this.innerWidth - 150}, 0)`);

    const legendItems = [
      { label: "Income", color: INCOME_COLOR, type: "line" },
      ...EXPENSE_KEYS.map((k) => ({ label: k.charAt(0).toUpperCase() + k.slice(1), color: EXPENSE_COLORS[k], type: "rect" })),
    ];

    legendItems.forEach((item, i) => {
      const g = legendG.append("g").attr("transform", `translate(0, ${i * 16})`);
      if (item.type === "line") {
        g.append("line").attr("x1", 0).attr("x2", 14).attr("y1", 5).attr("y2", 5)
          .attr("stroke", item.color).attr("stroke-width", 2.5);
      } else {
        g.append("rect").attr("width", 12).attr("height", 10)
          .attr("fill", item.color).attr("opacity", 0.8);
      }
      g.append("text").attr("x", 18).attr("y", 10).attr("font-size", "10px").text(item.label);
    });
  }

  update(monthlyMedians, referenceMedians, selectedCluster) {
    const { innerWidth, innerHeight } = this;

    // Scales
    const xDomain = d3.extent(monthlyMedians, (d) => new Date(d.month));
    this.xScale = d3.scaleTime().domain(xDomain).range([0, innerWidth]);

    const maxExpense = d3.max(monthlyMedians, (d) => d.shelter + d.food + d.recreation + d.education);
    const maxIncome = d3.max(monthlyMedians, (d) => d.income);
    const yMax = Math.max(maxExpense || 0, maxIncome || 0);
    this.yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]).nice();

    // Stacked data
    const stack = d3.stack().keys(EXPENSE_KEYS).order(d3.stackOrderNone).offset(d3.stackOffsetNone);
    const stackedData = stack(monthlyMedians);

    // Area generator
    const xScale = this.xScale;
    const yScale = this.yScale;
    const area = d3.area()
      .x((d) => xScale(new Date(d.data.month)))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    // Draw stacked areas
    this.areasG.selectAll("path")
      .data(stackedData, (d) => d.key)
      .join(
        (enter) => enter.append("path")
          .attr("d", area)
          .attr("fill", (d) => EXPENSE_COLORS[d.key])
          .attr("opacity", 0.8),
        (update) => update.transition().duration(500).attr("d", area),
        (exit) => exit.remove()
      );

    // Income line
    const incomeLine = d3.line()
      .x((d) => xScale(new Date(d.month)))
      .y((d) => yScale(d.income))
      .curve(d3.curveMonotoneX);

    this.incomeLineG.selectAll("path")
      .data([monthlyMedians])
      .join(
        (enter) => enter.append("path")
          .attr("d", incomeLine)
          .attr("fill", "none")
          .attr("stroke", INCOME_COLOR)
          .attr("stroke-width", 2.5),
        (update) => update.transition().duration(500).attr("d", incomeLine),
        (exit) => exit.remove()
      );

    // Reference lines (focus+context)
    this.referenceG.selectAll("*").remove();

    if (selectedCluster !== null && referenceMedians) {
      // Dashed income reference
      const refIncomeLine = d3.line()
        .x((d) => xScale(new Date(d.month)))
        .y((d) => yScale(d.income))
        .curve(d3.curveMonotoneX);

      this.referenceG.append("path")
        .attr("d", refIncomeLine(referenceMedians))
        .attr("fill", "none")
        .attr("stroke", INCOME_COLOR)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.5);

      // Dashed total expense reference
      const refExpenseLine = d3.line()
        .x((d) => xScale(new Date(d.month)))
        .y((d) => yScale(d.shelter + d.food + d.recreation + d.education))
        .curve(d3.curveMonotoneX);

      this.referenceG.append("path")
        .attr("d", refExpenseLine(referenceMedians))
        .attr("fill", "none")
        .attr("stroke", "#999")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "6,4")
        .attr("opacity", 0.5);

      // Label
      const lastRef = referenceMedians[referenceMedians.length - 1];
      this.referenceG.append("text")
        .attr("x", xScale(new Date(lastRef.month)) + 5)
        .attr("y", yScale(lastRef.income) - 5)
        .attr("font-size", "10px")
        .attr("fill", "#999")
        .text("All residents");
    }

    // Axes
    this.xAxisG.transition().duration(500)
      .call(d3.axisBottom(this.xScale).ticks(d3.timeMonth.every(2)).tickFormat(d3.timeFormat("%b %y")));
    this.yAxisG.transition().duration(500)
      .call(d3.axisLeft(this.yScale).tickFormat(d3.format("~s")));
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
