// client/src/components/q2/areachart/AreaChartContainer.jsx
import { useRef, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { selectQ2Monthly, selectQ2Residents } from "../../../store/Q2DataSlice.js";
import { selectSelectedCluster } from "../../../store/Q2InteractionSlice.js";
import AreaChartD3 from "./AreaChartD3.js";
import * as d3 from "d3";

function computeMonthlyMedians(monthly, residents, selectedCluster) {
  const activeIds = selectedCluster !== null
    ? new Set(residents.filter((r) => r.cluster === selectedCluster).map((r) => r.participantId))
    : null;

  const byMonth = d3.groups(monthly, (d) => d.month);
  return byMonth.map(([month, records]) => {
    const filtered = activeIds ? records.filter((r) => activeIds.has(r.participantId)) : records;
    return {
      month,
      income: d3.median(filtered, (d) => d.income) || 0,
      shelter: d3.median(filtered, (d) => d.shelter) || 0,
      food: d3.median(filtered, (d) => d.food) || 0,
      recreation: d3.median(filtered, (d) => d.recreation) || 0,
      education: d3.median(filtered, (d) => d.education) || 0,
    };
  }).sort((a, b) => new Date(a.month) - new Date(b.month));
}

export default function AreaChartContainer() {
  const ref = useRef(null);
  const d3Ref = useRef(null);

  const monthly = useSelector(selectQ2Monthly);
  const residents = useSelector(selectQ2Residents);
  const selectedCluster = useSelector(selectSelectedCluster);

  const fullPopMedians = useMemo(
    () => computeMonthlyMedians(monthly, residents, null),
    [monthly, residents]
  );

  const currentMedians = useMemo(
    () => selectedCluster !== null
      ? computeMonthlyMedians(monthly, residents, selectedCluster)
      : fullPopMedians,
    [monthly, residents, selectedCluster, fullPopMedians]
  );

  useEffect(() => {
    const instance = new AreaChartD3(ref.current, {});
    instance.create({ width: 700, height: 400 });
    d3Ref.current = instance;
    return () => instance.clear();
  }, []);

  useEffect(() => {
    if (d3Ref.current && currentMedians.length > 0) {
      const refMedians = selectedCluster !== null ? fullPopMedians : null;
      d3Ref.current.update(currentMedians, refMedians, selectedCluster);
    }
  }, [currentMedians, fullPopMedians, selectedCluster]);

  return <div ref={ref} className="areachart-panel"><h3 className="panel-title">Median Income vs Cost of Living</h3></div>;
}
