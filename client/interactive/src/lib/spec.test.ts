import { describe, expect, test } from "bun:test";
import { buildCapabilitiesDocument, buildSpecDocument, findCommandSpec } from "./spec";

describe("spec", () => {
  test("finds command specs by spaced path", () => {
    expect(findCommandSpec("summaries get")?.path).toBe("summaries get");
  });

  test("finds command specs by slash path", () => {
    expect(findCommandSpec("summaries/get")?.path).toBe("summaries get");
  });

  test("builds discoverability documents", () => {
    const spec = buildSpecDocument();
    const capabilities = buildCapabilitiesDocument();

    expect(spec.contract_version).toBe("2026-03-16");
    expect(Array.isArray(spec.commands)).toBe(true);
    expect(capabilities.top_level_nouns).toContain("summaries");
  });
});
