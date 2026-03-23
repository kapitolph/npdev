import { describe, expect, test } from "bun:test";
import { buildCapabilitiesDocument, buildSpecDocument, findCommandSpec } from "./spec";

describe("spec", () => {
  test("finds ccp command specs", () => {
    expect(findCommandSpec("ccp")?.path).toBe("ccp");
    expect(findCommandSpec("ccp list")?.path).toBe("ccp list");
    expect(findCommandSpec("ccp use")?.path).toBe("ccp use");
    expect(findCommandSpec("ccp next")?.path).toBe("ccp next");
    expect(findCommandSpec("ccp save")?.path).toBe("ccp save");
  });

  test("finds command specs by spaced path", () => {
    expect(findCommandSpec("summaries get")?.path).toBe("summaries get");
  });

  test("finds command specs by slash path", () => {
    expect(findCommandSpec("summaries/get")?.path).toBe("summaries get");
  });

  test("builds discoverability documents", () => {
    const spec = buildSpecDocument();
    const capabilities = buildCapabilitiesDocument();

    expect(spec.contract_version).toBe("2026-03-17");
    expect(Array.isArray(spec.commands)).toBe(true);
    expect(capabilities.top_level_nouns).toContain("summaries");
  });
});
