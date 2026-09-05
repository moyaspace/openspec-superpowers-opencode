interface PlanOperation {
    type: string;
    target?: string;
    path?: string;
    source?: string;
    content?: string;
    decision?: string | undefined;
}
interface InitDecisions {
    openspec?: string;
    opencodeJson?: string;
    commands?: string;
    skills?: string;
    commandFiles?: Record<string, string>;
    skillFiles?: Record<string, string>;
    agents?: string;
    gitignore?: string;
    gitattr?: string;
    editorconfig?: string;
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
interface InitPlan {
    mode: string;
    projectKind: 'greenfield' | 'brownfield';
    operations: PlanOperation[];
}
declare function createInitPlan(context: InitContext): InitPlan;
export { createInitPlan, };
//# sourceMappingURL=planner.d.ts.map