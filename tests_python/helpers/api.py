from typing import Any

from playwright.async_api import APIRequestContext, Playwright


DEMO_PASSWORD = "CouncilDemo2026!"


async def create_authenticated_api(
    playwright: Playwright,
    base_url: str,
    username: str,
) -> APIRequestContext:
    api = await playwright.request.new_context(base_url=base_url)
    response = await api.post(
        "/api/auth/sign-in",
        data={"username": username, "password": DEMO_PASSWORD},
    )

    if not response.ok:
        await api.dispose()
        raise AssertionError(
            f"Authentication failed for {username} with status {response.status}."
        )

    return api


async def get_application_by_number(
    api: APIRequestContext,
    application_number: str,
) -> dict[str, Any]:
    registry_response = await api.get("/api/applications?page=1&pageSize=100")
    assert registry_response.ok, (
        f"Registry request failed with status {registry_response.status}."
    )
    registry = await registry_response.json()
    summary = next(
        (
            item
            for item in registry["items"]
            if item["applicationNumber"] == application_number
        ),
        None,
    )
    assert summary is not None, f"{application_number} must exist in the seed."

    details_response = await api.get(f"/api/applications/{summary['id']}")
    assert details_response.ok, (
        f"Application request failed with status {details_response.status}."
    )
    return await details_response.json()
