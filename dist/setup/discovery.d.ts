interface SkillLockEntry {
    sha256?: string;
}
interface SkillLock {
    skills?: Record<string, SkillLockEntry>;
}
declare function parseMajorVersion(version: unknown): string | null;
declare function listLockMajors(templateDir: string): string[];
declare function selectLockFile(templateDir: string, major: string | null): string | null;
declare function findSuperpowersSkills(packagesDir: string): string | null;
interface LocateSuperpowersOptions {
    superpowersPath?: string | undefined;
    superpowersVersion?: string | null | undefined;
    packagesDir?: string | undefined;
}
interface SuperpowersLocation {
    skillsPath: string;
    version: string | null;
}
declare function locateSuperpowers(options?: LocateSuperpowersOptions): SuperpowersLocation | null;
declare function verifySkillLock(skillsDir: string, lock: SkillLock | null | undefined): {
    allMatch: boolean;
    warnings: string[];
};
export { findSuperpowersSkills, listLockMajors, locateSuperpowers, parseMajorVersion, selectLockFile, verifySkillLock, };
//# sourceMappingURL=discovery.d.ts.map