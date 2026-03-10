import process from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runWorkflow, WorkflowAgent } from "../../core/copilot-agent-workflow.mjs";
import { stockPickerAgent } from "../agents/stock-picker-agent.mjs";
import { riskManagerAgent } from "../agents/risk-manager-agent.mjs";


export async function runStockPickerWorkflow(initialPrompt: string): Promise<string> {
	try {
        const envPaths = [
            resolve(process.cwd(), ".env"),
            resolve(process.cwd(), "../.env"),
        ];

        const envPath = envPaths.find((path) => existsSync(path));
        if (envPath) {
            process.loadEnvFile(envPath);
        }

        const workflowAgents: WorkflowAgent[] = [stockPickerAgent, riskManagerAgent];
        const result = await runWorkflow({
            prompt: initialPrompt,
            agents: workflowAgents,
            streamOutput: false,
            githubToken: process.env.COPILOT_GITHUB_TOKEN
        });

        return result ?? "No output generated."; // Ensure result is always a string
    } catch (error) {
        console.error("Error running stock picker workflow:", error);
        return "Workflow failed due to an error.";
    }
}

const promptFromArgs = process.argv.slice(2).join(" ").trim();
const defaultPrompt =
	"Create and refine a diversified 5-stock watchlist for a long-term investor with moderate risk tolerance.";

const finalOutput = await runStockPickerWorkflow(promptFromArgs || defaultPrompt);
console.log("\n=== Final Workflow Output ===");
console.log(finalOutput);

process.exit(0);
