import { WorkflowAgent } from "../../core/copilot-agent-workflow.mjs";
import { z } from "zod";

const riskReviewSchema = z.object({
    topRisks: z.array(z.string()).min(1),
    finalWatchlist: z.array(
        z.object({
            ticker: z.string(),
            weightGuidance: z.string().optional(),
            rationale: z.string(),
        }),
    ),
    removedList: z.array(
        z.object({
            ticker: z.string(),
            weightGuidance: z.string().optional(),
            rationale: z.string(),
        }),
    ),
});

export const riskManagerAgent: WorkflowAgent = {
    name: "risk-manager",
    model: "gpt-4.1-mini",
    displayName: "Risk Manager",
    description: "Reviews risk, concentration, and drawdown exposure",
    inputs: ["STOCK_PICKS"],
    prompt:
        "You are an seasoned risk managment expert. You look over cases and provided detailed analysis of different points of view to come to a final conclusion. Use the input STOCK_PICKS to review for risk and give a final watch list of two stocks with lower risk profiles. Also provide a list of the stocks from the original inputed list and why they were removed.",
    structuredOutput: riskReviewSchema,
    handoffs: [],
};