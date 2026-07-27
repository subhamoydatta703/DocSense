import { error } from "node:console";
import { aiGuard } from "../../config/ai/ai";
import { type GuardrailCategory, type GuardrailResult } from "../types"
import { buildGuardrailPrompt } from "./prompts/inputGuardPrompt";


export const inputGuardrail = async (userQuery: string): Promise<GuardrailResult> => {
    try {
        const prompt = buildGuardrailPrompt(userQuery);

        const response = await aiGuard.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: prompt,
        })

        const responseText = response.text || "";
        if (!responseText) {
            throw new Error("Guardrail returned an empty response.");
        }

        const jsonString = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonString);

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
