import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  focusPrice,
  frequencyDescription,
  MarketHero,
  quoteChange,
} from "../components/market-focus";
import type { Quote, Series } from "../components/api";
const quote: Quote = {
  seriesId: "SGE_AU9999_D1",
  value: "901.57",
  previousValue: "900.61",
  unit: "CNY/g",
  currency: "CNY",
  source: {
    id: "sge",
    label: "上海黄金交易所",
    url: "https://www.sge.com.cn/",
  },
  asOf: "2026-10-16",
  asOfKind: "date",
  fetchedAt: "2026-10-17T00:00:00Z",
  status: "fresh",
  isDemo: false,
};
const series = {
  id: quote.seriesId,
  nameZh: "国内黄金 Au99.99 日线",
  providerSymbol: "Au99.99",
  providerId: "akshare_sge",
  category: "gold",
  unit: "CNY/g",
  frequency: "1d",
} as Series;
describe("market quote hierarchy and honesty", () => {
  it("labels actual observation frequency without describing monthly data as daily", () => {
    expect(
      frequencyDescription({ ...series, id: "MONTHLY", frequency: "1mo" }),
    ).toBe("月度观察");
    expect(
      frequencyDescription({ ...series, id: "WEEKLY", frequency: "1w" }),
    ).toBe("周度观察");
    expect(frequencyDescription(series)).toBe("日线收盘 · CNY/g");
  });
  it("uses the actual daily close with two decimals and a change from the preceding valid observation", () => {
    expect(focusPrice(quote)).toBe("901.57");
    expect(quoteChange(quote).absolute).toBeCloseTo(0.96);
    expect(quoteChange(quote).percent).toBeCloseTo(0.10659, 4);
    const html = renderToStaticMarkup(
      createElement(MarketHero, { series, quote }),
    );
    expect(html).toContain("901.57");
    expect(html).toContain("2026-10-16");
    expect(html).toContain("较上一有效观测");
    expect(html).toContain("上海黄金交易所");
  });
  it("does not present a synthetic demo number or change as a market quote", () => {
    const demo = {
      ...quote,
      value: "12345.67",
      previousValue: "12000",
      isDemo: true,
      status: "demo",
    };
    expect(focusPrice(demo)).toBe("—");
    expect(quoteChange(demo).absolute).toBeNull();
    const html = renderToStaticMarkup(
      createElement(MarketHero, { series, quote: demo }),
    );
    expect(html).not.toContain("12345.67");
    expect(html).not.toContain("12000");
    expect(html).toContain("演示数据");
    expect(html).toContain("配置真实数据源");
  });
  it("preserves unavailable values and avoids inventing a previous-value change", () => {
    expect(focusPrice({ ...quote, value: null })).toBe("—");
    expect(focusPrice({ ...quote, value: "" })).toBe("—");
    expect(quoteChange({ ...quote, previousValue: null }).absolute).toBeNull();
    expect(quoteChange({ ...quote, previousValue: "0" }).percent).toBeNull();
  });
  it("shows yield differences as percentage points instead of relative return", () => {
    const html = renderToStaticMarkup(
      createElement(MarketHero, {
        series: { ...series, unit: "percent" },
        quote: {
          ...quote,
          value: "2.7",
          previousValue: "2.5",
          unit: "percent",
        },
      }),
    );
    expect(html).toContain("百分点");
    expect(html).not.toContain("8.00%");
  });
});
