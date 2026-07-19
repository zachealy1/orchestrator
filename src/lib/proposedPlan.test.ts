import { describe, expect, it } from "vitest";
import { parseProposedPlanEnvelope } from "./proposedPlan";

describe("parseProposedPlanEnvelope", () => {
  it("extracts a complete proposed plan without changing its Markdown", () => {
    const markdown = [
      "# Update `hello-world.txt`",
      "",
      "## Key Changes",
      "- Append one line.",
      "",
      "```text",
      "Hello hello hello",
      "```",
    ].join("\n");

    expect(
      parseProposedPlanEnvelope(
        `<proposed_plan>\n${markdown}\n</proposed_plan>`,
      ),
    ).toEqual({ markdown });
  });

  it("accepts surrounding whitespace and CRLF delimiters", () => {
    expect(
      parseProposedPlanEnvelope(
        "  \r\n<proposed_plan>  \r\n# Plan\r\n\r\nBody\r\n</proposed_plan>\r\n  ",
      ),
    ).toEqual({ markdown: "# Plan\r\n\r\nBody" });
  });

  it.each([
    "<proposed_plan>Inline</proposed_plan>",
    "Before\n<proposed_plan>\n# Plan\n</proposed_plan>",
    "<proposed_plan>\n# Plan\n</proposed_plan>\nAfter",
    "```html\n<proposed_plan>\n# Quoted\n</proposed_plan>\n```",
    "<proposed_plan>\n   \n</proposed_plan>",
    "<proposed_plan>\n# Missing close",
  ])("does not promote malformed or mixed content: %s", (value) => {
    expect(parseProposedPlanEnvelope(value)).toBeNull();
  });
});
