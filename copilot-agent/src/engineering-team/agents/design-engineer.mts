import { WorkflowAgent } from "../../core/copilot-agent-workflow.mjs";
import { z } from "zod";

const riskReviewSchema = z.object({
    topRisks: z.array(z.string()).min(1),
    adjustments: z.array(
        z.object({
            action: z.string(),
            rationale: z.string(),
        }),
    ),
    finalWatchlist: z.array(
        z.object({
            ticker: z.string(),
            weightGuidance: z.string().optional(),
            rationale: z.string(),
        }),
    ),
});

export const designEngineerAgent: WorkflowAgent = {
    name: "design-engineer",
    model: "gpt-4.1-mini",
    displayName: "Design Engineer",
    description: "Takes high level requirements and designs a solution, including identifying components, their interactions, and potential tradeoffs.",
    prompt:
        `You are a seasoned engineering lead with a knack for writing clear and concise designs.

        When given requirements, your job is to produce a detailed technical markdown file for the backend developer.

        Your design must:
        1. Describe the purpose and responsibilities of the module
        2. Specify any helper classes or data structures needed
        3. Note any important implementation considerations or constraints, including any npm packages that should be used

        Rules:
        - Everything must be in a single self-contained JavaScript (CommonJS) module
        - The module must be named exactly as specified
        - The class must be named exactly as specified
        - The module must be completely self-contained — no external files or services assumed
        - Use \`require()\` for any npm package imports at the top of the design
        - The design should be ready so that a backend developer can implement it and it can be immediately tested or have a simple UI built on top of it
        - Do NOT write the implementation — only the design (class/function signatures with JSDoc comments)`,
    structuredOutput: riskReviewSchema,
    handoffs: [],
};