"use client";
import { useState } from "react";
export function YearRange({ onChange }: { onChange: (range: string) => void }) {
  const [years, setYears] = useState("");
  return (
    <label className="year-range">
      近{" "}
      <input
        aria-label="自定义年数"
        type="number"
        min="1"
        max="100"
        step="1"
        placeholder="n"
        value={years}
        onChange={(event) => {
          const value = event.target.value;
          setYears(value);
          if (/^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 100)
            onChange(`${Number(value)}Y`);
        }}
      />{" "}
      年
    </label>
  );
}
