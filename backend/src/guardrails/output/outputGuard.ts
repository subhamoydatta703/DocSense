import { aiGuard } from "../../config/ai/ai";
import { buildOutputGuardrailPrompt } from "./prompts/outputGuardPrompt";
import {type OutputGuardrailResult, type OutputGuardrailCategory} from "./types"


export const outputGuardrail = async (assistantResponse: string): Promise<OutputGuardrailResult> => {
    try {
        const prompt = buildOutputGuardrailPrompt(assistantResponse);

        const response = await aiGuard.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: prompt,
        });

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
        console.error("Error at outputGuardrail: ", error);
        throw error;
    }
};