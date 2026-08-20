import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrchestratorBetaBrand } from "./OrchestratorBetaBrand";

describe("OrchestratorBetaBrand", () => {
  it("renders the product identity with an appended beta tag", () => {
    render(<OrchestratorBetaBrand />);

    const brand = screen.getByLabelText("Orchestrator beta");
    expect(brand).toHaveTextContent("OrchestratorBETA");
    expect(brand.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("orchestrator-mark"),
    );
  });
});
