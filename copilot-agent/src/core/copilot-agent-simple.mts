import { CopilotClient, approveAll, CustomAgentConfig, defineTool, SessionConfig, CopilotSession, SessionEvent } from "@github/copilot-sdk";
import { z } from "zod";

// Define the WorkflowAgent type extending customAgentConfig
export interface WorkflowAgent extends CustomAgentConfig {
    model: string;
    structuredOutput?: z.ZodSchema;
    handoffs?: WorkflowAgent[];
    customTools?: ReturnType<typeof defineTool>[];
};

export interface handoffInstruction {
    agentName: string;
    rationale: string;
}

// Create and start client
const client = new CopilotClient({
    githubToken: process.env.COPILOT_GITHUB_TOKEN,
});
await client.start();

// Create a session
const session = await client.createSession({
    model: "gpt-5",
    onPermissionRequest: approveAll,
    customAgents: [
        {
            name: "agent-1",
            displayName: "Agent 1",
            description: "This is agent 1",
            prompt: "You are agent 1. Answer questions and perform tasks.",
        },
    ],
});

// Wait for response using typed event handlers
    // const done = new Promise<void>((resolve) => {
    //     session.on("assistant.message", (event) => {
    //         console.log(event.data.content);
    //     });
    //     session.on("session.idle", () => {
    //         resolve();
    //     });
    // });

// Send a message and wait for completion
const response = await session.sendAndWait({ prompt: "What is 2+2?" });
console.log("Response:", response?.data.content);
// await done;

// Clean up
await session.destroy();
await client.stop();

// export const runWorkflow = async (config: { prompt: string; agents: WorkflowAgent[]; streamOutput?: boolean; githubToken?: string }) => {
//     const { prompt, agents, streamOutput = false, githubToken } = config;

//     const HAS_TASK = prompt && prompt.trim().length > 0;
//     const HAS_AGENTS = agents && agents.length > 0;

//     if (!HAS_TASK && !HAS_AGENTS) {
//         console.error("A workflow requires at least a task and one agent to run a workflow.");
//         return;
//     }

//     const client = new CopilotClient({
//         githubToken: githubToken || undefined,
//         useLoggedInUser: !githubToken,
//     });
    
//         await client.start();

//         let finalOutput = "";
//         for (const agent of agents) {
//             const stepOutput = await runWorkflowStep(client, agent, prompt, streamOutput);
//             finalOutput = stepOutput || finalOutput;
//         }

//         await client.stop();
//         return { finalOutput };
// }

// const runWorkflowStep = async (client: CopilotClient, agent: WorkflowAgent, task: string, streamOutput: boolean = false) => {

//      const defaultPrompt = "You are an expert agent. Focus on completing your tasks efficiently.";
//      const goalWithAgentInstructions = `GOAL: \n ${task} \n BACKGROUND: \n ${agent.prompt || defaultPrompt} \n TOOLS, HANDOFFS, AND OUTPUT INSTRUCTIONS: \n ${addToolsToPrompt(agent)} \n ${addHandoffsToPrompt(agent)} \n ${addStructuredOutputInstructionsToPrompt(agent)}`;

//      const session = await client.createSession({
//             model: agent.model || "gpt-4.1-mini",
//             sessionId: `${agent.name}-${Date.now()}`,
//             onPermissionRequest: approveAll,
//             streaming: streamOutput,
//             tools: agent.customTools || [],
//             customAgents:[
//                 {
//                     name: agent.name,
//                     displayName: agent.displayName || agent.name,
//                     description: agent.description || "No description available",
//                     prompt: goalWithAgentInstructions,
//                 }
//             ]
//         });

//         console.log(`Running agent: ${agent.name}`);
//         console.log(`Prompt for ${agent.name}:\n`, goalWithAgentInstructions);

//         let response;
//         if(streamOutput) {
//             await supportStreamingOutput(session, task);
//         } else {
//             response = await session.sendAndWait({ prompt: task });
//             console.log("Response:", response?.data.content);
//         }

//         await session.destroy();
//         return response?.data.content

// }

// const addHandoffsToPrompt = (agent: WorkflowAgent) => {
//     let handoffPrompt = "HANDOFFS: \n You do not have any handoffs to other agents. Include in your output the following instruction format: 'handOff: { agentName: name of agent to handoff to, rationale: reason for handoff }'.";
//     if (agent.handoffs && agent.handoffs.length > 0) {
//         console.log(`Agent ${agent.name} has handoffs to:`, agent.handoffs.map(h => h.name));
//         handoffPrompt = `HANDOFFS: \n You have handoffs to the following agents: ${agent.handoffs.map(h => `${h.displayName || h.name} - ${h.description || 'No description available'}`).join(", ")}. \n When your tasks are complete you MUST include in your output which agent should take over next. Include in your output the following handoff instruction format to handoff to another agent: 'AGENT_HANDOFF: { agentName: name of agent to handoff to, rationale: reason for handoff }'.`
//     }
//     return handoffPrompt;

// }

// const addStructuredOutputInstructionsToPrompt = (agent: WorkflowAgent) => {
//     let structuredOutputPrompt = "OUTPUT: You can return unstructured text as output.";
//     if (agent.structuredOutput) {
//         structuredOutputPrompt = `OUTPUT: When returning your output, please structure it according to the following schema: ${agent.structuredOutput}`;
//     }
//     return structuredOutputPrompt;
// }

// const addToolsToPrompt = (agent: WorkflowAgent) => {
//     let toolPrompt = "TOOLS: You do not have access to any tools."
//     if (agent.customTools && agent.customTools.length > 0) {
//         console.log(`Agent ${agent.name} has tools:`, agent.customTools.map(t => t.name));
//         toolPrompt = `TOOLS: You have access to the following tools: ${agent.customTools.map(t => `${t.name} - ${t.description || 'No description available'}`).join(", ")}. Use them as needed to complete your tasks.`
//     }
//     return toolPrompt;
// }

// const supportStreamingOutput = async (session: CopilotSession, prompt: string) => {
//     const done = new Promise<void>((resolve) => {
//         session.on("assistant.message_delta", (event) => {
//             // Streaming message chunk - print incrementally
//             process.stdout.write(event.data.deltaContent);
//         });

//         session.on("assistant.reasoning_delta", (event) => {
//             // Streaming reasoning chunk (if model supports reasoning)
//             process.stdout.write(event.data.deltaContent);
//         });

//         session.on("assistant.message", (event) => {
//             // Final message - complete content
//             console.log("\n--- Final message ---");
//             console.log(event.data.content);
//         });

//         session.on("assistant.reasoning", (event) => {
//             // Final reasoning content (if model supports reasoning)
//             console.log("--- Reasoning ---");
//             console.log(event.data.content);
//         });

//         session.on("session.idle", () => {
//             // Session finished processing
//             resolve();
//         });
//     });
//     await session.send({ prompt });
//     await done;
// }