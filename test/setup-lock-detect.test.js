/**
 * setup-lock-detect.test.js — 验证 setup.ps1/setup.sh 的技能锁文件版本选择 + 部署逻辑
 *
 * 覆盖：
 *   1. 从 package.json version 解析主版本号
 *   2. 根据主版本号选择对应锁文件
 *   3. 版本特有锁文件不存在时降级到默认 skills.lock.json
 *   4. 无效输入的处理（无版本、版本格式异常）
 *   5. 部署锁文件——将版本锁复制到项目根目录为 skills.lock.json
 *   6. 集成场景——版本检测 → 选择源 → 部署 → 校验路径
 *
 * 这些函数复现了 setup.ps1/setup.sh 将实现的 lock 选择 + 部署逻辑。
 * 测试通过后，setup.ps1 和 setup.sh 按相同逻辑实现。
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ============================================================
// 复现 setup.ps1/setup.sh 的 lock 选择逻辑
// ============================================================

/**
 * 从 Superpowers 版本字符串解析主版本号。
 * 等价于 setup.ps1 的: $pkg.version -replace '\..*'
 * 等价于 setup.sh 的: version.split('.')[0]
 * @param {string|null} version — 版本字符串如 "5.1.0"、"6.1.1"
 * @returns {string|null} 主版本号如 "5"、"6"，解析失败返回 null
 */
function parseMajorVersion(version) {
    if (!version || typeof version !== 'string') return null;
    const parts = version.split('.');
    if (parts.length < 1 || !/^\d+$/.test(parts[0])) return null;
    return parts[0];
}

/**
 * 选择对应版本的锁文件路径。
 * 等价于 setup.ps1 的:
 *   $lockFile = Join-Path $templateDir "skills.lock.v$major.json"
 *   if (-not (Test-Path $lockFile)) { $lockFile = Join-Path $templateDir "skills.lock.json" }
 * @param {string|null} major — 主版本号
 * @param {Object} versionLocks — 版本→锁文件映射 { "5": "...v5.json", "6": "...v6.json" }
 * @param {string} defaultLock — 降级锁文件路径
 * @returns {string} 选中的锁文件路径
 */
function resolveLockPath(major, versionLocks, defaultLock) {
    if (major && versionLocks[major]) {
        return versionLocks[major];
    }
    return defaultLock;
}

/**
 * 选取并部署锁文件到项目根目录为 skills.lock.json。
 * 等价于 setup.ps1/setup.sh 中：检测版本 → 选择 template 中的源文件 →
 * 部署到 projectRoot/skills.lock.json
 * @param {string|null} version — Superpowers version string
 * @param {Object} versionLocks — 版本→源锁文件路径映射 { "5": "path/to/skills.lock.v5.json", ... }
 * @param {string} defaultLock — 降级锁文件路径
 * @param {string} projectRoot — 目标项目根目录
 * @returns {{ source: string|null, target: string }} 选中源文件路径和目标路径
 */
function deployLockFile(version, versionLocks, defaultLock, projectRoot) {
    const major = parseMajorVersion(version);
    const source = resolveLockPath(major, versionLocks, defaultLock);
    const target = pathJoin(projectRoot, 'skills.lock.json');
    return { source, target };
}

/**
 * 模拟 path.join（避免引入 path 模块依赖）。
 */
function pathJoin(...parts) {
    return parts.filter(p => p != null).join('/').replace(/\/+/g, '/');
}

// ============================================================
// 单元测试
// ============================================================

describe('parseMajorVersion() — 主版本号解析', () => {
    it('v5.1.0 → "5"', () => {
        assert.strictEqual(parseMajorVersion('5.1.0'), '5');
    });

    it('v6.1.1 → "6"', () => {
        assert.strictEqual(parseMajorVersion('6.1.1'), '6');
    });

    it('只传主版本号 "5" 也能识别', () => {
        assert.strictEqual(parseMajorVersion('5'), '5');
    });

    it('null 输入 → null', () => {
        assert.strictEqual(parseMajorVersion(null), null);
    });

    it('undefined 输入 → null', () => {
        assert.strictEqual(parseMajorVersion(undefined), null);
    });

    it('空字符串 → null', () => {
        assert.strictEqual(parseMajorVersion(''), null);
    });

    it('非数字开头 → null', () => {
        assert.strictEqual(parseMajorVersion('beta-1.0'), null);
    });

    it('非标准格式（非 semver）→ null', () => {
        // package.json 中的 version 总是合法 semver，此场景不会发生
        assert.strictEqual(parseMajorVersion('5-beta'), null);
    });
});

