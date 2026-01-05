import { Effect } from "effect";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export const DEFAULT_LOCAL_API_URL = "http://localhost:1234/v1";
export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant inside a terminal. Keep your responses short and concise. Format your output as markdown.";

export type LmConfig = {
  model: string;
  api_url: string;
  api_key_var: string;
};

const defaultConfig: LmConfig = {
  model: "local-model",
  api_url: DEFAULT_LOCAL_API_URL,
  api_key_var: "sk-dummy",
};

export const getConfigPath = () => {
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, "lm");
  }
  return path.join(os.homedir(), ".config", "lm");
};

const readConfigFile = (filePath: string) =>
  Effect.tryPromise(() => fs.readFile(filePath, "utf8"));

const writeConfigFile = (filePath: string, config: LmConfig) =>
  Effect.tryPromise(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2));
  });

export const loadConfig = () =>
  Effect.gen(function* (_) {
    const configDir = getConfigPath();
    const configFile = path.join(configDir, "config.json");

    const contentResult = yield* _(
      readConfigFile(configFile).pipe(Effect.catchAll(() => Effect.succeed(null)))
    );

    if (!contentResult) {
      yield* _(writeConfigFile(configFile, defaultConfig));
      return defaultConfig;
    }

    try {
      const parsed = JSON.parse(contentResult) as Partial<LmConfig>;
      return {
        model: parsed.model ?? defaultConfig.model,
        api_url: parsed.api_url ?? defaultConfig.api_url,
        api_key_var: parsed.api_key_var ?? defaultConfig.api_key_var,
      } satisfies LmConfig;
    } catch (error) {
      yield* _(
        Effect.sync(() =>
          console.error(
            `Warning: Could not load config file: ${error}. Using defaults.`
          )
        )
      );
      yield* _(writeConfigFile(configFile, defaultConfig));
      return defaultConfig;
    }
  });
