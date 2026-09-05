interface SkillLockEntry {
    sha256?: string;
}
interface SkillLock {
    skills?: Record<string, SkillLockEntry>;
}
declare function parseMajorVersion(version: unknown): string | null;
declare function selectLockFile(templateDir: string, major: string | null): string | null;
declare function findSuperpowersSkills(packagesDir: string): string | null;
declare function verifySkillLock(skillsDir: string, lock: SkillLock | null | undefined): {
    allMatch: boolean;
    warnings: string[];
};
export { findSuperpowersSkills, parseMajorVersion, selectLockFile, verifySkillLock, };
//# sourceMappingURL=discovery.d.ts.map