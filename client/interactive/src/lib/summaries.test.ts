import { describe, expect, test } from "bun:test";
import { parseSummaryLines } from "./summaries";

describe("summaries", () => {
  test("parses jsonl and attaches deterministic ids", () => {
    const records = parseSummaryLines(
      [
        JSON.stringify({
          timestamp: "2026-03-15 06:55",
          label: "Development Log",
          signals: "signals",
          collaborators: "collaborators",
          capabilities: "capabilities",
          state: "state",
          significance: "significance",
          questions: "questions",
        }),
      ].join("\n"),
      "3h",
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe("3h-2026-03-15T06:55");
    expect(records[0]?.window).toBe("3h");
  });
});
