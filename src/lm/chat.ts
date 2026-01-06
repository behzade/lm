import { Effect } from "effect";
import OpenAI from "openai";
import { AVAILABLE_TOOLS, ToolDefinition } from "./tools";

export type ChatOptions = {
  apiUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  maxToolTurns: number;
  temperature: number;
  topP: number;
  interactive: boolean;
};

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

class StreamingToolCallBuilder {
  private toolCalls: ToolCall[] = [];

  accumulate(delta: any) {
    const calls = delta?.tool_calls ?? delta?.toolCalls;
    if (!calls) {
      return;
    }

    for (const call of calls) {
      const index = call.index ?? 0;
      if (!this.toolCalls[index]) {
        this.toolCalls[index] = {
          id: "",
          type: "function",
          function: {
            name: "",
            arguments: "",
          },
        };
      }

      const entry = this.toolCalls[index];
      entry.id += call.id ?? "";
      if (call.function) {
        entry.function.name += call.function.name ?? "";
        entry.function.arguments += call.function.arguments ?? "";
      }
    }
  }

  getToolCalls() {
    return this.toolCalls.filter((call) => call.function.name);
  }
}

const fixRtlOutput = (text: string) => text;

const toolDefinitions: ToolDefinition[] = Object.values(AVAILABLE_TOOLS).map(
  (tool) => tool.definition
);

const streamChat = (
  client: OpenAI,
  apiArgs: Record<string, unknown>,
  interactive: boolean
) =>
  Effect.tryPromise(async () => {
    const stream = await client.chat.completions.create(apiArgs as any);
    let fullContent = "";
    let totalInTokens = 0;
    let totalOutTokens = 0;
    const toolBuilder = new StreamingToolCallBuilder();

    for await (const chunk of stream) {
      if (chunk.usage) {
        totalInTokens += chunk.usage.prompt_tokens ?? 0;
        totalOutTokens += chunk.usage.completion_tokens ?? 0;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) {
        continue;
      }

      const content = delta.content ?? "";
      if (content) {
        fullContent += content;
        if (interactive) {
          process.stdout.write(fixRtlOutput(content));
        }
      }

      toolBuilder.accumulate(delta);
    }

    return {
      content: fullContent,
      toolCalls: toolBuilder.getToolCalls(),
      inTokens: totalInTokens,
      outTokens: totalOutTokens,
    };
  });

export const runChatLoop = (options: ChatOptions) =>
  Effect.gen(function* () {
    const client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.apiUrl,
    });

    const messages: any[] = [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userMessage },
    ];

    let totalInTokens = 0;
    let totalOutTokens = 0;

    for (let turn = 0; turn < options.maxToolTurns; turn += 1) {
      const apiArgs: any = {
        model: options.model,
        messages,
        temperature: options.temperature,
        top_p: options.topP,
        stream: true,
      };

      if (toolDefinitions.length > 0) {
        apiArgs.tools = toolDefinitions;
        apiArgs.tool_choice = turn === options.maxToolTurns - 1 ? "none" : "auto";
      }

      const streamResult = yield* streamChat(
        client,
        apiArgs,
        options.interactive
      );
      const assistantToolCalls = streamResult.toolCalls;
      const fullContent = streamResult.content;
      totalInTokens += streamResult.inTokens;
      totalOutTokens += streamResult.outTokens;
      messages.push({
        role: "assistant",
        content: fullContent || null,
        tool_calls: assistantToolCalls.length ? assistantToolCalls : undefined,
      });

      if (assistantToolCalls.length === 0) {
        if (!options.interactive) {
          process.stdout.write(fixRtlOutput(fullContent));
        }
        break;
      }

      yield* Effect.sync(() => console.error("Tool call(s) requested..."));

      for (const toolCall of assistantToolCalls) {
        const functionName = toolCall.function.name;
        let toolOutput = `Error: Unknown tool '${functionName}'.`;

        try {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          const toolInfo = AVAILABLE_TOOLS[functionName];

          if (!toolInfo) {
            throw new Error(`Tool '${functionName}' not found.`);
          }

          yield* Effect.sync(() =>
            console.error(
              `Performing: ${functionName} with args: ${JSON.stringify(args)}`
            )
          );

          toolOutput = yield* toolInfo.handler(args);
        } catch (error) {
          toolOutput = `Error during tool execution: ${error}`;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
        });
      }
    }

    if (options.interactive && (totalInTokens + totalOutTokens) > 0) {
      yield* Effect.sync(() =>
        console.error(`\n->:${totalInTokens} <-:${totalOutTokens}`)
      );
    }
  });
