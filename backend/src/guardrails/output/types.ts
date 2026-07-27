export type OutputGuardrailCategory =
    | "SAFE"
    | "PROMPT_LEAKAGE"
    | "CHAIN_OF_THOUGHT"
    | "SENSITIVE_INFORMATION"
    | "PII"
    | "HARMFUL_CONTENT";

export interface OutputGuardrailResult {
    safe: boolean;
    category: OutputGuardrailCategory;
    reason: string;
}