import { expect, request, type APIRequestContext } from "@playwright/test";

export interface ApiApplication {
  id: string;
  applicationNumber: string;
  status: "new" | "under-review" | "done";
  currentReviewer: { displayName: string } | null;
  activeSnapshot: {
    id: string;
    description: string;
  } | null;
  decision: {
    id: string;
    comment: string;
    snapshotId: string;
  } | null;
}

interface RegistryResponse {
  items: Array<{
    id: string;
    applicationNumber: string;
  }>;
}

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
export const demoPassword = "CouncilDemo2026!";

export async function createAuthenticatedApi(
  username: string,
): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL });
  const response = await api.post("/api/auth/sign-in", {
    data: { username, password: demoPassword },
  });
  expect(response.ok()).toBeTruthy();
  return api;
}

export async function getApplicationByNumber(
  api: APIRequestContext,
  applicationNumber: string,
): Promise<ApiApplication> {
  const registryResponse = await api.get(
    "/api/applications?page=1&pageSize=100",
  );
  expect(registryResponse.ok()).toBeTruthy();
  const registry = (await registryResponse.json()) as RegistryResponse;
  const summary = registry.items.find(
    (item) => item.applicationNumber === applicationNumber,
  );
  expect(summary, `${applicationNumber} must exist in the seed`).toBeTruthy();

  const detailsResponse = await api.get(`/api/applications/${summary!.id}`);
  expect(detailsResponse.ok()).toBeTruthy();
  return (await detailsResponse.json()) as ApiApplication;
}
