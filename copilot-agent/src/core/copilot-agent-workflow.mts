import { CopilotClient, approveAll, CustomAgentConfig, defineTool, SessionConfig, CopilotSession, SessionEvent } from "@github/copilot-sdk";
import { z } from "zod";

const MAX_TIMEOUT_MS = 60_000;

export const agentHandoffSchema = z.object({
    agentName: z.string().min(1),
    rationale: z.string().min(1),
});

const formatOutput = (output: string): string => {
    try {
        const data = JSON.parse(output);
        return JSON.stringify(data, null, 2);
    } catch (error) {
        return output;
    }
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> => {
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
};

// Define the WorkflowAgent type extending customAgentConfig

export interface WorkflowAgent extends CustomAgentConfig {
    model: string;
    structuredOutput?: z.ZodObject<z.ZodRawShape>;
    handoffs?: WorkflowAgent[];
    customTools?: ReturnType<typeof defineTool>[];
    inputs?: string[];
    outputs?: Array<{
        name: string;
        value?: string;
    }>;
};


// Define the WorkflowContext type to manage workflow state
export interface WorkflowContext {
    workflowPrompt: string;
    completedSteps?: string[];
    outputs: Array<Record<string, string>>;
}

export const runWorkflow = async (config: { prompt: string; agents: WorkflowAgent[]; streamOutput?: boolean; githubToken?: string; timeoutMs?: number }) => {
    const { prompt, agents, streamOutput = false, githubToken, timeoutMs = MAX_TIMEOUT_MS } = config;


    const HAS_TASK = prompt && prompt.trim().length > 0;
    const HAS_AGENTS = agents && agents.length > 0;
    const MAX_STEPS = agents.length * 3; // Arbitrary limit to prevent infinite loops in handoffs

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
        const context: WorkflowContext = {
            workflowPrompt: prompt,
            completedSteps: [],
            outputs: [],
        };

        for (const agent of agents) {
            const stepOutput = await runWorkflowStep(client, agent, prompt, context, MAX_STEPS, streamOutput, timeoutMs);
            finalOutput = stepOutput || finalOutput;

            if (stepOutput) {
                context.completedSteps?.push(agent.name);
                if(agent.outputs) {
                    agent.outputs.forEach(output => {
                        context.outputs.push({ [output.name]: output.value ?? stepOutput });
                    });
                }
            }
        }

        return formatOutput(finalOutput) ;
    } finally {
        await client.stop();
    }
}

