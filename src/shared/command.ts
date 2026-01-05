import { Effect } from "effect";

export type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CommandInput = {
  stdin?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export const commandExists = (name: string) =>
  Effect.sync(() => Boolean(Bun.which(name)));

export const runCommand = (
  cmd: string,
  args: string[] = [],
  input: CommandInput = {}
) =>
  Effect.tryPromise(async () => {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    if (input.stdin !== undefined) {
      proc.stdin.write(input.stdin);
      proc.stdin.end();
    }

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return { stdout, stderr, exitCode } satisfies CommandResult;
  });

export const runCommandInherit = (
  cmd: string,
  args: string[] = [],
  input: CommandInput = {}
) =>
  Effect.tryPromise(async () => {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...input.env,
      },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    return await proc.exited;
  });
