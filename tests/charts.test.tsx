import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axisStep, BarChart, ChartKey, LineChart } from "@/components/ui/Charts";
import { expectNoAxeViolations } from "./axe";

const bars = (values: number[], markers: Array<number | null> = []) => values.map((v, i) => ({ label: `GW${i + 1}`, value: v, marker: markers[i] ?? undefined }));
const texts = (c: HTMLElement) => [...c.querySelectorAll("text")].map((t) => t.textContent);
const heights = (c: HTMLElement) => [...c.querySelectorAll("rect")].map((r) => Number(r.getAttribute("height")));

describe("axisStep", () => {
  it("prints every x label while they fit, then thins them out", () => {
    expect([1, 14, 15, 28, 29, 38].map(axisStep)).toEqual([1, 1, 2, 2, 5, 5]);
  });
});

describe("BarChart", () => {
  it("draws a bar per value, scaled to the biggest, with every number printed while there's room", () => {
    const { container } = render(<BarChart bars={bars([10, 20, 40])} label="Three weeks" height={100} />);
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(heights(container)).toEqual([25, 50, 100]);
    expect(texts(container)).toEqual(expect.arrayContaining(["10", "20", "40", "GW1", "GW2", "GW3"]));
    expect(screen.getByRole("img", { name: "Three weeks" })).toBeInTheDocument();
  });

  it("uses the supplied number format", () => {
    const { container } = render(<BarChart bars={bars([1234])} format={(n) => `£${n}`} label="x" />);
    expect(texts(container)).toContain("£1234");
  });

  it("scales to a marker that is higher than every bar", () => {
    const { container } = render(<BarChart bars={bars([10], [40])} label="x" height={100} />);
    expect(heights(container)).toEqual([25]);
  });

  it("colours a bar by whether it beat its own marker, and draws the marker", () => {
    const { container } = render(<BarChart bars={bars([50, 50, 50], [40, 50, 60])} label="x" />);
    const classes = [...container.querySelectorAll("rect")].map((r) => r.getAttribute("class"));
    expect(classes).toEqual(["barUp", "barDown", "barDown"]);            // a tie does not count as beating it
    expect(container.querySelectorAll("line.marker")).toHaveLength(3);
  });

  it("uses one colour, and picks out the latest bar, when there are no markers", () => {
    const { container } = render(<BarChart bars={bars([5, 6, 7])} label="x" />);
    expect([...container.querySelectorAll("rect")].map((r) => r.getAttribute("class"))).toEqual(["bar", "bar", "barLatest"]);
    expect(container.querySelector("line.marker")).toBeNull();
  });

  it("prints only the best and the latest numbers when there are too many bars to label", () => {
    const values = Array.from({ length: 20 }, (_, i) => (i === 6 ? 99 : 10 + i));
    const { container } = render(<BarChart bars={bars(values)} label="x" />);
    const printed = texts(container).filter((t) => /^\d+$/.test(t ?? "") && !t!.startsWith("GW"));
    expect(printed).toEqual(expect.arrayContaining(["99", "29"]));         // the peak and the latest
    expect(printed.filter((t) => t !== "99" && t !== "29").length).toBeLessThanOrEqual(0);
  });

  it("thins the axis labels when there are many bars but always labels the last", () => {
    const { container } = render(<BarChart bars={bars(Array.from({ length: 20 }, () => 5))} label="x" />);
    const axis = texts(container).filter((t) => t?.startsWith("GW"));
    expect(axis).toContain("GW20");
    expect(axis.length).toBeLessThan(20);
  });

  it("keeps a bar's number clear of its own average marker", () => {
    const { container } = render(<BarChart bars={bars([39, 20], [45, null as unknown as number])} label="x" height={100} />);
    const marker = container.querySelector("line.marker")!;
    const [near, far] = [...container.querySelectorAll("text")].filter((t) => t.textContent === "39" || t.textContent === "20");
    expect(Number(near.getAttribute("y"))).toBeLessThan(Number(marker.getAttribute("y1")));   // above the marker, not struck through by it
    const rect = container.querySelectorAll("rect")[1];
    expect(Number(far.getAttribute("y"))).toBeCloseTo(Number(rect.getAttribute("y")) - 4);    // no marker nearby: just above the bar
  });

  it("never gives a zero or negative value an invisible bar", () => {
    const { container } = render(<BarChart bars={bars([0, -4, 8])} label="x" />);
    for (const h of heights(container)) expect(h).toBeGreaterThanOrEqual(1.5);
  });

  it("renders nothing for no data, and survives all-zero data", () => {
    const { container } = render(<BarChart bars={[]} label="x" />);
    expect(container).toBeEmptyDOMElement();
    const { container: zeros } = render(<BarChart bars={bars([0, 0])} label="x" />);
    expect(zeros.querySelectorAll("rect")).toHaveLength(2);
  });

  it("shows a legend only when given one, and has no accessibility violations", async () => {
    const { container } = render(<BarChart bars={bars([1, 2], [1, 3])} label="x" legend={<ChartKey kind="up">Beat it</ChartKey>} />);
    expect(screen.getByText("Beat it")).toBeInTheDocument();
    await expectNoAxeViolations(container);
    const { container: bare } = render(<BarChart bars={bars([1])} label="x" />);
    expect(bare.querySelector("figcaption")).toBeNull();
  });
});

