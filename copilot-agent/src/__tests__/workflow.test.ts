import { vi, describe, it, expect, beforeEach } from "vitest";

// vi.mock is hoisted by vitest above all imports, ensuring the SDK is
// mocked before copilot-agent-workflow.mts first imports it.
vi.mock("@github/copilot-sdk", () => ({
    CopilotClient: vi.fn(),
    approveAll: vi.fn(),
    defineTool: vi.fn(),
}));

import { CopilotClient } from "@github/copilot-sdk";
import { runWorkflow } from "../core/copilot-agent-workflow.mjs";
import type { WorkflowAgent } from "../core/copilot-agent-workflow.mjs";

// ---------------------------------------------------------------------------
// Helpers to build fresh mock instances before each test
// ---------------------------------------------------------------------------
function makeMockSession() {
    return {
        sendAndWait: vi.fn().mockResolvedValue({ data: { content: "mock response" } }),
        destroy: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        send: vi.fn().mockResolvedValue("msg-id"),
        rpc: {
            agent: {
                select: vi.fn().mockResolvedValue({}),
            },
        },
    };
}

function makeMockClient(session: ReturnType<typeof makeMockSession>) {
    return {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue([]),
        createSession: vi.fn().mockResolvedValue(session),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("copilot-agent-workflow", () => {
    let mockSession: ReturnType<typeof makeMockSession>;
    let mockClient: ReturnType<typeof makeMockClient>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSession = makeMockSession();
        mockClient = makeMockClient(mockSession);

        // CopilotClient is used as `new CopilotClient(...)` in the workflow.
        // Must use a regular function (not an arrow function) so it can be
        // called as a constructor. Returning an object from a constructor
        // causes 'new' to return that object instead of 'this'.
        vi.mocked(CopilotClient).mockImplementation(function () {
            return mockClient;
        } as any);
    });

    // -----------------------------------------------------------------------
    // 1. Timeout default value
    // -----------------------------------------------------------------------
    describe("timeout defaults", () => {
        it("uses 120,000 ms as the default timeout when none is supplied", async () => {
            const agent: WorkflowAgent = {
                name: "test-agent",
                model: "gpt-4.1-mini",
                displayName: "Test Agent",
                description: "A test agent",
                prompt: "Do something",
            };

            await runWorkflow({ prompt: "test prompt", agents: [agent], githubToken: "tok" });

            // The default timeout (120_000) must be passed as the second argument to sendAndWait
            expect(mockSession.sendAndWait).toHaveBeenCalledOnce();
            const [, actualTimeout] = mockSession.sendAndWait.mock.calls[0];
            expect(actualTimeout).toBe(120_000);
        });
    });

    // -----------------------------------------------------------------------
    // 2. Caller-supplied timeout is forwarded unchanged (no capping)
    // -----------------------------------------------------------------------
    describe("timeout forwarding", () => {
        it("passes a 30,000 ms caller timeout directly to sendAndWait", async () => {
            const agent: WorkflowAgent = {
                name: "test-agent",
                model: "gpt-4.1-mini",
                prompt: "",
            };

            await runWorkflow({
                prompt: "test prompt",
                agents: [agent],
                timeoutMs: 30_000,
                githubToken: "tok",
            });

            const [, actualTimeout] = mockSession.sendAndWait.mock.calls[0];
            expect(actualTimeout).toBe(30_000);
        });

        it("passes a 60,000 ms timeout directly to sendAndWait without capping", async () => {
            const agent: WorkflowAgent = {
                name: "test-agent",
                model: "gpt-4.1-mini",
                prompt: "",
            };

            await runWorkflow({
                prompt: "test prompt",
                agents: [agent],
                timeoutMs: 60_000,
                githubToken: "tok",
            });

            const [, actualTimeout] = mockSession.sendAndWait.mock.calls[0];
            // Must be exactly 60_000 — would have been 30_000 with the old Math.min cap
            expect(actualTimeout).toBe(60_000);
        });

        it("passes a 120,000 ms timeout directly to sendAndWait", async () => {
            const agent: WorkflowAgent = {
                name: "test-agent",
                model: "gpt-4.1-mini",
                prompt: "",
            };

            await runWorkflow({
                prompt: "test prompt",
                agents: [agent],
                timeoutMs: 120_000,
                githubToken: "tok",
            });

            const [, actualTimeout] = mockSession.sendAndWait.mock.calls[0];
            expect(actualTimeout).toBe(120_000);
        });
    });

    // -----------------------------------------------------------------------
    // 3. Regression: old 30-second cap is gone
    // -----------------------------------------------------------------------
    describe("regression: no 30-second cap", () => {
        it("does NOT cap the timeout at 30,000 ms when a larger value is provided", async () => {
            const agent: WorkflowAgent = {
                name: "test-agent",
                model: "gpt-4.1-mini",
                prompt: "",
            };

            await runWorkflow({
                prompt: "test prompt",
                agents: [agent],
                timeoutMs: 90_000,
                githubToken: "tok",
            });

            const [, actualTimeout] = mockSession.sendAndWait.mock.calls[0];
            // With the old code this would have been Math.min(90_000, 30_000) = 30_000
            expect(actualTimeout).not.toBe(30_000);
            expect(actualTimeout).toBe(90_000);
        });
    });

    // -----------------------------------------------------------------------
    // 4. Basic workflow lifecycle
    // -----------------------------------------------------------------------
    describe("workflow lifecycle", () => {
        it("starts and stops the CopilotClient around agent execution", async () => {
            const agent: WorkflowAgent = {
                name: "test-agent",
                model: "gpt-4.1-mini",
                prompt: "",
            };

            await runWorkflow({ prompt: "test prompt", agents: [agent], githubToken: "tok" });

            expect(mockClient.start).toHaveBeenCalledOnce();
            expect(mockClient.stop).toHaveBeenCalledOnce();
        });

        it("creates a session for each agent in the list", async () => {
            const session1 = makeMockSession();
            const session2 = makeMockSession();
            mockClient.createSession
                .mockResolvedValueOnce(session1)
                .mockResolvedValueOnce(session2);

            const agents: WorkflowAgent[] = [
                { name: "agent-1", model: "gpt-4.1-mini", prompt: "" },
                { name: "agent-2", model: "gpt-4.1-mini", prompt: "" },
            ];

            await runWorkflow({ prompt: "test prompt", agents, githubToken: "tok" });

            expect(mockClient.createSession).toHaveBeenCalledTimes(2);
        });

        it("returns the content from sendAndWait as finalOutput", async () => {
            const expectedContent = "Here are my stock picks";
            mockSession.sendAndWait.mockResolvedValue({
                data: { content: expectedContent },
            });

            const agent: WorkflowAgent = { name: "test-agent", model: "gpt-4.1-mini", prompt: "" };
            const result = await runWorkflow({
                prompt: "test prompt",
                agents: [agent],
                githubToken: "tok",
            });

            expect(result?.finalOutput).toBe(expectedContent);
        });

        it("returns undefined when no prompt or agents are provided", async () => {
            const result = await runWorkflow({
                prompt: "",
                agents: [],
                githubToken: "tok",
            });

            expect(result).toBeUndefined();
        });

        it("destroys the session after sendAndWait completes", async () => {
            const agent: WorkflowAgent = { name: "test-agent", model: "gpt-4.1-mini", prompt: "" };

            await runWorkflow({ prompt: "test prompt", agents: [agent], githubToken: "tok" });

            expect(mockSession.destroy).toHaveBeenCalledOnce();
        });

        it("still stops the client when sendAndWait throws an error", async () => {
            mockSession.sendAndWait.mockRejectedValue(new Error("SDK error"));

            const agent: WorkflowAgent = { name: "test-agent", model: "gpt-4.1-mini", prompt: "" };

            await expect(
                runWorkflow({ prompt: "test prompt", agents: [agent], githubToken: "tok" }),
            ).rejects.toThrow("SDK error");

            expect(mockClient.stop).toHaveBeenCalledOnce();
        });
    });
});

