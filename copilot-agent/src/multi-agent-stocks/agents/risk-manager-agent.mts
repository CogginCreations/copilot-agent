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

export const riskManagerAgent: WorkflowAgent = {
    name: "risk-manager",
    model: "gpt-4.1-mini",
    displayName: "Risk Manager",
    description: "Reviews risk, concentration, and drawdown exposure",
    prompt:
        "Review outputs for risk and improve downside profile. Return JSON with topRisks, adjustments, and finalWatchlist.",
    structuredOutput: riskReviewSchema,
    handoffs: [],
};