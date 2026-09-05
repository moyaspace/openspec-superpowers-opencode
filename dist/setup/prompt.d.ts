type Decision = 'yes' | 'no' | 'ask';
interface DecisionOptions {
    allowAsk?: boolean;
    override?: string;
    prompt?: (question: string) => Promise<string>;
    question?: string;
}
declare function normalizeOverride(value: unknown, options?: DecisionOptions): Decision | null;
declare function resolveDecision(options?: DecisionOptions): Promise<Decision>;
export { normalizeOverride, resolveDecision, };
//# sourceMappingURL=prompt.d.ts.map