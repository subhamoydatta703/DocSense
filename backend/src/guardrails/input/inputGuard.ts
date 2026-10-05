import { aiGuard } from "../../config/ai/ai";
import { type InputGuardrailResult } from "./types";
import { buildInputGuardrailPrompt } from "./prompts/inputGuardPrompt";
import { inputCategories, guardrailJsonSchema, parseGuardrailResponse } from "../guardrailSchema";


/**
 * Classifies user queries with Gemini to detect prompt injection, jailbreaks, or instruction overrides.
 */
export const inputGuardrail = async (userQuery: string, signal?: AbortSignal): Promise<InputGuardrailResult> => {
    try {
        const prompt = buildInputGuardrailPrompt(userQuery);

        const response = await aiGuard.models.generateContent({
            model: "gemini-3.6-flash",
            contents: prompt,
            config: { responseMimeType: "application/json", responseJsonSchema: guardrailJsonSchema(inputCategories), temperature: 0,
                abortSignal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]) },
        })

        const responseText = response.text || "";
        if (!responseText) {
            throw new Error("Guardrail returned an empty response.");
        }

        const parsed = parseGuardrailResponse(responseText, inputCategories);

        return {
            safe: parsed.safe,
            category: parsed.category,
            reason: parsed.reason,
        };


    } catch (error) {
        console.error("Error at inputGuardrail: ", error);
        throw error;
    }
}
