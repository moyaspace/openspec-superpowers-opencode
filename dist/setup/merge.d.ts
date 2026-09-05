declare function mergeKeys(templateValue: Record<string, unknown> | undefined, userValue: Record<string, unknown> | undefined): Record<string, unknown>;
declare function mergeOcodeJson(userJson?: Record<string, unknown>, templateJson?: Record<string, unknown>): Record<string, unknown>;
declare function mergeMarker(options: {
    existing: string | null | undefined;
    managed: string;
    marker: string;
    decision?: string | undefined;
}): {
    action: 'create' | 'append' | 'skip' | 'replace';
    content: string;
};
export { mergeMarker, mergeKeys, mergeOcodeJson, };
//# sourceMappingURL=merge.d.ts.map