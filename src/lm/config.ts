import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";

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

const getHomeDir = Effect.sync(() => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return home || ".";
});

export const getConfigPath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const homeDir = yield* getHomeDir;
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, "lm");
  }
  return path.join(homeDir, ".config", "lm");
});

const readConfigFile = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath);
  });

const writeConfigFile = (filePath: string, config: LmConfig) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
    yield* fs.writeFileString(filePath, JSON.stringify(config, null, 2));
  });

export const loadConfig = () =>
  Effect.gen(function* () {
    const configDir = yield* getConfigPath;
    const path = yield* Path.Path;
    const configFile = path.join(configDir, "config.json");

    const contentResult = yield* readConfigFile(configFile).pipe(
      Effect.catchAll(() => Effect.succeed(null))
    );

    if (!contentResult) {
      yield* writeConfigFile(configFile, defaultConfig);
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
      yield* Effect.sync(() =>
        console.error(
          `Warning: Could not load config file: ${error}. Using defaults.`
        )
      );
      yield* writeConfigFile(configFile, defaultConfig);
      return defaultConfig;
    }
  });
