from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATABASE_URL = (
    "postgresql://works_approve_e2e:e2e_only_password@127.0.0.1:5433/"
    "works_approve_e2e?schema=public"
)
BASE_URL = "http://localhost:3100"
COMPOSE_COMMAND = [
    "docker",
    "compose",
    "-p",
    "works-approve-python-e2e",
    "-f",
    "compose.e2e.yaml",
]


def run(command: list[str], environment: dict[str, str]) -> None:
    print(f"> {shlex.join(command)}", flush=True)
    subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        env=environment,
        check=True,
    )


def wait_for_server(
    process: subprocess.Popen[bytes],
    timeout_seconds: int = 120,
) -> None:
    deadline = time.monotonic() + timeout_seconds
    sign_in_url = f"{BASE_URL}/sign-in"

    while time.monotonic() < deadline:
        return_code = process.poll()
        if return_code is not None:
            raise RuntimeError(
                f"Next.js stopped before becoming ready with exit code {return_code}."
            )

        try:
            with urllib.request.urlopen(sign_in_url, timeout=2) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(0.5)

    raise TimeoutError(f"Next.js did not become ready at {sign_in_url}.")


def stop_server(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def main() -> None:
    node = shutil.which("node")
    docker = shutil.which("docker")
    if node is None:
        raise RuntimeError("Node.js is required but was not found on PATH.")
    if docker is None:
        raise RuntimeError("Docker is required but was not found on PATH.")

    environment = os.environ.copy()
    environment.update(
        {
            "DATABASE_URL": DATABASE_URL,
            "E2E_DATABASE_URL": DATABASE_URL,
            "E2E_BASE_URL": BASE_URL,
            "NEXT_DIST_DIR": ".next-python-e2e",
            "PLAYWRIGHT_HTML_OPEN": "never",
        }
    )
    environment["PATH"] = os.pathsep.join(
        [str(PROJECT_ROOT / "node_modules" / ".bin"), environment["PATH"]]
    )

    compose_command = [docker, *COMPOSE_COMMAND[1:]]
    server: subprocess.Popen[bytes] | None = None
    database_started = False

    try:
        run([*compose_command, "up", "-d", "--wait"], environment)
        database_started = True
        run(
            [node, "node_modules/prisma/build/index.js", "migrate", "deploy"],
            environment,
        )
        run(
            [node, "node_modules/prisma/build/index.js", "db", "seed"],
            environment,
        )

        server_command = [
            node,
            "node_modules/next/dist/bin/next",
            "dev",
            "--webpack",
            "--port",
            "3100",
        ]
        print(f"> {shlex.join(server_command)}", flush=True)
        server = subprocess.Popen(
            server_command,
            cwd=PROJECT_ROOT,
            env=environment,
        )
        wait_for_server(server)
        run([sys.executable, "-m", "pytest", "-q"], environment)
    finally:
        stop_server(server)
        if database_started:
            run([*compose_command, "down", "--volumes"], environment)


if __name__ == "__main__":
    main()
