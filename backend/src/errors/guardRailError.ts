import type { GuardrailCategory } from "../guardrails/types";

export class GuardrailError extends Error {
    constructor(message: string, public category: GuardrailCategory) {
        super(message);
        this.name = "GuardrailError";
        
    }
}