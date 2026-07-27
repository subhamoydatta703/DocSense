import type { InputGuardrailCategory } from "../guardrails/input/types";
import type { OutputGuardrailCategory } from "../guardrails/output/types";

export class GuardrailError extends Error {
    constructor(
        message: string,
        public category:
            | InputGuardrailCategory
            | OutputGuardrailCategory
    ) {
        super(message);
        this.name = "GuardrailError";
        Object.setPrototypeOf(this, GuardrailError.prototype);
    }
}