import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const server = new McpServer({ name: "yummy-chat-test-stdio", version: "1.0.0" })

server.registerTool(
  "runtime-info",
  { description: "Returns configured process values", inputSchema: {} },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ cwd: process.cwd(), marker: process.env.MCP_TEST_MARKER }),
      },
    ],
  }),
)

await server.connect(new StdioServerTransport())
