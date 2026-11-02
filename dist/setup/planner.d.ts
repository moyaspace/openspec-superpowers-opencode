export interface PlanOperation {
    type: string;
    target?: string;
    path?: string;
    source?: string;
    content?: string;
    decision?: string | undefined;
    changed?: boolean;
}
export interface InitDecisions {
    openspec?: string | undefined;
    opencodeJson?: string | undefined;
    commands?: string | undefined;
    skills?: string | undefined;
    commandFiles?: Record<string, string> | undefined;
    skillFiles?: Record<string, string> | undefined;
    agents?: string | undefined;
    gitignore?: string | undefined;
    gitattr?: string | undefined;
    editorconfig?: string | undefined;
    [key: string]: string | Record<string, string> | undefined;
}
interface InitContext {
    mode: string;
    lang?: string;
    targetDir: string;
    templateDir: string;
    targetExists: boolean;
    projectKind: 'greenfield' | 'brownfield';
    lockFile?: string | null;
    superpowersPath?: string;
    decisions?: InitDecisions;
}
export interface InitPlan {
    mode: string;
    projectKind: 'greenfield' | 'brownfield';
    operations: PlanOperation[];
}
declare function createInitPlan(context: InitContext): InitPlan;
export { createInitPlan, };
//# sourceMappingURL=planner.d.ts.map