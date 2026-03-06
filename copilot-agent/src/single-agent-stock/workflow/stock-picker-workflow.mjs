import process from "node:process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runWorkflow } from "../../core/copilot-agent-workflow.mjs";
import { stockPickerAgent } from "../agents/stock-picker-agent.mjs";
const findEnvFile = (startDir, maxLevels = 6) => {
    let currentDir = resolve(startDir);
    for (let level = 0; level <= maxLevels; level++) {
        const candidate = resolve(currentDir, ".env");
        if (existsSync(candidate)) {
            return candidate;
        }
        const parentDir = resolve(currentDir, "..");
        if (parentDir === currentDir) {
            break;
        }
        currentDir = parentDir;
    }
    return undefined;
};
export async function runStockPickerWorkflow(initialPrompt) {
    try {
        const envPath = findEnvFile(process.cwd());
        if (envPath) {
            process.loadEnvFile(envPath);
        }
        const githubToken = process.env.COPILOT_GITHUB_TOKEN;
        if (!githubToken) {
            throw new Error("Missing COPILOT_GITHUB_TOKEN. Add it to your .env file before running the workflow.");
        }
        const workflowAgents = [stockPickerAgent];
        const result = await runWorkflow({
            prompt: initialPrompt,
            agents: workflowAgents,
            streamOutput: false,
            timeoutMs: 120_000,
            githubToken
        });
        return result?.finalOutput ?? "";
    }
    catch (error) {
        console.error("Error running stock picker workflow:", error);
        return "Workflow failed due to an error.";
    }
}
const promptFromArgs = process.argv.slice(2).join(" ").trim();
const defaultPrompt = "Create and refine a diversified 5-stock watchlist for a long-term investor with moderate risk tolerance.";
const finalOutput = await runStockPickerWorkflow(promptFromArgs || defaultPrompt);
console.log("\n=== Final Workflow Output ===\n");
console.log(finalOutput);
process.exit(0);
