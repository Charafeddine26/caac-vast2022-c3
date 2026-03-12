// client/src/components/q2/residentscatter/ResidentScatterD3.js
import * as d3 from "d3";

export default class ResidentScatterD3 {
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

    // Axis labels
    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", this.innerWidth / 2)
      .attr("y", this.innerHeight + 40)
      .attr("text-anchor", "middle")
      .attr("font-size", "12px")
      .text("Income trend (slope/month)");

    this.mainG.append("text")
      .attr("class", "axis-label")
      .attr("x", -this.innerHeight / 2)
      .attr("y", -45)
      .attr("text-anchor", "middle")
      .attr("transform", "rotate(-90)")
      .attr("font-size", "12px")
      .text("Net balance trend (slope/month)");
  }

  update(residents, clusters) {
    const { innerWidth, innerHeight } = this;
    const controllerMethods = this.controllerMethods;

    // Symmetric domains centered on 0
    const xExtent = d3.extent(residents, (d) => d.income_slope);
    const xMax = Math.max(Math.abs(xExtent[0]), Math.abs(xExtent[1]));
    const yExtent = d3.extent(residents, (d) => d.net_balance_slope);
    const yMax = Math.max(Math.abs(yExtent[0]), Math.abs(yExtent[1]));

    this.xScale = d3.scaleLinear().domain([-xMax, xMax]).range([0, innerWidth]).nice();
    this.yScale = d3.scaleLinear().domain([-yMax, yMax]).range([innerHeight, 0]).nice();
    this.sizeScale = d3.scaleSqrt()
      .domain(d3.extent(residents, (d) => d.avg_income))
      .range([3, 14]);
    this.colorScale = d3.scaleOrdinal()
      .domain(clusters.map((c) => c.cluster))
      .range(clusters.map((c) => c.color));

    // Quadrant reference lines
    this.quadrantG.selectAll("*").remove();

    this.quadrantG.append("line")
      .attr("x1", this.xScale(0)).attr("x2", this.xScale(0))
      .attr("y1", 0).attr("y2", innerHeight)
      .attr("stroke", "#999").attr("stroke-dasharray", "4,4");

    this.quadrantG.append("line")
      .attr("x1", 0).attr("x2", innerWidth)
      .attr("y1", this.yScale(0)).attr("y2", this.yScale(0))
      .attr("stroke", "#999").attr("stroke-dasharray", "4,4");

    // Quadrant labels
    const labels = [
      { x: innerWidth - 5, y: 15, anchor: "end", text: "Improving" },
      { x: 5, y: innerHeight - 5, anchor: "start", text: "Declining" },
      { x: 5, y: 15, anchor: "start", text: "Cutting costs" },
      { x: innerWidth - 5, y: innerHeight - 5, anchor: "end", text: "Cost of living rising" },
    ];
    labels.forEach((l) => {
      this.quadrantG.append("text")
        .attr("x", l.x).attr("y", l.y)
        .attr("text-anchor", l.anchor)
        .attr("font-size", "11px").attr("fill", "#999")
        .text(l.text);
    });

    // Axes
    this.xAxisG.transition().duration(500).call(d3.axisBottom(this.xScale));
    this.yAxisG.transition().duration(500).call(d3.axisLeft(this.yScale));

    // Dots
    const xScale = this.xScale;
    const yScale = this.yScale;
    const sizeScale = this.sizeScale;
    const colorScale = this.colorScale;

    this.dotsG.selectAll("circle")
      .data(residents, (d) => d.participantId)
      .join(
        (enter) =>
          enter.append("circle")
            .attr("cx", (d) => xScale(d.income_slope))
            .attr("cy", (d) => yScale(d.net_balance_slope))
            .attr("r", 0)
            .attr("fill", (d) => colorScale(d.cluster))
            .attr("stroke", "#333")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.7)
            .call((sel) =>
              sel.transition().duration(500).attr("r", (d) => sizeScale(d.avg_income))
            ),
        (update) =>
          update.call((sel) =>
            sel.transition().duration(500)
              .attr("cx", (d) => xScale(d.income_slope))
              .attr("cy", (d) => yScale(d.net_balance_slope))
              .attr("r", (d) => sizeScale(d.avg_income))
          ),
        (exit) =>
          exit.call((sel) =>
            sel.transition().duration(300).attr("r", 0).remove()
          )
      )
      .on("mouseenter", (event, d) => {
        controllerMethods.handleHover(d.participantId);
      })
      .on("mouseleave", () => {
        controllerMethods.handleUnhover();
      })
      .on("click", (event, d) => {
        controllerMethods.handleClick(d.participantId);
      });
  }

  updateHighlighting(hoveredId, selectedIds, selectedCluster) {
    const circles = this.dotsG.selectAll("circle");
    const hasHover = hoveredId !== null;
    const hasSelection = selectedIds.length > 0;
    const hasCluster = selectedCluster !== null;

    if (!hasHover && !hasSelection && !hasCluster) {
      circles
        .attr("opacity", 0.7)
        .attr("stroke-width", 0.5)
        .attr("stroke", "#333");
      return;
    }

    circles.each(function (d) {
      const el = d3.select(this);
      const isHovered = d.participantId === hoveredId;
      const isSelected = selectedIds.includes(d.participantId);
      const inCluster = hasCluster ? d.cluster === selectedCluster : true;

      if (isHovered) {
        el.attr("opacity", 1)
          .attr("stroke-width", 2.5)
          .attr("stroke", "#000");
        this.parentNode.appendChild(this);
      } else if (isSelected) {
        el.attr("opacity", 0.9)
          .attr("stroke-width", 2)
          .attr("stroke", "#000");
      } else if (hasCluster && !inCluster) {
        el.attr("opacity", 0.1)
          .attr("stroke-width", 0.3)
          .attr("stroke", "#333");
      } else if (hasHover) {
        el.attr("opacity", inCluster ? 0.3 : 0.1)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#333");
      } else {
        el.attr("opacity", inCluster ? 0.7 : 0.1)
          .attr("stroke-width", 0.5)
          .attr("stroke", "#333");
      }
    });
  }

  clear() {
    d3.select(this.container).select("svg").remove();
  }
}
