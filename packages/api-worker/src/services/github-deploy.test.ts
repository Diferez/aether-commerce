import { afterEach, describe, expect, it, vi } from "vitest";
import { getLatestCommitSha, getLatestPublishedPackageVersion, requireCompleteCredentials, triggerDeployWorkflow } from "./github-deploy";

const credentials = { githubOwner: "acme", githubRepo: "store", githubWorkflowFile: "deploy.yml", githubPat: "ghp_test" };

describe("requireCompleteCredentials", () => {
  it("returns null when any field is missing", () => {
    expect(requireCompleteCredentials({})).toBeNull();
    expect(requireCompleteCredentials({ githubOwner: "acme" })).toBeNull();
    expect(requireCompleteCredentials({ githubOwner: "acme", githubRepo: "store", githubWorkflowFile: "deploy.yml" })).toBeNull();
  });

  it("returns the narrowed credentials when every field is present", () => {
    expect(requireCompleteCredentials(credentials)).toEqual(credentials);
  });
});

describe("getLatestCommitSha", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the commit SHA on success", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      expect(url).toBe("https://api.github.com/repos/acme/store/commits/main");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer ghp_test");
      return Promise.resolve(new Response(JSON.stringify({ sha: "abc1234" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getLatestCommitSha(credentials)).toBe("abc1234");
  });

  it("returns null on a failed response rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 404 }))));
    expect(await getLatestCommitSha(credentials)).toBeNull();
  });

  it("returns null when fetch itself throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down")))
    );
    expect(await getLatestCommitSha(credentials)).toBeNull();
  });
});

describe("getLatestPublishedPackageVersion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first version's name on success", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("https://api.github.com/orgs/acme/packages/npm/api-worker/versions?per_page=1");
      return Promise.resolve(new Response(JSON.stringify([{ name: "0.2.0" }]), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getLatestPublishedPackageVersion(credentials)).toBe("0.2.0");
  });

  it("returns null when the registry has no versions yet", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))));
    expect(await getLatestPublishedPackageVersion(credentials)).toBeNull();
  });

  it("returns null on any failure instead of throwing - this is a secondary, informational lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 403 }))));
    expect(await getLatestPublishedPackageVersion(credentials)).toBeNull();
  });
});

describe("triggerDeployWorkflow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a workflow_dispatch for the main branch", async () => {
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      expect(url).toBe("https://api.github.com/repos/acme/store/actions/workflows/deploy.yml/dispatches");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({ ref: "main" });
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(triggerDeployWorkflow(credentials)).resolves.toBeUndefined();
  });

  it("throws (does not swallow) when GitHub rejects the dispatch - unlike the read-only lookups above, a failed trigger must surface to the admin", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("bad credentials", { status: 401 }))));
    await expect(triggerDeployWorkflow(credentials)).rejects.toThrow("GitHub workflow_dispatch failed (401)");
  });
});
