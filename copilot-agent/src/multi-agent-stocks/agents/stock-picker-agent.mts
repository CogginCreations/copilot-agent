import { WorkflowAgent } from "../../core/copilot-agent-workflow.mjs";
import { riskManagerAgent } from "./risk-manager-agent.mjs";
import { z } from "zod";

export const stockPickSchema = z.object({
    picks: z
        .array(
            z.object({
                ticker: z.string(),
                thesis: z.string(),
                catalyst: z.string().optional(),
            }),
        )
        .min(3)
        .max(8),
});

export const stockPickerAgent: WorkflowAgent = {
    name: "stock-picker",
    model: "gpt-4.1-mini",
    displayName: "Stock Picker",
    description: "Assembles stock ideas that match the prompt without performing risk oversight",
    prompt:
        "Respond only with a list of 3-8 stock ideas including ticker, thesis, and optional catalyst that reflect the provided prompt.",
    structuredOutput: stockPickSchema,
    outputs: [
        {
            name: "STOCK_PICKS",
            value: JSON.stringify(stockPickSchema.shape.picks),
        }
    ],
    handoffs: [riskManagerAgent],
};