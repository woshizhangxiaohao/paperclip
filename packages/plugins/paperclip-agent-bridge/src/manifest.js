const manifest = {
  id: "company.agent-bridge",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Agent Bridge",
  description: "Lets one Paperclip agent contact another agent through resumable agent sessions.",
  author: "Zhang Xiaohao Company",
  categories: ["automation"],
  capabilities: [
    "agents.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "agent.tools.register"
  ],
  entrypoints: {
    worker: "./src/worker.js"
  },
  tools: [
    {
      name: "contact-agent",
      displayName: "Contact Agent",
      description: "Contact another Paperclip agent, send a prompt, and return the agent's reply.",
      parametersSchema: {
        type: "object",
        properties: {
          targetAgentName: {
            type: "string",
            description: "Preferred human-readable target agent name, such as 李百川."
          },
          targetAgentId: {
            type: "string",
            description: "Exact target agent UUID if known."
          },
          prompt: {
            type: "string",
            description: "What you want to say to the target agent."
          },
          forceFreshSession: {
            type: "boolean",
            description: "Whether to open a fresh session instead of reusing the latest existing one."
          }
        },
        required: ["prompt"]
      }
    }
  ]
};

export default manifest;
