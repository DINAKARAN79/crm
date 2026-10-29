import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  QuotationLayoutDrawing,
  type QuotationLayoutShape,
  type QuotationLayoutUnit,
} from "@/components/crm/quotation-layout-drawing";

const units: QuotationLayoutUnit[] = [
  { id: "unit-available", number: "DCT Valley-U001", status: "AVAILABLE" },
  { id: "unit-available-next", number: "105", status: "AVAILABLE" },
  { id: "unit-booked", number: "102", status: "BOOKED" },
  { id: "unit-sold", number: "103", status: "SOLD" },
  { id: "unit-hold", number: "104", status: "ON_HOLD" },
];

const shapes: QuotationLayoutShape[] = units.map((unit, index) => {
  if (index === 1) {
    return {
      id: `shape-${unit.id}`,
      kind: "POLYGON",
      unit,
      geometry: { points: [{ x: 0.9, y: 0.9 }, { x: 0.99, y: 0.9 }, { x: 0.99, y: 0.99 }, { x: 0.9, y: 0.99 }] },
    };
  }
  return {
    id: `shape-${unit.id}`,
    kind: "RECTANGLE",
    unit,
    geometry: { x: index === 0 ? 0.01 : index * 0.15 + 0.05, y: index === 0 ? 0.01 : 0.2, width: 0.1, height: 0.1 },
  };
});

function InteractiveDrawing() {
  const [selectedUnitId, setSelectedUnitId] = React.useState("");
  return (
    <QuotationLayoutDrawing
      drawing={<img src="site-plan.png" alt="Original white floor plan" />}
      shapes={shapes}
      units={units}
      selectedUnitId={selectedUnitId}
      onSelectUnit={(unit) => setSelectedUnitId((current) => current === unit.id ? "" : unit.id)}
    />
  );
}

describe("quotation unit selection overlay", () => {
  it("keeps the white image frame and all unit status fills unchanged while selecting and deselecting", () => {
    const { container } = render(<InteractiveDrawing />);
    const frame = container.querySelector(".relative.mx-auto") as HTMLDivElement;
    const overlay = screen.getByRole("group", { name: "Mapped units on project layout" });
    const available = screen.getByRole("button", { name: "Unit DCT Valley-U001, Available" });
    const nextAvailable = screen.getByRole("button", { name: "Unit 105, Available" });
    const booked = screen.getByRole("button", { name: "Unit 102, Booked" });
    const sold = screen.getByRole("button", { name: "Unit 103, Sold" });
    const onHold = screen.getByRole("button", { name: "Unit 104, On Hold" });

    expect(frame).toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
    expect(overlay.style.backgroundColor).toBe("transparent");
    expect(overlay).toHaveAttribute("viewBox", "0 0 1 1");
    expect(overlay.querySelectorAll('[role="button"]')).toHaveLength(units.length);
    expect(available.querySelector("rect")).toHaveAttribute("fill", "#00EE00");
    expect(available.querySelector("text")).toHaveTextContent("U001");
    expect(available.querySelector("title")).toHaveTextContent("DCT Valley-U001");
    expect(nextAvailable.querySelector("polygon")).toHaveAttribute("points", "0.9,0.9 0.99,0.9 0.99,0.99 0.9,0.99");
    expect(nextAvailable.querySelector("polygon")).toHaveAttribute("fill", "#00EE00");
    expect(booked.querySelector("rect")).toHaveAttribute("fill", "#FF0000");
    expect(sold.querySelector("rect")).toHaveAttribute("fill", "#FF7F27");
    expect(onHold.querySelector("rect")).toHaveAttribute("fill", "#FFFF00");

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    available.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(overlay.querySelectorAll('[role="button"]')).toHaveLength(units.length);

    fireEvent.click(available);
    expect(available).toHaveAttribute("aria-pressed", "true");
    expect(frame).toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
    expect(available.querySelector("rect")).toHaveAttribute("fill", "#00EE00");
    expect(available.querySelector("rect")).toHaveAttribute("fill-opacity", "1");
    const selectedOutline = available.querySelector('rect[fill="none"]');
    expect(selectedOutline).toHaveAttribute("stroke", "#1d4ed8");
    expect(booked.querySelector("rect")).toHaveAttribute("fill", "#FF0000");
    expect(sold.querySelector("rect")).toHaveAttribute("fill", "#FF7F27");
    expect(onHold.querySelector("rect")).toHaveAttribute("fill", "#FFFF00");

    fireEvent.click(available);
    expect(available).toHaveAttribute("aria-pressed", "false");
    expect(available.querySelector('rect[fill="none"]')).not.toBeInTheDocument();
    expect(frame).toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
    expect(available.querySelector("rect")).toHaveAttribute("fill", "#00EE00");

    fireEvent.click(available);
    expect(available).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(nextAvailable);
    expect(available).toHaveAttribute("aria-pressed", "false");
    expect(nextAvailable).toHaveAttribute("aria-pressed", "true");
    expect(nextAvailable.querySelector("polygon")).toHaveAttribute("fill", "#00EE00");
    expect(nextAvailable.querySelector('polygon[fill="none"]')).toHaveAttribute("stroke", "#1d4ed8");
    expect(booked).toHaveAttribute("aria-pressed", "false");
    expect(sold).toHaveAttribute("aria-pressed", "false");
    expect(onHold).toHaveAttribute("aria-pressed", "false");
    expect(frame).toHaveStyle({ backgroundColor: "rgb(255, 255, 255)" });
  });
});
