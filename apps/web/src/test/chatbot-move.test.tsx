import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  aiApi: { chat: vi.fn() },
}));

import { Chatbot } from "@/components/ai/chatbot";

const stored = new Map<string, string>();

beforeEach(() => {
  stored.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
      clear: () => stored.clear(),
    },
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1200 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
});

describe("Chatbot move", () => {
  it("drags the assistant and keeps a click from opening it", () => {
    render(<Chatbot />);
    const launcher = screen.getByRole("button", { name: "Open chat" });

    fireEvent.pointerDown(launcher, { button: 0, pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(launcher, { pointerId: 1, clientX: 120, clientY: 160 });
    fireEvent.pointerUp(launcher, { pointerId: 1, clientX: 120, clientY: 160 });

    const widget = launcher.parentElement as HTMLElement;
    expect(widget.style.right).toBe("96px");
    expect(widget.style.bottom).toBe("56px");
    expect(screen.queryByText("DCT AI Assistant")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("dct-crm-chatbot-position") || "{}")).toEqual({
      right: 96,
      bottom: 56,
    });
  });

  it("opens the assistant when the icon is clicked without a drag", () => {
    render(<Chatbot />);
    fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
    expect(screen.getByText("DCT AI Assistant")).toBeInTheDocument();
  });
});
