import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { z } from "zod";
const DEFAULT_TIMEOUT_MS = 120_000;
const withTimeout = async (promise, timeoutMs, operationName) => {
    let timeoutHandle;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};
;
export const runWorkflow = async (config) => {
    const { prompt, agents, streamOutput = false, githubToken, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
    const effectiveTimeoutMs = timeoutMs;
    const HAS_TASK = prompt && prompt.trim().length > 0;
    const HAS_AGENTS = agents && agents.length > 0;
    if (!HAS_TASK && !HAS_AGENTS) {
        console.error("A workflow requires at least a task and one agent to run a workflow.");
        return;
    }
    const client = new CopilotClient({
        githubToken: githubToken || undefined,
        useLoggedInUser: !githubToken,
    });
    await client.start();
    try {
        let finalOutput = "";
        for (const agent of agents) {
            const stepOutput = await runWorkflowStep(client, agent, prompt, streamOutput, effectiveTimeoutMs);
            finalOutput = stepOutput || finalOutput;
        }
        return { finalOutput };
    }
    finally {
        await client.stop();
    }
};
const runWorkflowStep = async (client, agent, task, streamOutput = false, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const defaultPrompt = "You are an expert agent. Focus on completing your tasks efficiently.";
    const goalWithAgentInstructions = `GOAL: \n ${task} \n BACKGROUND: \n ${agent.prompt || defaultPrompt} \n TOOLS, HANDOFFS, AND OUTPUT INSTRUCTIONS: \n ${addToolsToPrompt(agent)} \n ${addHandoffsToPrompt(agent)} \n ${addStructuredOutputInstructionsToPrompt(agent)}`;
    const session = await client.createSession({
        model: agent.model || "gpt-4.1-mini",
        sessionId: `${agent.name}-${Date.now()}`,
        onPermissionRequest: approveAll,
        streaming: streamOutput,
        tools: agent.customTools || [],
        customAgents: [
            {
                name: agent.name,
                displayName: agent.displayName || agent.name,
                description: agent.description || "No description available",
                prompt: goalWithAgentInstructions,
            }
        ]
    });
    console.log(`Running agent: ${agent.name}`);
    console.log(`Prompt for ${agent.name}:\n`, goalWithAgentInstructions);
    await session.rpc.agent.select({ name: agent.name });
    let response;
    try {
        if (streamOutput) {
            await withTimeout(supportStreamingOutput(session, task), timeoutMs, `Streaming response for agent ${agent.name}`);
        }
        else {
            response = await session.sendAndWait({ prompt: task }, timeoutMs);
            console.log("Response:", response?.data.content);
        }
        return response?.data.content;
    }
    finally {
        await session.destroy();
    }
};
const addHandoffsToPrompt = (agent) => {
    let handoffPrompt = "HANDOFFS: \n You do not have any handoffs to other agents. Include in your output the following instruction format: 'handOff: { agentName: name of agent to handoff to, rationale: reason for handoff }'.";
    if (agent.handoffs && agent.handoffs.length > 0) {
        console.log(`Agent ${agent.name} has handoffs to:`, agent.handoffs.map(h => h.name));
        handoffPrompt = `HANDOFFS: \n You have handoffs to the following agents: ${agent.handoffs.map(h => `${h.displayName || h.name} - ${h.description || 'No description available'}`).join(", ")}. \n When your tasks are complete you MUST include in your output which agent should take over next. Include in your output the following handoff instruction format to handoff to another agent: 'AGENT_HANDOFF: { agentName: name of agent to handoff to, rationale: reason for handoff }'.`;
    }
    return handoffPrompt;
};
const addStructuredOutputInstructionsToPrompt = (agent) => {
    let structuredOutputPrompt = "OUTPUT: You can return unstructured text as output.";
    if (agent.structuredOutput) {
        const schemaText = JSON.stringify(z.toJSONSchema(agent.structuredOutput), null, 2);
        structuredOutputPrompt = `OUTPUT: Return JSON that matches this schema:\n${schemaText}`;
    }
    return structuredOutputPrompt;
};
const addToolsToPrompt = (agent) => {
    let toolPrompt = "TOOLS: You do not have access to any tools.";
    if (agent.customTools && agent.customTools.length > 0) {
        console.log(`Agent ${agent.name} has tools:`, agent.customTools.map(t => t.name));
        toolPrompt = `TOOLS: You have access to the following tools: ${agent.customTools.map(t => `${t.name} - ${t.description || 'No description available'}`).join(", ")}. Use them as needed to complete your tasks.`;
    }
    return toolPrompt;
};
const supportStreamingOutput = async (session, prompt) => {
    const done = new Promise((resolve) => {
        session.on("assistant.message_delta", (event) => {
            // Streaming message chunk - print incrementally
            process.stdout.write(event.data.deltaContent);
        });
        session.on("assistant.reasoning_delta", (event) => {
            // Streaming reasoning chunk (if model supports reasoning)
            process.stdout.write(event.data.deltaContent);
        });
        session.on("assistant.message", (event) => {
            // Final message - complete content
            console.log("\n--- Final message ---");
            console.log(event.data.content);
        });
        session.on("assistant.reasoning", (event) => {
            // Final reasoning content (if model supports reasoning)
            console.log("--- Reasoning ---");
            console.log(event.data.content);
        });
        session.on("session.idle", () => {
            // Session finished processing
            resolve();
        });
    });
    await session.send({ prompt });
    await done;
};
