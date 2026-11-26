import asyncio
import re
from concurrent.futures import ThreadPoolExecutor

from playwright.async_api import async_playwright
from playwright.sync_api import Page, expect

from tests_python.helpers.api import (
    create_authenticated_api,
    get_application_by_number,
)
from tests_python.helpers.database import get_workflow_evidence


def test_sign_in_validates_required_and_incorrect_credentials(
    page: Page,
    app_base_url: str,
) -> None:
    page.goto(f"{app_base_url}/sign-in")

    expect(
        page.get_by_text(
            'Read-only user: password: "reader.worker" as the login and '
            '"Reader7777----" as the password to sign in.',
            exact=False,
        )
    ).to_be_visible()
    expect(
        page.get_by_text(
            'Executer: "anna.worker" as the login and "Anna7777----" '
            "as the password.",
            exact=False,
        )
    ).to_be_visible()

    sign_in_button = page.get_by_role("button", name="Sign in")
    expect(sign_in_button).to_be_disabled()

    page.get_by_label("Username").fill("anna.worker")
    expect(sign_in_button).to_be_disabled()

    password_input = page.locator("#password")
    show_password = page.get_by_role(
        "checkbox",
        name="Show password",
        exact=True,
    )

    expect(password_input).to_have_attribute("type", "password")
    password_input.fill("incorrect-password")

    show_password.check()
    expect(password_input).to_have_attribute("type", "text")
    expect(password_input).to_have_value("incorrect-password")

    show_password.uncheck()
    expect(password_input).to_have_attribute("type", "password")
    expect(password_input).to_have_value("incorrect-password")

    sign_in_button.click()

    expect(
        page.get_by_text("The username or password is incorrect.")
    ).to_be_visible()
    expect(page).to_have_url(re.compile(r"/sign-in"))


async def concurrent_start_review_requests_create_one_owner(
    app_base_url: str,
) -> None:
    application_number = "APP-008"

    async with async_playwright() as playwright:
        anna_api = await create_authenticated_api(
            playwright,
            app_base_url,
            "anna.worker",
        )
        michael_api = await create_authenticated_api(
            playwright,
            app_base_url,
            "michael.worker",
        )

        try:
            application = await get_application_by_number(
                anna_api,
                application_number,
            )
            responses = await asyncio.gather(
                anna_api.post(
                    f"/api/applications/{application['id']}/start-review"
                ),
                michael_api.post(
                    f"/api/applications/{application['id']}/start-review"
                ),
            )
        finally:
            await anna_api.dispose()
            await michael_api.dispose()

    assert sorted(response.status for response in responses) == [200, 409]
    assert get_workflow_evidence(application_number) == {
        "status": "UNDER_REVIEW",
        "snapshots": 1,
        "active_assignments": 1,
        "decisions": 0,
        "start_events": 1,
    }


def test_concurrent_start_review_requests_create_one_owner(
    app_base_url: str,
) -> None:
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            asyncio.run,
            concurrent_start_review_requests_create_one_owner(app_base_url),
        )
        future.result()