describe("LineChart", () => {
  const pts = (...v: number[]) => v.map((value, i) => ({ label: `GW${i + 1}`, value }));
  const ys = (c: HTMLElement) => [...c.querySelectorAll("circle")].map((e) => Number(e.getAttribute("cy")));

  it("puts a higher value higher on the chart", () => {
    const { container } = render(<LineChart points={pts(10, 30, 20)} label="x" />);
    const [a, b, c] = ys(container);
    expect(b).toBeLessThan(c);                                           // 30 is above 20 (smaller y is higher)
    expect(c).toBeLessThan(a);
  });

  it("puts a lower value higher when smaller is better (a rank)", () => {
    const { container } = render(<LineChart points={pts(1000, 100, 500)} invert label="x" />);
    const [a, b, c] = ys(container);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(a);
  });

  it("spaces by order of magnitude on a log axis", () => {
    const linear = render(<LineChart points={pts(1_000_000, 100_000, 10_000)} invert label="x" />).container;
    const log = render(<LineChart points={pts(1_000_000, 100_000, 10_000)} invert log label="x" />).container;
    const gap = (c: HTMLElement) => { const [a, b, z] = ys(c); return [Math.abs(b - a), Math.abs(z - b)]; };
    const [l1, l2] = gap(linear);
    const [g1, g2] = gap(log);
    expect(l2).toBeLessThan(l1 / 5);                                     // linear: the second step is tiny...
    expect(Math.abs(g1 - g2)).toBeLessThan(0.5);                         // ...log: both steps are the same
  });

  it("labels every point while there are few, and the ends, best and worst when there are many", () => {
    const few = render(<LineChart points={pts(5, 6, 7)} label="x" />).container;
    expect(texts(few)).toEqual(expect.arrayContaining(["5", "6", "7"]));
    const values = Array.from({ length: 12 }, (_, i) => (i === 5 ? 90 : i === 8 ? 1 : 40 + i));
    const many = render(<LineChart points={pts(...values)} label="x" />).container;
    const printed = texts(many).filter((t) => /^\d+$/.test(t ?? ""));
    expect(printed).toEqual(expect.arrayContaining(["40", "51", "90", "1"]));   // first, last, peak, trough
    expect(printed).not.toContain("44");                                         // an ordinary point in the middle (GW5)
  });

  it("formats the numbers it prints", () => {
    const { container } = render(<LineChart points={pts(7_295_417, 147_643)} format={(n) => `~${Math.round(n / 1000)}k`} label="x" />);
    expect(texts(container)).toEqual(expect.arrayContaining(["~7295k", "~148k"]));
  });

  it("copes with one point, with all-equal values, and with nothing", () => {
    const one = render(<LineChart points={pts(5)} label="x" />).container;
    expect(one.querySelectorAll("circle")).toHaveLength(1);
    expect(one.querySelector("polyline")).toBeNull();
    const flat = render(<LineChart points={pts(5, 5, 5)} label="x" />).container;
    expect(new Set(ys(flat)).size).toBe(1);
    expect(render(<LineChart points={[]} label="x" />).container).toBeEmptyDOMElement();
  });

  it("does not make a small change look like a cliff when given a minimum span", () => {
    const plain = render(<LineChart points={pts(1000, 1001)} label="x" height={100} />).container;
    const calm = render(<LineChart points={pts(1000, 1001)} label="x" height={100} minSpan={20} />).container;
    const drop = (c: HTMLElement) => Math.abs(ys(c)[0] - ys(c)[1]);
    expect(drop(plain)).toBeCloseTo(100, 0);                             // auto-scaled: a 1-point change fills the chart
    expect(drop(calm)).toBeCloseTo(5, 0);                                // with a span of 20 it is 1/20th of it
  });

  describe("label placement", () => {
    const labelFor = (c: HTMLElement, text: string) => [...c.querySelectorAll("text")].find((t) => t.textContent === text)!;
    const dotFor = (c: HTMLElement, i: number) => c.querySelectorAll("circle")[i];
    const attr = (e: Element, name: string) => Number(e.getAttribute(name));

    it("puts the number on the free side of a rising line: above and to the left", () => {
      const { container } = render(<LineChart points={pts(10, 20, 30)} label="x" />);
      const mid = labelFor(container, "20");
      expect(mid.getAttribute("text-anchor")).toBe("end");
      expect(attr(mid, "y")).toBeLessThan(attr(dotFor(container, 1), "cy"));
      expect(attr(mid, "x")).toBeLessThan(attr(dotFor(container, 1), "cx"));
    });
    it("and above and to the right of a falling one", () => {
      const { container } = render(<LineChart points={pts(30, 20, 10)} label="x" />);
      const mid = labelFor(container, "20");
      expect(mid.getAttribute("text-anchor")).toBe("start");
      expect(attr(mid, "x")).toBeGreaterThan(attr(dotFor(container, 1), "cx"));
    });
    it("above a peak and below a trough", () => {
      const peak = render(<LineChart points={pts(10, 30, 10)} label="x" />).container;
      expect(attr(labelFor(peak, "30"), "y")).toBeLessThan(attr(dotFor(peak, 1), "cy"));
      const trough = render(<LineChart points={pts(30, 10, 30)} label="x" />).container;
      expect(attr(labelFor(trough, "10"), "y")).toBeGreaterThan(attr(dotFor(trough, 1), "cy"));
      expect(labelFor(trough, "10").getAttribute("text-anchor")).toBe("middle");
    });
    it("drops a number that would land on top of its neighbour, keeping the latest", () => {
      const flat = Array.from({ length: 6 }, (_, i) => ({ label: `GW${i + 1}`, value: 1000 }));
      const { container } = render(<LineChart points={flat} format={(n) => `£${n / 10}.0m`} label="x" />);
      const printed = [...container.querySelectorAll("text")].filter((t) => t.textContent?.startsWith("£"));
      expect(printed.length).toBeGreaterThanOrEqual(1);
      expect(printed.length).toBeLessThan(6);
      const xs = printed.map((t) => attr(t, "x"));
      expect(xs).toContain(attr(dotFor(container, 5), "cx"));            // the latest point always keeps its number
      for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeGreaterThan(40);
    });
    it("keeps every number when they do not collide", () => {
      const { container } = render(<LineChart points={pts(5, 50, 5, 50)} label="x" />);
      expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(expect.arrayContaining(["5", "50"]));
      expect([...container.querySelectorAll("text")].filter((t) => /^\d+$/.test(t.textContent ?? ""))).toHaveLength(4);
    });
  });

  it("keeps a tiny move on a log axis small too, when given a minimum span in powers of ten", () => {
    const wiggle = pts(1_200_000, 1_190_000, 1_210_000);
    const drop = (c: HTMLElement) => Math.max(...ys(c)) - Math.min(...ys(c));
    const stretched = render(<LineChart points={wiggle} invert log label="x" height={100} />).container;
    const calm = render(<LineChart points={wiggle} invert log minSpan={0.5} label="x" height={100} />).container;
    expect(drop(stretched)).toBeCloseTo(100, 0);                          // auto-scaled: a 1.6% wobble fills the chart
    expect(drop(calm)).toBeLessThan(5);                                   // with half a decade of range it is a ripple
    const big = render(<LineChart points={pts(7_000_000, 150_000)} invert log minSpan={0.5} label="x" height={100} />).container;
    expect(drop(big)).toBeCloseTo(100, 0);                                // a real fall of ~1.7 decades still fills the chart
  });

  it("describes itself and has no accessibility violations", async () => {
    const { container } = render(<LineChart points={pts(1, 2)} label="Two points" legend={<span>Higher is better</span>} />);
    expect(screen.getByRole("img", { name: "Two points" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
