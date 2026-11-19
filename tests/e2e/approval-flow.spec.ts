import { expect, test } from "@playwright/test";

import {
  createAuthenticatedApi,
  getApplicationByNumber,
} from "./helpers/api";
import {
  closeDatabase,
  expireSession,
  getWorkflowEvidence,
  replaceSourceDescription,
} from "./helpers/database";
import { openApplication, signIn } from "./helpers/ui";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await closeDatabase();
});

test("sign-in validates required and incorrect credentials", async ({ page }) => {
  await page.goto("/sign-in");
    await expect(
    page.getByText(
      'Read-only user: password: "read.worker" as the login and "Reader7777----" as the password to sign in.',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Executer: "anna.worker" as the login and "Anna7777----" as the password.',
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();
  await page.getByLabel("Username").fill("anna.worker");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeDisabled();

  const passwordInput = page.locator("#password");
  const showPassword = page.getByRole("checkbox", {
    name: "Show password",
    exact: true,
  });
  await expect(passwordInput).toHaveAttribute("type", "password");
  await passwordInput.fill("incorrect-password");
  await showPassword.check();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await expect(passwordInput).toHaveValue("incorrect-password");
  await showPassword.uncheck();
  await expect(passwordInput).toHaveAttribute("type", "password");
  await expect(passwordInput).toHaveValue("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The username or password is incorrect.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
});

test("authorized worker completes the persisted approval journey", async ({
  page,
}) => {
  const applicationNumber = "APP-005";
  await signIn(page, "anna.worker");
  await expect(page.getByText("100 applications")).toBeVisible();
  await openApplication(page, applicationNumber);

  const startButton = page.getByRole("button", { name: "Start review" });
  let markRequestStarted!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  const requestCanContinue = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/start-review", async (route) => {
    markRequestStarted();
    await requestCanContinue;
    await route.continue();
  });
  const startReviewClick = startButton.click();
  await requestStarted;
  try {
    await expect(
      page.getByRole("button", { name: "Starting review" }),
    ).toBeDisabled();
  } finally {
    releaseRequest();
    await startReviewClick;
  }
  await expect(
    page.getByText("Under review", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.unroute("**/start-review");

  await expect(startButton).toHaveCount(0);
  await expect(
    page.getByText("Anna Worker", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Review snapshot", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Snapshot retrieved/).filter({ visible: true }),
  ).toBeVisible();

  const approveButton = page
    .getByRole("main")
    .getByRole("button", { name: "Approve" });
  const assertCancellation = async (close: "cancel" | "escape" | "close") => {
    await approveButton.click();
    const dialog = page.getByRole("dialog", { name: "Approve application" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Decision comment").fill("unsaved decision");

    if (close === "cancel") {
      await dialog.getByRole("button", { name: "Cancel" }).click();
    } else if (close === "escape") {
      await page.keyboard.press("Escape");
    } else {
      await dialog.getByRole("button", { name: "Close" }).click();
    }

    await expect(dialog).toBeHidden();
    await expect(approveButton).toBeFocused();
    const evidence = await getWorkflowEvidence(applicationNumber);
    expect(evidence.decisions).toBe(0);
    expect(evidence.activeAssignments).toBe(1);

    await approveButton.click();
    await expect(
      page.getByRole("dialog").getByLabel("Decision comment"),
    ).toHaveValue("");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  };

  await assertCancellation("cancel");
  await assertCancellation("escape");
  await assertCancellation("close");

  await approveButton.click();
  const dialog = page.getByRole("dialog", { name: "Approve application" });
  const decisionComment = dialog.getByLabel("Decision comment");
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Enter a decision comment.")).toBeVisible();
  await decisionComment.fill("   ");
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Enter a decision comment.")).toBeVisible();

  const applicationId = page.url().split("/").at(-1)!;
  const overLimitResponse = await page.request.post(
    `/api/applications/${applicationId}/approve`,
    {
      data: {
        decisionComment: "x".repeat(2_001),
        idempotencyKey: "e2e-over-limit-comment",
      },
    },
  );
  expect(overLimitResponse.status()).toBe(400);
  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "UNDER_REVIEW",
    activeAssignments: 1,
    decisions: 0,
  });

  const enteredComment = "  Approved after review.\nРаботы согласованы.  ";
  const storedComment = enteredComment.trim();
  await decisionComment.fill(enteredComment);
  await dialog.getByRole("button", { name: "Approve" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Done", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  const approvedBadges = page
    .getByText("Approved", { exact: true })
    .filter({ visible: true });
  await expect(approvedBadges).toHaveCount(2);
  await expect(approvedBadges.first()).toBeVisible();
  await expect(
    page.getByText(storedComment, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Anna Worker", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Approve" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByText(storedComment, { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, "olivia.viewer");
  await openApplication(page, applicationNumber);
  await expect(
    page.getByText(storedComment, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Approve" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);

  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "DONE",
    result: "APPROVED",
    currentReviewer: null,
    snapshots: 1,
    activeAssignments: 0,
    endedApprovals: 1,
    decisions: 1,
    startEvents: 1,
    approveEvents: 1,
    idempotencyRecords: 1,
  });
});

test("permissions are enforced by the interface and backend", async ({ page }) => {
  const applicationNumber = "APP-006";
  await signIn(page, "olivia.viewer");
  await openApplication(page, applicationNumber);
  await expect(page.getByText("You have read-only access.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);

  const viewerApi = await createAuthenticatedApi("olivia.viewer");
  const newApplication = await getApplicationByNumber(viewerApi, applicationNumber);
  const forbiddenStart = await viewerApi.post(
    `/api/applications/${newApplication.id}/start-review`,
  );
  expect(forbiddenStart.status()).toBe(403);
  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "NEW",
    snapshots: 0,
    activeAssignments: 0,
    decisions: 0,
  });
  await viewerApi.dispose();

  const michaelApi = await createAuthenticatedApi("michael.worker");
  const annaOwned = await getApplicationByNumber(michaelApi, "APP-002");
  const forbiddenApproval = await michaelApi.post(
    `/api/applications/${annaOwned.id}/approve`,
    {
      data: {
        decisionComment: "A non-owner must not approve.",
        idempotencyKey: "e2e-non-owner-approval",
      },
    },
  );
  expect(forbiddenApproval.status()).toBe(409);
  expect(await getWorkflowEvidence("APP-002")).toMatchObject({
    status: "UNDER_REVIEW",
    currentReviewer: "anna.worker",
    activeAssignments: 1,
    decisions: 0,
  });

  const completed = await getApplicationByNumber(michaelApi, "APP-004");
  const completedMutation = await michaelApi.post(
    `/api/applications/${completed.id}/start-review`,
  );
  expect(completedMutation.status()).toBe(409);
  expect(await getWorkflowEvidence("APP-004")).toMatchObject({
    status: "DONE",
    result: "APPROVED",
    decisions: 1,
  });
  await michaelApi.dispose();
});

test("session expiry preserves ownership and restores application details", async ({
  context,
  page,
}) => {
  const applicationNumber = "APP-007";
  await signIn(page, "anna.worker");
  await openApplication(page, applicationNumber);
  await page.getByRole("button", { name: "Start review" }).click();
  await expect(page.getByText("You own this review")).toBeVisible();

  const cookies = await context.cookies();
  const sessionCookie = cookies.find(
    (cookie) => cookie.name === "works_approve_session",
  );
  expect(sessionCookie).toBeTruthy();
  await expireSession(sessionCookie!.value);

  await page.reload();
  await expect(page).toHaveURL(/\/sign-in\?reason=session-expired/);
  await expect(page.getByText("Your session expires, sign in again.")).toBeVisible();
  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "UNDER_REVIEW",
    currentReviewer: "anna.worker",
    activeAssignments: 1,
  });

  await page.getByLabel("Username").fill("anna.worker");
  await page.locator("#password").fill("CouncilDemo2026!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: applicationNumber }),
  ).toBeVisible();
  await expect(page.getByText("You own this review")).toBeVisible();
});

test("concurrent Start review requests create one owner", async () => {
  const applicationNumber = "APP-008";
  const annaApi = await createAuthenticatedApi("anna.worker");
  const michaelApi = await createAuthenticatedApi("michael.worker");
  const application = await getApplicationByNumber(annaApi, applicationNumber);

  const responses = await Promise.all([
    annaApi.post(`/api/applications/${application.id}/start-review`),
    michaelApi.post(`/api/applications/${application.id}/start-review`),
  ]);
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "UNDER_REVIEW",
    snapshots: 1,
    activeAssignments: 1,
    decisions: 0,
    startEvents: 1,
  });

  await annaApi.dispose();
  await michaelApi.dispose();
});

test("approval replay is idempotent", async () => {
  const applicationNumber = "APP-009";
  const api = await createAuthenticatedApi("anna.worker");
  const application = await getApplicationByNumber(api, applicationNumber);
  expect(
    (await api.post(`/api/applications/${application.id}/start-review`)).status(),
  ).toBe(200);

  const approvalData = {
    decisionComment: "Idempotent approval evidence.",
    idempotencyKey: "e2e-idempotent-approval",
  };
  const first = await api.post(`/api/applications/${application.id}/approve`, {
    data: approvalData,
  });
  const replay = await api.post(`/api/applications/${application.id}/approve`, {
    data: approvalData,
  });
  expect(first.status()).toBe(200);
  expect(replay.status()).toBe(200);
  expect((await first.json()).decision.id).toBe((await replay.json()).decision.id);
  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "DONE",
    result: "APPROVED",
    snapshots: 1,
    activeAssignments: 0,
    endedApprovals: 1,
    decisions: 1,
    startEvents: 1,
    approveEvents: 1,
    idempotencyRecords: 1,
  });
  await api.dispose();
});

test("the active review snapshot remains immutable after source changes", async () => {
  const applicationNumber = "APP-010";
  const api = await createAuthenticatedApi("anna.worker");
  const application = await getApplicationByNumber(api, applicationNumber);
  expect(
    (await api.post(`/api/applications/${application.id}/start-review`)).status(),
  ).toBe(200);
  const started = await getApplicationByNumber(api, applicationNumber);
  const originalDescription = started.activeSnapshot!.description;

  await replaceSourceDescription(
    applicationNumber,
    "Source changed after review ownership was granted.",
  );
  const refreshed = await getApplicationByNumber(api, applicationNumber);
  expect(refreshed.activeSnapshot!.description).toBe(originalDescription);
  expect(await getWorkflowEvidence(applicationNumber)).toMatchObject({
    status: "UNDER_REVIEW",
    snapshots: 1,
    activeAssignments: 1,
  });
  await api.dispose();
});
