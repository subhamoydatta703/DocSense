import { aiGuard } from "../../config/ai/ai";
import { type InputGuardrailCategory, type InputGuardrailResult } from "./types"
import { buildInputGuardrailPrompt } from "./prompts/inputGuardPrompt";


export const inputGuardrail = async (userQuery: string): Promise<InputGuardrailResult> => {
    try {
        const prompt = buildInputGuardrailPrompt(userQuery);

        const response = await aiGuard.models.generateContent({
            model: "gemini-3.1-flash-lite",
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
