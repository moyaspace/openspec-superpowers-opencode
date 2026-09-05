export type ProjectKind = 'greenfield' | 'brownfield';
export type SetupLang = 'en' | 'zh-CN' | 'zh-TW';
export interface SetupContext {
    mode: string;
    lang: string;
    targetDir: string;
    templateDir: string;
    targetExists: boolean;
    projectKind: ProjectKind;
}
export interface ContextOptions {
    mode?: string | undefined;
    lang?: string | undefined;
    targetDir?: string | undefined;
    templateDir?: string | undefined;
}
declare function createContext(options?: ContextOptions): SetupContext;
export { createContext };
//# sourceMappingURL=context.d.ts.map