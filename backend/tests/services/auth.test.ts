import { describe, it, expect, vi } from "vitest";
import { getBearerToken, getProviderToken, adminRouteGuard } from "../../src/services/auth.js";
import * as supabase from "../../src/services/supabase.js";

vi.mock("../../src/services/supabase.js", () => ({
  getSupabaseUser: vi.fn(),
}));

describe("getBearerToken", () => {
  it("extracts the token from the Authorization header", () => {
    const request = { headers: { authorization: "Bearer token-123" } } as any;
    expect(getBearerToken(request)).toBe("token-123");
  });

  it("returns undefined when the header is missing", () => {
    const request = { headers: {} } as any;
    expect(getBearerToken(request)).toBeUndefined();
  });

  it("returns undefined when the header is not a Bearer token", () => {
    const request = { headers: { authorization: "Basic abc" } } as any;
    expect(getBearerToken(request)).toBeUndefined();
  });
});

describe("getProviderToken", () => {
  it("reads the x-provider-token header", () => {
    const request = { headers: { "x-provider-token": "gh-token" } } as any;
    expect(getProviderToken(request)).toBe("gh-token");
  });

  it("returns undefined when the header is missing", () => {
    const request = { headers: {} } as any;
    expect(getProviderToken(request)).toBeUndefined();
  });
});

describe("adminRouteGuard", () => {
  it("returns the user when they are an admin", async () => {
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue({
      id: "admin-1",
      email: "nwaughac@gmail.com",
    } as any);

    const user = await adminRouteGuard("admin-token");
    expect(user).toEqual({
      id: "admin-1",
      email: "nwaughac@gmail.com",
    });
  });

  it("returns null for non-admin users", async () => {
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue({
      id: "user-1",
      email: "not-an-admin@example.com",
    } as any);

    const user = await adminRouteGuard("user-token");
    expect(user).toBeNull();
  });

  it("returns null when there is no token", async () => {
    vi.mocked(supabase.getSupabaseUser).mockResolvedValue(null);
    const user = await adminRouteGuard(undefined);
    expect(user).toBeNull();
  });
});
