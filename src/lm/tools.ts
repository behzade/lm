import { Effect } from "effect";
import * as DuckDuckScrape from "duck-duck-scrape";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
};

export type ToolHandler = (args: Record<string, unknown>) => Effect.Effect<string>;

export const performWebSearch = (query: string, numResults = 10) =>
  Effect.tryPromise(async () => {
    try {
      const response = await (DuckDuckScrape as any).search(query, {
        safeSearch: "moderate",
        maxResults: numResults,
      });
      const items =
        response?.results ?? response?.data ?? response?.items ?? response ?? [];

      if (!items || items.length === 0) {
        return "No results found for the query.";
      }

      const formatted = items.map((item: any, index: number) => {
        const title = item.title ?? item.heading ?? `Source ${index + 1}`;
        const body = item.body ?? item.description ?? item.snippet ?? "";
        const href = item.href ?? item.url ?? item.link ?? "";
        return `**Source ${index + 1}: ${title}**\nSnippet: ${body}\nURL: ${href}`;
      });

      return formatted.join("\n\n---\n\n");
    } catch (error) {
      return `An error occurred during web search: ${error}`;
    }
  });

export const AVAILABLE_TOOLS: Record<
  string,
  { definition: ToolDefinition; handler: ToolHandler }
> = {
  web_search: {
    definition: {
      type: "function",
      function: {
        name: "web_search",
        description:
          "Performs a web search to get up-to-date information or context.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query.",
            },
          },
          required: ["query"],
        },
      },
    },
    handler: (args) => performWebSearch(String(args.query ?? "")),
  },
};
