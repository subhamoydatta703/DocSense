import { aiQueryOptimization } from "../../config/ai/ai";
import { aiModels, providerSignal, queryPolicy } from "../../config/ai/policy";
import { requireResponseText } from "../../utils/aiResponse";

/**
 * Rewrites user queries using Step-Back Prompting to improve semantic retrieval quality.
 */
export const optimizeQuery = async(originalQuery: string, signal?: AbortSignal): Promise<string>=>{

    const prompt = `
You are a query optimization assistant for a Retrieval-Augmented Generation (RAG) system.

Your task is to perform Step-Back Prompting.

Given a user's question about a selected document, rewrite it into a broader, higher-level question that captures the underlying concept needed to answer the original question. The rewritten question should improve semantic retrieval while preserving the user's intent.

Guidelines:
- Preserve the original meaning and intent of the question.
- Generalize the question to focus on the broader concept, principle, or topic.
- Keep essential entities, names, dates, numbers, or technical terms if they are important to the meaning.
- Remove only unnecessary details that do not help retrieval.
- Keep the output as a single, natural-language question.
- Do NOT answer the question.
- Do NOT explain your reasoning.
- Do NOT include labels, bullet points, quotation marks, or any additional text.
- Return only the rewritten step-back question.

Examples:

Original: "Why was the application rejected?"
Step-back: "What are the common reasons an application may be rejected?"

Original: "What does Clause 7.3 say about termination?"
Step-back: "What does the document say about termination, particularly in Clause 7.3?"

Original: "How did the 2023 marketing campaign affect Product X revenue?"
Step-back: "How do marketing campaigns affect product revenue, particularly for the 2023 campaign involving Product X?"

User Question:
${originalQuery}
`;

    const response = await aiQueryOptimization.models.generateContent({
        model: aiModels.optimization,
        contents: JSON.stringify({ question: originalQuery }),
        // Optional enhancement: promptly fall back to the original question.
        config: { systemInstruction: prompt.slice(0, prompt.indexOf("User Question:")), maxOutputTokens: 256, abortSignal: providerSignal(queryPolicy.rewriteMs, signal), httpOptions: { timeout: queryPolicy.rewriteMs } },
    });

    signal?.throwIfAborted();
    const rewritten = requireResponseText(response);
    if (rewritten.length > 10_000) throw new Error("Query rewrite exceeds the supported length.");
    return rewritten;
}