const runWorkflowStep = async (client: CopilotClient, agent: WorkflowAgent, task: string, context: WorkflowContext, maxSteps: number, streamOutput: boolean = false, timeoutMs: number = MAX_TIMEOUT_MS) => {
    
    let session: CopilotSession | undefined;
    try {
        if (context.completedSteps && context.completedSteps.length >= maxSteps) {
            throw new Error(`Workflow has reached the maximum number of steps (${maxSteps}). Possible infinite loop in agent handoffs.`);
        }

        const defaultPrompt = "You are an expert agent. Focus on completing your tasks efficiently.";
        const goalWithAgentInstructions = `GOAL:\n ${task}\n\n`+ 
                                          `BACKGROUND:\n ${agent.prompt || defaultPrompt}\n\n`+
                                          `INPUTS:\n ${addInputsToPrompt(agent, context)}\n\n`+
                                          `TOOLS:\n ${addToolsToPrompt(agent)}\n\n`+
                                          `HANDOFFS:\n ${addHandoffsToPrompt(agent)}\n\n`+
                                          `OUTPUT INSTRUCTIONS:\n ${addStructuredOutputInstructionsToPrompt(agent)}`;

        session = await client.createSession({
            model: agent.model || "gpt-4.1-mini",
            sessionId: `${agent.name}-${Date.now()}`,
            onPermissionRequest: approveAll,
            ...(streamOutput && { streaming: true }),
            tools: agent.customTools || [],
            customAgents:[
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
        if (streamOutput) {
            await withTimeout(
                supportStreamingOutput(session, task),
                timeoutMs,
                `Streaming response for agent ${agent.name}`,
            );
        } else {
            response = await session.sendAndWait({ prompt: task }, timeoutMs);
            if (!checkAgentOutputs(agent, response?.data.content || "", context)) {
                await session.destroy();
                await runWorkflowStep(client, agent, task, context, maxSteps, streamOutput, timeoutMs);
            }
        }
        return response?.data.content;
    } catch (error) {
        console.error(`Error running agent ${agent.name}:`, error);
    } finally {
        if (session) {
            await session.destroy();
        }
    }

}

const checkAgentOutputs = (agent: WorkflowAgent, responseContent: string, context: WorkflowContext) => {
    if(!agent.structuredOutput) {
        return true; // No structured output expected, skip validation
    }
    try {
        const parsed = JSON.parse(responseContent);
        const validation = agent.structuredOutput.safeParse(parsed);
        if (!validation.success) {
           context.completedSteps?.push(`Agent ${agent.name} produced invalid output that does not match the expected schema. Output was: ${responseContent}`);
           throw new Error(`Output does not match schema: ${JSON.stringify(validation.error.issues)}`);
        } 
        console.log(`Agent ${agent.name} output matched the expected schema.`);
        return true;
    } catch (error) {
        console.warn(`Agent ${agent.name} output is not valid JSON:`, error);
        return false;
    }
}

const addInputsToPrompt = (agent: WorkflowAgent, context: WorkflowContext) => {
    let inputPrompt = "You do not have any inputs.";
    if (agent.inputs && agent.inputs.length > 0) {
        const resolvedInputs = agent.inputs.map(inputVar => {
            const matchingOutput = context.outputs.find(output => inputVar in output);
            if (matchingOutput) {
                const rawValue = matchingOutput[inputVar];
                try {
                    const parsedValue = JSON.parse(rawValue);
                    return `${inputVar}: ${JSON.stringify(parsedValue, null, 2)}`;
                } catch {
                    return `${inputVar}: ${rawValue}`;
                }
            }
            return `${inputVar}: [No matching output found]`;
        });

        console.log(`Agent ${agent.name} has inputs from other agents:`, resolvedInputs);
        inputPrompt = `You have the following inputs from other agents:\n ${resolvedInputs.join("\n")}. \n Use these inputs as needed to complete your tasks.\n`;
    }
    return inputPrompt;
}

const addHandoffsToPrompt = (agent: WorkflowAgent) => {
    let handoffPrompt = "You do not have any handoffs to other agents. You are responsible for completing all tasks related to the goal.";
    if (agent.handoffs && agent.handoffs.length > 0) {
        console.log(`Agent ${agent.name} has handoffs to:`, agent.handoffs.map(h => h.name));
        const handoffSchemaText = JSON.stringify(z.toJSONSchema(agentHandoffSchema), null, 2);
        handoffPrompt = `You have handoffs to the following agents: ${agent.handoffs.map(h => `${h.displayName || h.name} - ${h.description || 'No description available'}`).join(", ")}. \n When your tasks are complete you MUST include in your output which agent should take over next. Include a single handoff object in this format: AGENT_HANDOFF: <json>. The JSON must match this schema:\n${handoffSchemaText}`
    }
    return handoffPrompt;

}

const addStructuredOutputInstructionsToPrompt = (agent: WorkflowAgent) => {
    let structuredOutputPrompt = "You can return unstructured text as output.";
    if (agent.structuredOutput) {
        const hasHandoffs = !!agent.handoffs && agent.handoffs.length > 0;
        const effectiveSchema: z.ZodObject<z.ZodRawShape> = !hasHandoffs
            ? agent.structuredOutput
            : agent.structuredOutput.extend({
                    agentHandoff: agentHandoffSchema
            });
        const schemaText = JSON.stringify(z.toJSONSchema(effectiveSchema), null, 2);
        structuredOutputPrompt = `CRITICAL: Your output MUST be ONLY valid JSON that matches this schema. NO markdown, NO code blocks, NO extra text.

                                The output MUST match the following JSON schema:
                                ${schemaText}

                                IMPORTANT RULES:
                                1. Return ONLY the JSON object - no markdown formatting, no backticks, no "json" language tag
                                2. Do not include any text before or after the JSON
                                3. Each field in the schema MUST be present in your output
                                4. If you do not have information for a required field, use null as the value
                                5. Your entire response should be a single valid JSON object
                                6. If you have handoffs, include the "agentHandoff" field in your JSON that matches the the agentHandoffSchema and specifies which agent to handoff to next along with the rationale for the handoff.`
    }
    return structuredOutputPrompt;
}

const addToolsToPrompt = (agent: WorkflowAgent) => {
    let toolPrompt = "You do not have access to any tools. You must rely on your own knowledge and reasoning to complete the tasks.";
    if (agent.customTools && agent.customTools.length > 0) {
        console.log(`Agent ${agent.name} has tools:`, agent.customTools.map(t => t.name));
        toolPrompt = `You have access to the following tools: ${agent.customTools.map(t => `${t.name} - ${t.description || 'No description available'}`).join(", ")}. Use them as needed to complete your tasks.`
    }
    return toolPrompt;
}

const supportStreamingOutput = async (session: CopilotSession, prompt: string) => {
    const done = new Promise<void>((resolve) => {
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
}