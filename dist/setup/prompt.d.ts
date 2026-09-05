export type Decision = 'yes' | 'no' | 'ask';
export interface DecisionOptions {
    allowAsk?: boolean | undefined;
    override?: string | undefined;
    prompt?: ((question: string) => Promise<string>) | undefined;
    question?: string | undefined;
}
declare function normalizeOverride(value: unknown, options?: DecisionOptions): Decision | null;
declare function resolveDecision(options?: DecisionOptions): Promise<Decision>;
export { normalizeOverride, resolveDecision, };
//# sourceMappingURL=prompt.d.ts.map