describe('resolveLockPath() — 锁文件选择', () => {
    const locks = {
        '5': 'skills.lock.v5.json',
        '6': 'skills.lock.v6.json',
    };
    const defaultLock = 'skills.lock.json';

    it('v5 → 选中 skills.lock.v5.json', () => {
        const result = resolveLockPath('5', locks, defaultLock);
        assert.strictEqual(result, 'skills.lock.v5.json');
    });

    it('v6 → 选中 skills.lock.v6.json', () => {
        const result = resolveLockPath('6', locks, defaultLock);
        assert.strictEqual(result, 'skills.lock.v6.json');
    });

    it('版本无对应锁文件 → 降级到 default', () => {
        const result = resolveLockPath('7', locks, defaultLock);
        assert.strictEqual(result, 'skills.lock.json');
    });

    it('major=null → 降级到 default', () => {
        const result = resolveLockPath(null, locks, defaultLock);
        assert.strictEqual(result, 'skills.lock.json');
    });

    it('major 不在映射中 → 降级到 default', () => {
        const result = resolveLockPath('4', locks, defaultLock);
        assert.strictEqual(result, 'skills.lock.json');
    });

    it('空版本映射 → 降级到 default', () => {
        const result = resolveLockPath('5', {}, defaultLock);
        assert.strictEqual(result, 'skills.lock.json');
    });
});

describe('deployLockFile() — 部署锁文件到项目根目录为 skills.lock.json', () => {
    const locks = {
        '5': '/pkg/template/skills.lock.v5.json',
        '6': '/pkg/template/skills.lock.v6.json',
    };
    const defaultLock = '/pkg/template/skills.lock.json';

    it('v5 → 源 skills.lock.v5.json，目标 project/skills.lock.json', () => {
        const result = deployLockFile('5.1.0', locks, defaultLock, '/project');
        assert.strictEqual(result.source, '/pkg/template/skills.lock.v5.json');
        assert.strictEqual(result.target, '/project/skills.lock.json');
    });

    it('v6 → 源 skills.lock.v6.json，目标 project/skills.lock.json', () => {
        const result = deployLockFile('6.1.1', locks, defaultLock, '/project');
        assert.strictEqual(result.source, '/pkg/template/skills.lock.v6.json');
        assert.strictEqual(result.target, '/project/skills.lock.json');
    });

    it('版本无对应锁文件 → 降级 default，目标仍是 skills.lock.json', () => {
        const result = deployLockFile('7.0.0', locks, defaultLock, '/project');
        assert.strictEqual(result.source, '/pkg/template/skills.lock.json');
        assert.strictEqual(result.target, '/project/skills.lock.json');
    });

    it('无版本信息 → 降级 default，目标仍是 skills.lock.json', () => {
        const result = deployLockFile(null, locks, defaultLock, '/project');
        assert.strictEqual(result.source, '/pkg/template/skills.lock.json');
        assert.strictEqual(result.target, '/project/skills.lock.json');
    });

    it('不存在的版本号 → 降级 default', () => {
        const result = deployLockFile('0.0.1', locks, defaultLock, '/project');
        assert.strictEqual(result.source, '/pkg/template/skills.lock.json');
        assert.strictEqual(result.target, '/project/skills.lock.json');
    });

    it('目标路径始终以 skills.lock.json 结尾，无版本号', () => {
        const results = [
            deployLockFile('5.1.0', locks, defaultLock, '/a'),
            deployLockFile('6.1.1', locks, defaultLock, '/b'),
            deployLockFile(null, locks, defaultLock, '/c'),
        ];
        for (const r of results) {
            assert(r.target.endsWith('/skills.lock.json'), `target ${r.target} should end with skills.lock.json`);
            assert(!r.target.includes('v5'), `target ${r.target} should not contain v5`);
            assert(!r.target.includes('v6'), `target ${r.target} should not contain v6`);
        }
    });
});

describe('集成场景 — 完整 lock 选择 + 部署流程', () => {
    const locks = {
        '5': '/pkg/template/skills.lock.v5.json',
        '6': '/pkg/template/skills.lock.v6.json',
    };
    const defaultLock = '/pkg/template/skills.lock.json';
    const projectRoot = '/my-project';

    it('v5.1.0 → 选中 v5 源 → 部署到 project/skills.lock.json', () => {
        const result = deployLockFile('5.1.0', locks, defaultLock, projectRoot);
        assert.strictEqual(result.source, '/pkg/template/skills.lock.v5.json');
        assert.strictEqual(result.target, '/my-project/skills.lock.json');
    });

    it('v6.1.1 → 选中 v6 源 → 部署到 project/skills.lock.json', () => {
        const result = deployLockFile('6.1.1', locks, defaultLock, projectRoot);
        assert.strictEqual(result.source, '/pkg/template/skills.lock.v6.json');
        assert.strictEqual(result.target, '/my-project/skills.lock.json');
    });

    it('未知版本 → 降级 default → 部署到 project/skills.lock.json', () => {
        const result = deployLockFile('0.0.0', locks, defaultLock, projectRoot);
        assert.strictEqual(result.source, '/pkg/template/skills.lock.json');
        assert.strictEqual(result.target, '/my-project/skills.lock.json');
    });

    it('无 package.json 场景（version=null）→ 降级 default → 部署到 project/skills.lock.json', () => {
        const result = deployLockFile(null, locks, defaultLock, projectRoot);
        assert.strictEqual(result.source, '/pkg/template/skills.lock.json');
        assert.strictEqual(result.target, '/my-project/skills.lock.json');
    });
});
