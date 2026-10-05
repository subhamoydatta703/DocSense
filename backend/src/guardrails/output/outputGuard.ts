import { aiGuard } from "../../config/ai/ai";
import { buildOutputGuardrailPrompt } from "./prompts/outputGuardPrompt";
import { type OutputGuardrailResult } from "./types";
import { outputCategories, guardrailJsonSchema, parseGuardrailResponse } from "../guardrailSchema";


/**
 * Classifies generated AI responses with Gemini to detect prompt leakage, chain of thought, or PII.
 */
export const outputGuardrail = async (assistantResponse: string, signal?: AbortSignal): Promise<OutputGuardrailResult> => {
    try {
        const prompt = buildOutputGuardrailPrompt(assistantResponse);

        const response = await aiGuard.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
            config: { responseMimeType: "application/json", responseJsonSchema: guardrailJsonSchema(outputCategories), temperature: 0,
                abortSignal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]) },
        });

        const responseText = response.text || "";
        if (!responseText) {
            throw new Error("Guardrail returned an empty response.");
        }

        const parsed = parseGuardrailResponse(responseText, outputCategories);

        return {
            safe: parsed.safe,
            category: parsed.category,
            reason: parsed.reason,
        };
    } catch (error) {
        console.error("Error at outputGuardrail: ", error);
        throw error;
    }
};
