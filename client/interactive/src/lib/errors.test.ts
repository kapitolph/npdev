import { describe, expect, mock, test } from "bun:test";
import { NpdevError, renderError } from "./errors";

describe("errors", () => {
  test("renderError preserves deterministic exit code", () => {
    const error = new NpdevError("not_found", "missing", 4, { id: "abc" });
    const consoleMock = mock(() => {});
    const original = console.error;
    console.error = consoleMock;
    const rendered = renderError(error, true);
    console.error = original;

    expect(rendered.exitCode).toBe(4);
    expect(consoleMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleMock.mock.calls[0]?.[0] as string) as {
      ok: boolean;
      error: { code: string; exit_code: number };
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("not_found");
    expect(payload.error.exit_code).toBe(4);
  });
});
