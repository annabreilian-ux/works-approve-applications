import re

from playwright.sync_api import Page, expect


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
