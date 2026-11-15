import { spawn } from "node:child_process";

const databaseUrl =
  "postgresql://works_approve_e2e:e2e_only_password@127.0.0.1:5433/works_approve_e2e?schema=public";
const composeArguments = [
  "compose",
  "-p",
  "works-approve-e2e",
  "-f",
  "compose.e2e.yaml",
];

function run(
  command: string,
  arguments_: string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      env: environment,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} stopped by ${signal}.`
            : `${command} exited with code ${code ?? "unknown"}.`,
        ),
      );
    });
  });
}

const e2eEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  E2E_DATABASE_URL: databaseUrl,
  E2E_BASE_URL: "http://localhost:3100",
  NEXT_DIST_DIR: ".next-e2e",
  PLAYWRIGHT_HTML_OPEN: "never",
};

async function main(): Promise<void> {
  let databaseStarted = false;

  try {
    await run("docker", [...composeArguments, "up", "-d", "--wait"]);
    databaseStarted = true;
    await run(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      e2eEnvironment,
    );
    await run(
      process.execPath,
      ["node_modules/prisma/build/index.js", "db", "seed"],
      e2eEnvironment,
    );
    await run(
      process.execPath,
      ["node_modules/@playwright/test/cli.js", "test"],
      e2eEnvironment,
    );
  } finally {
    if (databaseStarted) {
      await run("docker", [...composeArguments, "down", "--volumes"]);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
