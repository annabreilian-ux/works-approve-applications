import os

import pytest
from playwright.sync_api import expect


@pytest.fixture(scope="session", autouse=True)
def configure_expect_timeout() -> None:
    expect.set_options(timeout=10_000)


@pytest.fixture(scope="session")
def app_base_url() -> str:
    return os.getenv("E2E_BASE_URL", "http://localhost:3100")
