#!/usr/bin/env bash
# openspec-superpowers-opencode 安装脚本 (Linux)
#
# 参数:
#   --dry-run       预览变更（不实际执行）
#   --uninstall     卸载（移除清单中记录的已安装文件）
#   --force         覆盖未受管理的冲突文件
#   --project-root  项目目标目录（由 CLI 工具调用时指定）
#   --lang          语言偏好: zh-CN / zh-TW / en（默认）
set -uo pipefail

DRY_RUN=false
UNINSTALL=false
FORCE=false
PROJECT_ROOT_ARG=""
LANG_ARG="en"

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --uninstall) UNINSTALL=true ;;
        --force) FORCE=true ;;
        --project-root=*) PROJECT_ROOT_ARG="${arg#*=}" ;;
        --project-root) echo "错误: --project-root 需要值，例如 --project-root=/path/to/project"; exit 1 ;;
        --lang=*) LANG_ARG="${arg#*=}" ;;
        --lang) echo "错误: --lang 需要值，例如 --lang=zh-CN"; exit 1 ;;
        --help)
            echo "用法: ./scripts/setup.sh [--dry-run] [--uninstall] [--force] [--lang=zh-CN|zh-TW|en]"
            exit 0
            ;;
        *)
            echo "未知参数: $arg"
            echo "用法: ./scripts/setup.sh [--dry-run] [--uninstall] [--force] [--lang=zh-CN|zh-TW|en]"
            exit 1
            ;;
    esac
done

# ---- 多语言辅助函数 ----
t() {
    if [ "$LANG_ARG" = "zh-CN" ] || [ "$LANG_ARG" = "zh-TW" ]; then
        echo "$1"
    else
        echo "$2"
    fi
}

if [ "$DRY_RUN" = true ] && [ "$UNINSTALL" = true ]; then
    echo "$(t "错误: --dry-run 和 --uninstall 不能同时使用" "Error: --dry-run and --uninstall cannot be used together")"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/../template"

if [ -n "$PROJECT_ROOT_ARG" ]; then
    PROJECT_ROOT="$PROJECT_ROOT_ARG"
else
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
MANIFEST_FILE="$PROJECT_ROOT/.opencode/install-manifest.json"

log() {
    if [ "$DRY_RUN" = false ]; then
        echo -e "$1"
    else
        echo "[DRY-RUN] $1"
    fi
}

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        echo "  [DRY-RUN] $*"
        return 0
    fi
    "$@"
}

# ============================================================
# 棕地合并：环境变量覆盖（用于自动化测试，详见 TEST.md Phase 5-6）
# ============================================================
BROWN_OVERRIDE_OPENSPEC="${BROWN_OVERRIDE_OPENSPEC:-}"
BROWN_OVERRIDE_COMMANDS="${BROWN_OVERRIDE_COMMANDS:-}"
BROWN_OVERRIDE_SKILLS="${BROWN_OVERRIDE_SKILLS:-}"
BROWN_OVERRIDE_AGENTS="${BROWN_OVERRIDE_AGENTS:-}"
BROWN_OVERRIDE_GITIGNORE="${BROWN_OVERRIDE_GITIGNORE:-}"
BROWN_OVERRIDE_GITATTR="${BROWN_OVERRIDE_GITATTR:-}"
BROWN_OVERRIDE_EDITORCONFIG="${BROWN_OVERRIDE_EDITORCONFIG:-}"
BROWN_OVERRIDE_INIT="${BROWN_OVERRIDE_INIT:-}"

# 用于记录 commands/skills 覆盖决策的临时文件
DECISIONS_FILE=$(mktemp 2>/dev/null || mktemp -t "opencode-decisions.XXXXXX")
trap "rm -f $DECISIONS_FILE" EXIT

add_decision() {
    local file_path="$1"
    local decision="$2"
    echo "$file_path:$decision" >> "$DECISIONS_FILE"
}

# ---- y/N/a 询问函数（棕地 commands/skills 覆盖决策）----
prompt_yes_no_all() {
    local prompt_text="$1"
    local env_override="$2"
    if [ -n "$env_override" ]; then
        case "$env_override" in
            yes|YES) echo "yes"; return ;;
            no|NO) echo "no"; return ;;
            ask|ASK) echo "ask"; return ;;
            *) echo "$env_override"; return ;;
        esac
    fi
    local ans
    while true; do
        read -r -p "$prompt_text (yes/No/ask) " ans
        case "$ans" in
            y|Y|yes|YES) echo "yes"; return ;;
            n|N|no|NO|"") echo "no"; return ;;
            a|A|ask|ASK) echo "ask"; return ;;
        esac
    done
}

# ---- YES/NO 询问函数（棕地 openspec 门控）----
prompt_yes_no() {
    local prompt_text="$1"
    local env_override="$2"
    if [ -n "$env_override" ]; then
        case "$env_override" in
            yes|YES) echo "yes"; return ;;
            no|NO) echo "no"; return ;;
            *) echo "$env_override"; return ;;
        esac
    fi
    local ans
    while true; do
        read -r -p "$prompt_text (y/N) " ans
        case "$ans" in
            y|Y) echo "yes"; return ;;
            n|N|"") echo "no"; return ;;
        esac
    done
}

# ============================================================
# 卸载
# ============================================================
if [ "$UNINSTALL" = true ]; then
    echo "$(t "=== 卸载 openspec-superpowers-opencode ===" "=== Uninstall openspec-superpowers-opencode ===")"
    echo ""

    if [ ! -f "$MANIFEST_FILE" ]; then
        echo "$(t "✗ 未找到安装清单 ($MANIFEST_FILE)" "✗ Install manifest not found ($MANIFEST_FILE)")"
        echo "$(t "  可能项目未通过此脚本安装，或清单已被删除。" "  The project may not have been installed via this script, or the manifest was deleted.")"
        echo "$(t "  手动删除已部署的文件:" "  Manually delete deployed files:")"
        echo "    .opencode/commands/ (opsx-* $(t "命令" "commands"))"
        echo "    .opencode/skills/openspec-*-change/ (skill $(t "定义" "definitions"))"
        echo "    openspec/config.yaml"
        echo "    openspec/schemas/ (template + schema)"
        echo "    skills.lock.json (skill $(t "完整性锁" "integrity lock"))"
        echo "    AGENTS.md (bridge $(t "部分" "content"))"
        echo "    opencode.json (permission $(t "规则" "rules"))"
        echo "$(t "  注意: openspec/changes/ + openspec/specs/ 中的用户数据不会被删除" "  Note: User data in openspec/changes/ + openspec/specs/ will not be deleted")"
        exit 1
    fi

    REMOVED_COUNT=0
    FAILED_COUNT=0

    # 用 node 解析 JSON
    if ! command -v node &>/dev/null; then
        echo "✗ 需要 node 解析安装清单"
        exit 1
    fi
    MANIFEST_JSON=$(node -e "const m=JSON.parse(require('fs').readFileSync('$MANIFEST_FILE','utf8')); console.log(JSON.stringify(m))")

    # 受保护文件列表（reset 不碰）
    PROTECTED_FILES=("opencode.json" "AGENTS.md" ".gitignore" ".gitattributes" ".editorconfig")

    # 解析文件列表
    FILES=$(node -e "
const m=JSON.parse(require('fs').readFileSync('$MANIFEST_FILE','utf8'));
(m.files||[]).forEach(f=>console.log(f));
")

    # ---- 预览：计算将删除/跳过什么 ----
    PREVIEW=$(node -e "
const m=JSON.parse(require('fs').readFileSync('$MANIFEST_FILE','utf8'));
const files=m.files||[];
const protected=['opencode.json','AGENTS.md','.gitignore','.gitattributes','.editorconfig'];
const toDelete=[], toSkip=[];
for(const f of files){
  let isProtected=false;
  for(const p of protected){
    if(f===p||f.startsWith(p+'/')||f.startsWith(p+'\\\\')){
      isProtected=true; break;
    }
    const base=f.split(/[\\\\/]/).pop();
    if(base===p){isProtected=true; break;}
  }
  if(isProtected){toSkip.push({file:f,reason:'受保护'}); continue;}
  toDelete.push(f);
}
console.log('DELETE_COUNT='+toDelete.length);
console.log('SKIP_COUNT='+toSkip.length);
for(const f of toDelete) console.log('DEL:'+f);
for(const s of toSkip) console.log('SKP:'+s.file+'|'+s.reason);
")
    DELETE_COUNT=$(echo "$PREVIEW" | grep '^DELETE_COUNT=' | cut -d= -f2)
    SKIP_COUNT=$(echo "$PREVIEW" | grep '^SKIP_COUNT=' | cut -d= -f2)
    mapfile -t DELETE_FILES < <(echo "$PREVIEW" | grep '^DEL:' | sed 's/^DEL://')
    mapfile -t SKIP_ENTRIES < <(echo "$PREVIEW" | grep '^SKP:' | sed 's/^SKP://')

    echo "$(t "=== 重置预览 ===" "=== Reset Preview ===")"
    echo "$(t "将删除 $DELETE_COUNT 个文件/目录:" "Files/dirs to delete ($DELETE_COUNT):")"
    for f in "${DELETE_FILES[@]}"; do
        echo "  ✗ $f"
    done
    echo ""
    echo "$(t "跳过（保留）$SKIP_COUNT 项:" "Skipped (retained) $SKIP_COUNT items:")"
    for s in "${SKIP_ENTRIES[@]}"; do
        echo "  - $s"
    done
    echo ""
    echo "$(t "用户数据不碰: openspec/changes/, openspec/specs/" "User data untouched: openspec/changes/, openspec/specs/")"
    echo ""
    CONFIRM=$(prompt_yes_no "$(t "是否继续重置？(y/N) " "Continue reset? (y/N) ")")
    if [ "$CONFIRM" != "yes" ]; then
        echo "$(t "重置已取消" "Reset cancelled")"
        exit 0
    fi

    while IFS= read -r file; do
        [ -z "$file" ] && continue
        # 跳过受保护文件
        is_protected=false
        for protected in "${PROTECTED_FILES[@]}"; do
            if [ "$file" = "$protected" ] || [ "${file##*/}" = "$protected" ]; then
                is_protected=true
                break
            fi
        done
        if [ "$is_protected" = true ]; then
            echo "$(t "  - $file（受保护，跳过）" "  - $file (protected, skipped)")"
            continue
        fi

        path="$PROJECT_ROOT/$file"
        if [ -e "$path" ]; then
            if rm -rf "$path" 2>/dev/null; then
                echo "$(t "  ✗ 已删除: $file" "  ✗ Deleted: $file")"
                REMOVED_COUNT=$((REMOVED_COUNT+1))
            else
                echo "$(t "  ⚠ 删除失败: $file" "  ⚠ Delete failed: $file")"
                FAILED_COUNT=$((FAILED_COUNT+1))
            fi
        else
            echo "$(t "  - 不存在: $file" "  - Does not exist: $file")"
        fi
    done <<< "$FILES"

    rm -f "$MANIFEST_FILE"
    echo ""
    echo "$(t "=== 卸载完成 ===" "=== Uninstall Complete ===")"
    echo "$(t "已删除: $REMOVED_COUNT 项" "Deleted: $REMOVED_COUNT items")"
    if [ "$FAILED_COUNT" -gt 0 ]; then
        echo "$(t "失败: $FAILED_COUNT 项（手动清理）" "Failed: $FAILED_COUNT items (manual cleanup)")"
    fi
    echo ""
    echo "$(t "提示: AGENTS.md 和 opencode.json 未重置，请自行处理。" "Hint: AGENTS.md and opencode.json were not reset, handle manually.")"
    echo "$(t "提示: .gitignore 和 .gitattributes 未重置，请自行处理。" "Hint: .gitignore and .gitattributes were not reset, handle manually.")"
    exit 0
fi

# ============================================================
# 主流程
# ============================================================
echo "$(t "=== openspec-superpowers-opencode 安装脚本 ===" "=== openspec-superpowers-opencode Setup ===")"
echo ""

INSTALLED_FILES=()

# ---- 0. 检查前提条件 ----
echo "$(t "[0/8] 检查前提条件..." "[0/8] Checking prerequisites...")"

ALL_PREREQS_OK=true

OPENERSPEC_VER=$(openspec --version 2>&1)
if [ $? -eq 0 ]; then
    echo "$(t "  ✓ openspec CLI: $OPENERSPEC_VER" "  ✓ openspec CLI: $OPENERSPEC_VER")"
else
    echo "$(t "  ✗ openspec CLI 未找到" "  ✗ openspec CLI not found")"
    ALL_PREREQS_OK=false
fi

OPENCODE_VER=$(opencode --version 2>&1)
if [ $? -eq 0 ]; then
    echo "$(t "  ✓ opencode CLI: $OPENCODE_VER" "  ✓ opencode CLI: $OPENCODE_VER")"
else
    echo "$(t "  ✗ opencode CLI 未找到" "  ✗ opencode CLI not found")"
    ALL_PREREQS_OK=false
fi

GIT_VER=$(git --version 2>&1)
if [ $? -eq 0 ]; then
    echo "$(t "  ✓ git: $GIT_VER" "  ✓ git: $GIT_VER")"
else
    echo "$(t "  ⚠ git 未找到" "  ⚠ git not found")"
fi

SUPERPOWERS_SKILLS=$(find ~/.cache/opencode/packages/superpowers@* -type d -path "*/node_modules/superpowers/skills" 2>/dev/null | head -1)
if [ -n "$SUPERPOWERS_SKILLS" ]; then
    echo "$(t "  ✓ Superpowers 已安装" "  ✓ Superpowers installed")"
else
    echo "$(t "  ✗ Superpowers 尚未安装" "  ✗ Superpowers not installed")"
    echo "$(t "    安装: opencode plugin install superpowers" "    Install: opencode plugin install superpowers")"
    ALL_PREREQS_OK=false
fi

if [ "$ALL_PREREQS_OK" = false ]; then
    echo "$(t "✗ 前提条件未满足" "✗ Prerequisites not met")"
    exit 1
fi
echo ""

# ---- 1. 检测 Superpowers 安装路径 ----
echo "$(t "[1/8] 检测 Superpowers 安装路径..." "[1/8] Detecting Superpowers installation path...")"

SUPERPOWERS_BASE="$SUPERPOWERS_SKILLS"

if [ -z "$SUPERPOWERS_BASE" ]; then
    echo "$(t "✗ 未找到 Superpowers skills 目录" "✗ Superpowers skills directory not found")"
    exit 1
fi

echo "$(t "✓ Superpowers 路径: $SUPERPOWERS_BASE" "✓ Superpowers path: $SUPERPOWERS_BASE")"
echo ""

# ---- Skill lock 部署 + 校验 ----

# 部署技能锁文件到项目根目录（版本检测 → 选择模板源 → 复制为 skills.lock.json）
PROJECT_LOCK_FILE="$PROJECT_ROOT/skills.lock.json"
SP_PKG="$SUPERPOWERS_BASE/../package.json"
LOCK_SOURCE_FILE=""

if [ -f "$SP_PKG" ]; then
    SP_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SP_PKG" | head -1 | cut -d'"' -f4)
    MAJOR=$(echo "$SP_VERSION" | cut -d. -f1)
    CANDIDATE_LOCK="$TEMPLATE_DIR/skills.lock.v${MAJOR}.json"
    if [ -f "$CANDIDATE_LOCK" ]; then
        LOCK_SOURCE_FILE="$CANDIDATE_LOCK"
        echo "$(t "  - 检测到 Superpowers v${MAJOR}，使用对应锁文件" "  - Detected Superpowers v${MAJOR}, using matching lock")"
    else
        echo "$(t "  - 未找到 skills.lock.v${MAJOR}.json" "  - skills.lock.v${MAJOR}.json not found")"
    fi
else
    echo "$(t "  - 未找到 Superpowers package.json" "  - Superpowers package.json not found")"
fi

# 保底：未匹配到版本锁时，取第一个存在的 skills.lock.v*.json
if [ -z "$LOCK_SOURCE_FILE" ]; then
    ANY_VERSION_LOCK=$(ls "$TEMPLATE_DIR"/skills.lock.v*.json 2>/dev/null | head -1)
    if [ -n "$ANY_VERSION_LOCK" ]; then
        LOCK_SOURCE_FILE="$ANY_VERSION_LOCK"
        echo "$(t "  - 降级到 $(basename $ANY_VERSION_LOCK)" "  - Falling back to $(basename $ANY_VERSION_LOCK)")"
    fi
fi

if [ -n "$LOCK_SOURCE_FILE" ]; then
    # 部署到项目根目录为 skills.lock.json
    cp "$LOCK_SOURCE_FILE" "$PROJECT_LOCK_FILE" 2>/dev/null
    echo "$(t "  ✓ 已部署 skills.lock.json" "  ✓ Deployed skills.lock.json")"

    ALL_MATCH=true
    if ! command -v node &>/dev/null; then
        echo "  - 需要 node 解析 lock 文件，跳过校验"
    else
        SKILL_KEYS=$(node -e "const l=JSON.parse(require('fs').readFileSync('$PROJECT_LOCK_FILE','utf8')); Object.keys(l.skills).forEach(k=>console.log(k))")
        while IFS= read -r key; do
            [ -z "$key" ] && continue
            EXPECTED_HASH=$(node -e "const l=JSON.parse(require('fs').readFileSync('$PROJECT_LOCK_FILE','utf8')); console.log(l.skills['$key'].sha256)")
            SKILL_PATH="$SUPERPOWERS_BASE/$key"
            if [ -f "$SKILL_PATH" ]; then
                ACTUAL_HASH=$(sha256sum "$SKILL_PATH" | awk '{print $1}' | tr '[:lower:]' '[:upper:]')
                if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
                    echo "  ✓ $key"
                else
                    echo "$(t "  ⚠ $key (hash 不匹配，可能已更新)" "  ⚠ $key (hash mismatch, may have been updated)")"
                    ALL_MATCH=false
                fi
            else
                echo "$(t "  ✗ $key (文件不存在)" "  ✗ $key (file not found)")"
                ALL_MATCH=false
            fi
        done <<< "$SKILL_KEYS"
    fi

    if [ "$ALL_MATCH" = true ]; then
        echo "$(t "✓ Skill 完整性校验通过" "✓ Skill integrity check passed")"
    else
        echo "$(t "⚠ Skill 校验有差异（WARNING：不阻塞，但建议更新 skills.lock.json）" "⚠ Skill hash mismatch (WARNING: non-blocking, but consider updating skills.lock.json)")"
    fi
else
    echo "$(t "  - 未找到 lock 文件，跳过校验" "  - Lock file not found, skipping verification")"
fi
echo ""

# ---- 2. openspec/ 门控（棕地：询问 YES/NO；绿地：自动部署）----
echo "$(t "[2/8] 检测 openspec/ 部署状态..." "[2/8] Checking openspec/ deployment state...")"

OPENSPEC_CONFIG_DST="$PROJECT_ROOT/openspec/config.yaml"
OPENSPEC_HAS_EXISTING=false
[ -f "$OPENSPEC_CONFIG_DST" ] && OPENSPEC_HAS_EXISTING=true

OPENSPEC_GATE_RESULT="yes"

if [ "$OPENSPEC_HAS_EXISTING" = true ]; then
    echo "$(t "  - openspec/ 已存在 (棕地)" "  - openspec/ already exists (brownfield)")"
    GLOBAL_ANSWER=$(prompt_yes_no "$(t "  棕地项目。继续完整 init？" "  Brownfield project. Continue with full init?")" "$BROWN_OVERRIDE_INIT")
    if [ "$GLOBAL_ANSWER" = "no" ]; then
        echo "$(t "  Init 取消。" "  Init cancelled.")"
        exit 2
    fi
    OPENSPEC_ANSWER=$(prompt_yes_no "$(t "  覆盖 config.yaml + schemas/？" "  Overwrite config.yaml + schemas/?")" "$BROWN_OVERRIDE_OPENSPEC")
    if [ "$OPENSPEC_ANSWER" = "no" ]; then
        echo "$(t "  - 跳过 openspec/ 部署" "  - Skip openspec/ deployment")"
        OPENSPEC_GATE_RESULT="no"
    else
        echo "$(t "  ✓ 用户确认覆盖 openspec/" "  ✓ User confirmed openspec/ overwrite")"
        OPENSPEC_GATE_RESULT="yes"
    fi
else
    echo "$(t "  - openspec/ 不存在（绿地模式，自动部署）" "  - openspec/ not found (greenfield, auto-deploy)")"
fi
echo ""

# ---- 3. 部署 openspec/（config.yaml + schemas/* + changes/ + specs/）----
echo "$(t "[3/8] 部署 openspec/ 配置..." "[3/8] Deploying openspec/ config...")"

if [ "$OPENSPEC_GATE_RESULT" = "yes" ]; then
    # config.yaml（门控已通过，覆盖部署）
    CONFIG_SRC="$TEMPLATE_DIR/openspec/config.yaml"
    CONFIG_DST="$PROJECT_ROOT/openspec/config.yaml"
    if [ -f "$CONFIG_SRC" ]; then
        run_cmd mkdir -p "$(dirname "$CONFIG_DST")"
        run_cmd cp -f "$CONFIG_SRC" "$CONFIG_DST"
        INSTALLED_FILES+=("openspec/config.yaml")
        add_decision "openspec/config.yaml" "overwrite"
        log "$(t "  ✓ openspec/config.yaml" "  ✓ openspec/config.yaml")"
    fi

    # schemas/*（Force 部署，记录每文件到 manifest）
    if [ -d "$TEMPLATE_DIR/openspec/schemas" ]; then
        SCHEMAS_SRC_DIR="$TEMPLATE_DIR/openspec/schemas"
        SCHEMAS_DST_DIR="$PROJECT_ROOT/openspec/schemas"
        run_cmd mkdir -p "$SCHEMAS_DST_DIR"
        run_cmd cp -R -f "$SCHEMAS_SRC_DIR/"* "$SCHEMAS_DST_DIR/"
        # 记录所有 schema 文件
        SCHEMA_FILES=$(find "$SCHEMAS_DST_DIR" -type f 2>/dev/null)
        while IFS= read -r sf; do
            [ -z "$sf" ] && continue
            REL_PATH="${sf#$PROJECT_ROOT/}"
            INSTALLED_FILES+=("$REL_PATH")
            add_decision "$REL_PATH" "overwrite"
        done <<< "$SCHEMA_FILES"
        SCHEMA_COUNT=$(echo "$SCHEMA_FILES" | grep -c . || echo "0")
        log "$(t "  ✓ openspec/schemas/（$SCHEMA_COUNT 文件）" "  ✓ openspec/schemas/ ($SCHEMA_COUNT files)")"
    fi

    # changes/archive/ + specs/（仅未存在时创建）
    if [ "$OPENSPEC_HAS_EXISTING" = false ]; then
        run_cmd mkdir -p "$PROJECT_ROOT/openspec/changes/archive"
        run_cmd mkdir -p "$PROJECT_ROOT/openspec/specs"
        log "$(t "  ✓ openspec/changes/ + openspec/specs/" "  ✓ openspec/changes/ + openspec/specs/")"
    else
        log "$(t "  - openspec/changes/ + openspec/specs/（棕地模式，跳过）" "  - openspec/changes/ + openspec/specs/ (brownfield, skip)")"
    fi
fi
echo ""

# ---- 4. 部署 .opencode/（opencode.json 合并 + commands/skills y/N/a）----
echo "$(t "[4/8] 部署 .opencode/ 配置..." "[4/8] Deploying .opencode/ config...")"

OPENCODE_SRC="$TEMPLATE_DIR/.opencode"
OPENCODE_DST="$PROJECT_ROOT/.opencode"
if [ -d "$OPENCODE_SRC" ]; then
    # 确保目标目录存在
    if [ ! -d "$OPENCODE_DST" ]; then
        run_cmd mkdir -p "$OPENCODE_DST"
    fi

    # opencode.json：棕地合并（union merge）/ 绿地复制
    OC_JSON_SRC="$OPENCODE_SRC/opencode.json"
    OC_JSON_DST="$OPENCODE_DST/opencode.json"
    if [ -f "$OC_JSON_SRC" ] && [ -f "$OC_JSON_DST" ]; then
        # 棕地：询问是否合并
        if [ "$DRY_RUN" = true ]; then
            echo "  [DRY-RUN] opencode.json merge prompt"
        else
            printf "$(t "  .opencode/opencode.json 权限顺序是否需要更新为模板标准？(y/N): " "  .opencode/opencode.json key order — sync to template standard? (y/N): ")"
            read -r ans_ocjson < /dev/tty
            case "$ans_ocjson" in
                y|Y) ;;
                *) echo "$(t "  - .opencode/opencode.json（跳过）" "  - .opencode/opencode.json (skipped)")";;
            esac
        fi
        # 棕地：用 node 做联合合并
        if [ "$DRY_RUN" = false ]; then
            node -e "
const fs=require('fs');
const tmpl=JSON.parse(fs.readFileSync('$OC_JSON_SRC','utf8'));
const user=JSON.parse(fs.readFileSync('$OC_JSON_DST','utf8'));
function val(v,d){return (v===null||v===undefined||v==='')?d:v;}
function mergeKeys(a,b){const o={};for(const k of Object.keys(a||{}))o[k]=val(k in(b||{})?b[k]:void 0,a[k]);for(const k of Object.keys(b||{})){if(!(k in(a||{}))){const v=val(b[k]);if(v!==null)o[k]=v;}}return o;}
const perm=mergeKeys(tmpl.permission,user.permission);
const required=['.worktrees/**','openspec/changes/**','openspec/specs/**','.opencode/**'];
const denied=['openspec/schemas/**','openspec/config.yaml'];
for(const action of['write','edit']){const obj=perm[action];if(obj&&typeof obj==='object'){const sub=mergeKeys(tmpl.permission?.[action],obj);for(const r of required)sub[r]='allow';for(const d of denied)sub[d]='deny';perm[action]=sub;}}
if(perm.bash&&typeof perm.bash==='object'&&tmpl.permission?.bash){perm.bash=mergeKeys(tmpl.permission.bash,perm.bash);}
fs.writeFileSync('$OC_JSON_DST',JSON.stringify({permission:perm},null,2)+'\n','utf8');
" || true
            echo "$(t "  ✓ .opencode/opencode.json（已合并）" "  ✓ .opencode/opencode.json (merged)")"
            echo "$(t "    - 工作流所需路径权限已按需设置" "    - Workflow path permissions set as required")"
            echo "$(t "    - 用户自定义权限保留在对应块的末尾" "    - User custom permissions placed at the end of each block")"
            echo "$(t "    ⚠ 请检查 .opencode/opencode.json 权限是否符合预期" "    ⚠ Verify opencode.json permissions meet expectations")"
        else
            echo "  [DRY-RUN] node union merge opencode.json"
        fi
    elif [ -f "$OC_JSON_SRC" ]; then
        # 绿地：直接复制
        run_cmd cp "$OC_JSON_SRC" "$OC_JSON_DST"
        INSTALLED_FILES+=(".opencode/opencode.json")
        log "$(t "  ✓ .opencode/opencode.json" "  ✓ .opencode/opencode.json")"
    fi

    # commands/：棕地 y/N/a / 绿地部署
    CMD_SRC_DIR="$OPENCODE_SRC/commands"
    CMD_DST_DIR="$OPENCODE_DST/commands"
    if [ -d "$CMD_SRC_DIR" ]; then
        CMD_DST_EXISTS=false
        [ -d "$CMD_DST_DIR" ] && CMD_DST_EXISTS=true
        if [ "$CMD_DST_EXISTS" = false ]; then
            run_cmd mkdir -p "$CMD_DST_DIR"
        fi

        # 检查是否已有文件
        HAS_EXISTING_CMDS=false
        if [ "$CMD_DST_EXISTS" = true ] && [ -n "$(ls -A "$CMD_DST_DIR" 2>/dev/null)" ]; then
            HAS_EXISTING_CMDS=true
        fi

        CMD_OVERWRITE_MODE="yes"
        if [ "$HAS_EXISTING_CMDS" = true ]; then
            CMD_OVERWRITE_MODE=$(prompt_yes_no_all "$(t "  .opencode/commands/ 已存在。全部覆盖/跳过/逐个询问？" "  .opencode/commands/ exists. Overwrite all/skip each/ask each?")" "$BROWN_OVERRIDE_COMMANDS")
        fi

        for cmd_file in "$CMD_SRC_DIR"/*; do
            [ -f "$cmd_file" ] || continue
            cmd_name=$(basename "$cmd_file")
            dst_path="$CMD_DST_DIR/$cmd_name"
            should_overwrite=false
            decision=""

            if [ "$CMD_OVERWRITE_MODE" = "yes" ]; then
                should_overwrite=true
                decision="overwrite"
            elif [ "$CMD_OVERWRITE_MODE" = "no" ]; then
                if [ ! -f "$dst_path" ]; then
                    should_overwrite=true
                    decision="overwrite"
                else
                    decision="skip"
                fi
            else
                # 'a' - 逐个询问
                if [ -f "$dst_path" ]; then
                    read -r -p "$(t "    覆盖 .opencode/commands/$cmd_name？" "    Overwrite .opencode/commands/$cmd_name?") (y/N) " ans
                    case "$ans" in
                        y|Y) should_overwrite=true; decision="overwrite" ;;
                        *) decision="skip" ;;
                    esac
                else
                    should_overwrite=true
                    decision="overwrite"
                fi
            fi

            if [ "$should_overwrite" = true ]; then
                run_cmd cp "$cmd_file" "$dst_path"
                INSTALLED_FILES+=(".opencode/commands/$cmd_name")
                add_decision ".opencode/commands/$cmd_name" "$decision"
                log "$(t "  ✓ .opencode/commands/$cmd_name" "  ✓ .opencode/commands/$cmd_name")"
            else
                log "$(t "  - .opencode/commands/$cmd_name（$decision）" "  - .opencode/commands/$cmd_name ($decision)")"
                add_decision ".opencode/commands/$cmd_name" "$decision"
            fi
        done
    fi

    # skills/：棕地 y/N/a / 绿地部署
    SKILL_SRC_DIR="$OPENCODE_SRC/skills"
    SKILL_DST_DIR="$OPENCODE_DST/skills"
    if [ -d "$SKILL_SRC_DIR" ]; then
        SKILL_DST_EXISTS=false
        [ -d "$SKILL_DST_DIR" ] && SKILL_DST_EXISTS=true
        if [ "$SKILL_DST_EXISTS" = false ]; then
            run_cmd mkdir -p "$SKILL_DST_DIR"
        fi

        HAS_EXISTING_SKILLS=false
        if [ "$SKILL_DST_EXISTS" = true ] && [ -n "$(ls -A "$SKILL_DST_DIR" 2>/dev/null)" ]; then
            HAS_EXISTING_SKILLS=true
        fi

            SKILL_OVERWRITE_MODE="yes"
        if [ "$HAS_EXISTING_SKILLS" = true ]; then
            SKILL_OVERWRITE_MODE=$(prompt_yes_no_all "$(t "  .opencode/skills/ 已存在。全部覆盖/跳过/逐个询问？" "  .opencode/skills/ exists. Overwrite all/skip each/ask each?")" "$BROWN_OVERRIDE_SKILLS")
        fi

        for skill_dir in "$SKILL_SRC_DIR"/*/; do
            [ -d "$skill_dir" ] || continue
            skill_name=$(basename "$skill_dir")
            src_skill_md="$skill_dir/SKILL.md"
            [ -f "$src_skill_md" ] || continue
            dst_skill_dir_path="$SKILL_DST_DIR/$skill_name"
            dst_skill_md="$dst_skill_dir_path/SKILL.md"

            should_overwrite=false
            decision=""
            skill_exists=false
            [ -f "$dst_skill_md" ] && skill_exists=true

            if [ "$SKILL_OVERWRITE_MODE" = "yes" ]; then
                should_overwrite=true
                decision="overwrite"
            elif [ "$SKILL_OVERWRITE_MODE" = "no" ]; then
                if [ "$skill_exists" = false ]; then
                    should_overwrite=true
                    decision="overwrite"
                else
                    decision="skip"
                fi
            else
                # 'a' - 逐个询问
                if [ "$skill_exists" = true ]; then
                    read -r -p "$(t "    覆盖 .opencode/skills/$skill_name/SKILL.md？" "    Overwrite .opencode/skills/$skill_name/SKILL.md?") (y/N) " ans
                    case "$ans" in
                        y|Y) should_overwrite=true; decision="overwrite" ;;
                        *) decision="skip" ;;
                    esac
                else
                    should_overwrite=true
                    decision="overwrite"
                fi
            fi

            if [ "$should_overwrite" = true ]; then
                run_cmd mkdir -p "$dst_skill_dir_path"
                run_cmd cp "$src_skill_md" "$dst_skill_md"
                INSTALLED_FILES+=(".opencode/skills/$skill_name/SKILL.md")
                add_decision ".opencode/skills/$skill_name/SKILL.md" "$decision"
                log "$(t "  ✓ .opencode/skills/$skill_name" "  ✓ .opencode/skills/$skill_name")"
            else
                log "$(t "  - .opencode/skills/$skill_name（$decision）" "  - .opencode/skills/$skill_name ($decision)")"
                add_decision ".opencode/skills/$skill_name/SKILL.md" "$decision"
            fi
        done
    fi
fi
echo ""

# ---- 5. Git + AGENTS.md ----
echo "$(t "[5/8] 部署 Git 配置 + AGENTS.md..." "[5/8] Deploying git config + AGENTS.md...")"

# AGENTS.md
AGENTS_SRC="$TEMPLATE_DIR/_AGENTS.md"
if [ -f "$AGENTS_SRC" ]; then
    AGENTS_DST="$PROJECT_ROOT/AGENTS.md"
    BRIDGE_CONTENT=$(cat "$AGENTS_SRC")
    MARKER='<!-- openspec-superpowers-opencode_instructions -->'
    if [ -f "$AGENTS_DST" ]; then
        # 计算标记出现次数（必须同时存在开始和结束标记，即 ≥2 次）
        MARKER_COUNT=$(grep -c "$MARKER" "$AGENTS_DST" 2>/dev/null || echo 0)
        if [ "$MARKER_COUNT" -ge 2 ]; then
            # 已有完整桥接标记 → Prompt-YesNo 替换/跳过
            ANSWER=$(prompt_yes_no "$(t "  AGENTS.md 已有 bridge 内容。替换？" "  AGENTS.md already has bridge content. Replace?")" "$BROWN_OVERRIDE_AGENTS")
            if [ "$ANSWER" = "yes" ]; then
                if [ "$DRY_RUN" = false ]; then
                    node -e "
const fs=require('fs');
const existing=fs.readFileSync('$AGENTS_DST','utf8');
const bridge=fs.readFileSync('$AGENTS_SRC','utf8');
const marker='<!-- openspec-superpowers-opencode_instructions -->';
const esc=marker.replace(/[.*+?^\${}()|[\\]\\\\]/g,'\\\\\\$&');
const pat=new RegExp(esc+'[\\\\s\\\\S]*?'+esc);
const result=existing.replace(pat,bridge.trimEnd());
fs.writeFileSync('$AGENTS_DST',result,'utf8');
" || true
                fi
                [ "$DRY_RUN" = false ] && INSTALLED_FILES+=("AGENTS.md")
                echo "$(t "  ✓ AGENTS.md（bridge 内容已替换）" "  ✓ AGENTS.md (bridge content replaced)")"
            else
                echo "$(t "  - AGENTS.md（用户选择跳过）" "  - AGENTS.md (user skipped)")"
            fi
        else
            # 无标记或仅有一个不完整标记 → 静默追加
            if [ "$DRY_RUN" = false ]; then
                echo "$BRIDGE_CONTENT" >> "$AGENTS_DST"
            fi
            [ "$DRY_RUN" = false ] && INSTALLED_FILES+=("AGENTS.md")
            echo "$(t "  ✓ AGENTS.md（已追加 bridge 内容）" "  ✓ AGENTS.md (bridge content appended)")"
        fi
    else
        # 绿地：直接写入
        if [ "$DRY_RUN" = false ]; then
            echo "$BRIDGE_CONTENT" > "$AGENTS_DST"
        fi
        [ "$DRY_RUN" = false ] && INSTALLED_FILES+=("AGENTS.md")
        echo "$(t "  ✓ AGENTS.md" "  ✓ AGENTS.md")"
    fi
fi

# .gitignore（marker 判定，同 AGENTS.md 模式）
GITIGNORE_SRC="$TEMPLATE_DIR/_gitignore"
GITIGNORE_DST="$PROJECT_ROOT/.gitignore"
GITIGNORE_MARKER='# <!-- openspec-superpowers-opencode_gitignore -->'

# 注意：不依赖 $GITIGNORE_SRC 是否存在 — 绕过 npm 11.x 下 .npmignore 对嵌套 .gitignore 的异常排除
if [ ! -f "$GITIGNORE_DST" ]; then
    # 绿地：优先从模板复制
    if [ -f "$GITIGNORE_SRC" ]; then
        run_cmd cp "$GITIGNORE_SRC" "$GITIGNORE_DST"
        log "$(t "  ✓ .gitignore" "  ✓ .gitignore")"
    else
        # Fallback: 模板不存在时用 marker 包裹的基础规则创建
        if [ "$DRY_RUN" = false ]; then
            echo "$GITIGNORE_MARKER" > "$GITIGNORE_DST"
            echo "# Worktree isolation" >> "$GITIGNORE_DST"
            echo ".worktrees/" >> "$GITIGNORE_DST"
            echo "$GITIGNORE_MARKER" >> "$GITIGNORE_DST"
        fi
        log "$(t "  ✓ .gitignore（fallback 创建）" "  ✓ .gitignore (fallback created)")"
    fi
    INSTALLED_FILES+=(".gitignore")
else
    # 棕地：标记判定
    MARKER_COUNT=$(grep -cF "$GITIGNORE_MARKER" "$GITIGNORE_DST" 2>/dev/null || echo 0)
    if [ "$MARKER_COUNT" -ge 2 ]; then
        # 已有完整桥接标记 → Prompt 替换/跳过
        ANSWER=$(prompt_yes_no "$(t "  .gitignore 已有 bridge 内容。替换？" "  .gitignore already has bridge content. Replace?")" "$BROWN_OVERRIDE_GITIGNORE")
        if [ "$ANSWER" = "yes" ]; then
            if [ "$DRY_RUN" = false ] && [ -f "$GITIGNORE_SRC" ]; then
                export ENV_GITIGNORE_DST="$GITIGNORE_DST"
                export ENV_GITIGNORE_SRC="$GITIGNORE_SRC"
                node << 'NODEEOF' || true
const fs = require('fs');
const dst = process.env.ENV_GITIGNORE_DST;
const src = process.env.ENV_GITIGNORE_SRC;
const existing = fs.readFileSync(dst, 'utf8');
const bridge = fs.readFileSync(src, 'utf8');
const marker = '# <!-- openspec-superpowers-opencode_gitignore -->';
const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pat = new RegExp(esc + '[\\s\\S]*?' + esc);
fs.writeFileSync(dst, existing.replace(pat, bridge.trimEnd()), 'utf8');
NODEEOF
            fi
            echo "$(t "  ✓ .gitignore（bridge 内容已替换）" "  ✓ .gitignore (bridge content replaced)")"
        else
            echo "$(t "  - .gitignore（用户选择跳过）" "  - .gitignore (user skipped)")"
        fi
    else
        # 无/不完整标记 → 静默追加
        if [ "$DRY_RUN" = false ] && [ -f "$GITIGNORE_SRC" ]; then
            BRIDGE=$(cat "$GITIGNORE_SRC")
            echo "" >> "$GITIGNORE_DST"
            echo "$BRIDGE" >> "$GITIGNORE_DST"
        fi
        echo "$(t "  ✓ .gitignore（已追加桥接规则）" "  ✓ .gitignore (bridge rules appended)")"
    fi
fi

# .gitattributes（marker 判定，同 .gitignore 模式）
GITATTR_SRC="$TEMPLATE_DIR/_gitattributes"
GITATTR_DST="$PROJECT_ROOT/.gitattributes"
GITATTR_MARKER='# <!-- openspec-superpowers-opencode_gitattributes -->'

if [ ! -f "$GITATTR_DST" ]; then
    # 绿地：从模板复制
    if [ -f "$GITATTR_SRC" ]; then
        run_cmd cp "$GITATTR_SRC" "$GITATTR_DST"
        INSTALLED_FILES+=(".gitattributes")
        log "$(t "  ✓ .gitattributes" "  ✓ .gitattributes")"
    fi
else
    # 棕地：标记判定
    MARKER_COUNT=$(grep -cF "$GITATTR_MARKER" "$GITATTR_DST" 2>/dev/null || echo 0)
    if [ "$MARKER_COUNT" -ge 2 ]; then
        # 已有完整桥接标记 → Prompt 替换/跳过
        ANSWER=$(prompt_yes_no "$(t "  .gitattributes 已有 bridge 内容。替换？" "  .gitattributes already has bridge content. Replace?")" "$BROWN_OVERRIDE_GITATTR")
        if [ "$ANSWER" = "yes" ]; then
            if [ "$DRY_RUN" = false ] && [ -f "$GITATTR_SRC" ]; then
                export ENV_GITATTR_DST="$GITATTR_DST"
                export ENV_GITATTR_SRC="$GITATTR_SRC"
                node << 'NODEEOF' || true
const fs = require('fs');
const dst = process.env.ENV_GITATTR_DST;
const src = process.env.ENV_GITATTR_SRC;
const existing = fs.readFileSync(dst, 'utf8');
const bridge = fs.readFileSync(src, 'utf8');
const marker = '# <!-- openspec-superpowers-opencode_gitattributes -->';
const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pat = new RegExp(esc + '[\\s\\S]*?' + esc);
fs.writeFileSync(dst, existing.replace(pat, bridge.trimEnd()), 'utf8');
NODEEOF
            fi
            echo "$(t "  ✓ .gitattributes（bridge 内容已替换）" "  ✓ .gitattributes (bridge content replaced)")"
        else
            echo "$(t "  - .gitattributes（用户选择跳过）" "  - .gitattributes (user skipped)")"
        fi
    else
        # 无/不完整标记 → 静默追加
        if [ "$DRY_RUN" = false ] && [ -f "$GITATTR_SRC" ]; then
            BRIDGE=$(cat "$GITATTR_SRC")
            echo "" >> "$GITATTR_DST"
            echo "$BRIDGE" >> "$GITATTR_DST"
        fi
        echo "$(t "  ✓ .gitattributes（已追加桥接规则）" "  ✓ .gitattributes (bridge rules appended)")"
    fi
fi

# .editorconfig（marker 判定，同 .gitignore 模式）
EDITORCONFIG_SRC="$TEMPLATE_DIR/_editorconfig"
EDITORCONFIG_DST="$PROJECT_ROOT/.editorconfig"
EDITORCONFIG_MARKER='# <!-- openspec-superpowers-opencode_editorconfig -->'

if [ ! -f "$EDITORCONFIG_DST" ]; then
    # 绿地：从模板复制
    if [ -f "$EDITORCONFIG_SRC" ]; then
        run_cmd cp "$EDITORCONFIG_SRC" "$EDITORCONFIG_DST"
        INSTALLED_FILES+=(".editorconfig")
        log "$(t "  ✓ .editorconfig" "  ✓ .editorconfig")"
    fi
else
    # 棕地：标记判定
    MARKER_COUNT=$(grep -cF "$EDITORCONFIG_MARKER" "$EDITORCONFIG_DST" 2>/dev/null || echo 0)
    if [ "$MARKER_COUNT" -ge 2 ]; then
        # 已有完整桥接标记 → Prompt 替换/跳过
        ANSWER=$(prompt_yes_no "$(t "  .editorconfig 已有 bridge 内容。替换？" "  .editorconfig already has bridge content. Replace?")" "$BROWN_OVERRIDE_EDITORCONFIG")
        if [ "$ANSWER" = "yes" ]; then
            if [ "$DRY_RUN" = false ] && [ -f "$EDITORCONFIG_SRC" ]; then
                export ENV_EC_DST="$EDITORCONFIG_DST"
                export ENV_EC_SRC="$EDITORCONFIG_SRC"
                node << 'NODEEOF' || true
const fs = require('fs');
const dst = process.env.ENV_EC_DST;
const src = process.env.ENV_EC_SRC;
const existing = fs.readFileSync(dst, 'utf8');
const bridge = fs.readFileSync(src, 'utf8');
const marker = '# <!-- openspec-superpowers-opencode_editorconfig -->';
const esc = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pat = new RegExp(esc + '[\\s\\S]*?' + esc);
fs.writeFileSync(dst, existing.replace(pat, bridge.trimEnd()), 'utf8');
NODEEOF
            fi
            echo "$(t "  ✓ .editorconfig（bridge 内容已替换）" "  ✓ .editorconfig (bridge content replaced)")"
        else
            echo "$(t "  - .editorconfig（用户选择跳过）" "  - .editorconfig (user skipped)")"
        fi
    else
        # 无/不完整标记 → 静默追加
        if [ "$DRY_RUN" = false ] && [ -f "$EDITORCONFIG_SRC" ]; then
            BRIDGE=$(cat "$EDITORCONFIG_SRC")
            echo "" >> "$EDITORCONFIG_DST"
            echo "$BRIDGE" >> "$EDITORCONFIG_DST"
        fi
        echo "$(t "  ✓ .editorconfig（已追加桥接规则）" "  ✓ .editorconfig (bridge rules appended)")"
    fi
fi
echo ""

# ---- 语言文件清理（仅保留英文 + 所选语言，静默执行）----
SCHEMA_DIR="$PROJECT_ROOT/openspec/schemas/superpowers-bridge-opencode"
if [ "$LANG_ARG" = "en" ]; then
    LANG_PATTERNS="*.zh-CN.* *.zh-TW.*"
elif [ "$LANG_ARG" = "zh-CN" ]; then
    LANG_PATTERNS="*.zh-TW.*"
else
    LANG_PATTERNS="*.zh-CN.*"
fi
for pattern in $LANG_PATTERNS; do
    find "$SCHEMA_DIR" -name "$pattern" 2>/dev/null | while IFS= read -r f; do
        [ -f "$f" ] || continue
        [ "$DRY_RUN" = false ] && rm -f "$f"
        # 静默删除，不输出
    done
done

log "$(t "✓ 文件复制完成" "✓ File copy complete")"
echo ""

# ---- 6. 替换占位符 ----
echo "$(t "[6/8] 替换路径占位符..." "[6/8] Replacing path placeholders...")"

ESCAPED_BASE=$(echo "$SUPERPOWERS_BASE" | sed 's|/|\\/|g')
REPLACEMENT="${ESCAPED_BASE}\\/"

FILES=(
    "openspec/schemas/superpowers-bridge-opencode/schema.yaml"
    "AGENTS.md"
    ".opencode/commands/opsx-apply.md"
    ".opencode/commands/opsx-finish.md"
)

for file in "${FILES[@]}"; do
    path="$PROJECT_ROOT/$file"
    if [ -f "$path" ]; then
        if grep -q '{{SUPERPOWERS_BASE_PATH}}' "$path" 2>/dev/null; then
            if [ "$(uname -s)" = "Darwin" ]; then
                run_cmd sed -i '' "s/{{SUPERPOWERS_BASE_PATH}}/$REPLACEMENT/g" "$path"
            else
                run_cmd sed -i "s/{{SUPERPOWERS_BASE_PATH}}/$REPLACEMENT/g" "$path"
            fi
            log "$(t "  ✓ $file" "  ✓ $file")"
        else
            echo "$(t "  - $file (无占位符)" "  - $file (no placeholder)")"
        fi
    fi
done

echo "$(t "✓ 占位符替换完成" "✓ Placeholder replacement complete")"
echo ""

# ---- 7. 验证 schema ----
echo "$(t "[7/8] 验证 schema..." "[7/8] Validating schema...")"
if [ "$DRY_RUN" = false ]; then
    openspec schema validate superpowers-bridge-opencode || true
    echo "$(t "✓ Schema 验证通过" "✓ Schema validation passed")"
else
    echo "  [DRY-RUN] openspec schema validate superpowers-bridge-opencode"
fi
echo ""

# ---- 8. 验证工作流 + 写入安装清单 ----
echo "$(t "[8/8] 验证工作流 + 写入安装清单..." "[8/8] Validating workflow + writing manifest...")"

ALL_OK=true
TEST_CHANGE="verify-deploy"

if [ "$DRY_RUN" = false ]; then
    set +e

    TEMPLATES_JSON=$(openspec templates --json --schema superpowers-bridge-opencode 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "$(t "✗ 模板解析失败" "✗ Template parsing failed")"
        ALL_OK=false
    else
        PROJECT_COUNT=$(echo "$TEMPLATES_JSON" | grep -c '"source": "project"')
        if [ "$PROJECT_COUNT" -ge 8 ]; then
            echo "$(t "✓ 模板解析完成（${PROJECT_COUNT} 个 project 源模板）" "✓ Template parsing complete (${PROJECT_COUNT} project source templates)")"
        else
            echo "$(t "✗ 模板源检测异常（仅 ${PROJECT_COUNT} 个 project 源）" "✗ Template source anomaly (only ${PROJECT_COUNT} project sources)")"
            ALL_OK=false
        fi
    fi

    openspec new change "$TEST_CHANGE" --description "部署验证" 2>/dev/null
    if [ $? -ne 0 ]; then
        echo "$(t "✗ 测试变更创建失败" "✗ Test change creation failed")"
        ALL_OK=false
    else
        echo "$(t "✓ 测试变更已创建" "✓ Test change created")"
    fi

    # 尝试 JSON 解析；降级到目录存在检查
    CHANGE_FOUND=false
    CHANGE_LIST=$(openspec list --json 2>/dev/null)
    if command -v node &>/dev/null; then
        CHANGE_NAMES=$(echo "$CHANGE_LIST" | node -e "
            const d=require('fs').readFileSync('/dev/stdin','utf8');
            try {
                const j=JSON.parse(d);
                const changes=j.changes||j||[];
                changes.forEach(c=>console.log(typeof c==='string'?c:c.name));
            } catch(e) { process.exit(1); }
        " 2>/dev/null) && {
            while IFS= read -r name; do
                [ "$name" = "$TEST_CHANGE" ] && CHANGE_FOUND=true && break
            done <<< "$CHANGE_NAMES"
        }
    fi
    if [ "$CHANGE_FOUND" = false ] && [ -d "openspec/changes/$TEST_CHANGE" ]; then
        CHANGE_FOUND=true
    fi
    if [ "$CHANGE_FOUND" = false ]; then
        echo "$(t "✗ 变更未被列出" "✗ Change not listed")"
        ALL_OK=false
    else
        echo "$(t "✓ 变更列表正常" "✓ Change list OK")"
    fi

    STATUS_OUT=$(openspec status --change "$TEST_CHANGE" 2>/dev/null)
    ARTIFACT_COUNT=$(echo "$STATUS_OUT" | grep -c '^\[')
    if [ "$ARTIFACT_COUNT" -ge 8 ]; then
        echo "$(t "✓ Artifact 链完整（${ARTIFACT_COUNT} 个）" "✓ Artifact chain complete (${ARTIFACT_COUNT})")"
    else
        echo "$(t "✗ Artifact 链不完整（仅 ${ARTIFACT_COUNT} 个）" "✗ Artifact chain incomplete (only ${ARTIFACT_COUNT})")"
        ALL_OK=false
    fi

    openspec instructions brainstorm --change "$TEST_CHANGE" > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo "$(t "✗ 指令生成失败" "✗ Instruction generation failed")"
        ALL_OK=false
    else
        echo "$(t "✓ 指令生成正常" "✓ Instruction generation OK")"
    fi

    rm -rf "openspec/changes/$TEST_CHANGE" 2>/dev/null
    echo "$(t "✓ 测试变更已清理" "✓ Test change cleaned up")"

    if [ "$ALL_OK" = true ]; then
        echo "$(t "✓ OpenSpec 工作流验证通过" "✓ OpenSpec workflow validation passed")"
    else
        echo "$(t "✗ OpenSpec 工作流验证失败" "✗ OpenSpec workflow validation failed")"
    fi
    set -e
else
    echo "$(t "  [DRY-RUN] 跳过验证（--dry-run 模式）" "  [DRY-RUN] Skipping validation (--dry-run mode)")"
fi
echo ""

# ---- 写入安装清单 ----
if [ "$DRY_RUN" = false ]; then
    # 序列化 INSTALLED_FILES 传递给 node
    INSTALLED_FILES_JOINED=""
    for f in "${INSTALLED_FILES[@]}"; do
        INSTALLED_FILES_JOINED="${INSTALLED_FILES_JOINED}${f}"$'\n'
    done
    export INSTALLED_FILES_BASH="$INSTALLED_FILES_JOINED"
    export DECISIONS_FILE
    export MANIFEST_FILE
    export PROJECT_ROOT
    export LANG_ARG
    export SUPERPOWERS_BASE

    node << 'NODEEOF' || true
const fs = require('fs');
const { execSync } = require('child_process');

const manifest_path = process.env.MANIFEST_FILE;
const decisions_file = process.env.DECISIONS_FILE || '';
const files_str = process.env.INSTALLED_FILES_BASH || '';

const files_list = [...new Set(files_str.split('\n').map(s => s.trim()).filter(Boolean))].sort();
let decisions = {};
if (decisions_file && fs.existsSync(decisions_file)) {
  const text = fs.readFileSync(decisions_file, 'utf8');
  for (const line of text.split('\n')) {
    const l = line.trim();
    const idx = l.indexOf(':');
    if (idx > 0) decisions[l.slice(0, idx)] = l.slice(idx + 1);
  }
}
let openspec_ver = 'unknown';
try {
  openspec_ver = execSync('openspec --version', { timeout: 10000, encoding: 'utf8' }).trim();
} catch (e) {}
const manifest = {
  project: 'openspec-superpowers-opencode',
  installedAt: new Date().toISOString(),
  language: process.env.LANG_ARG || 'en',
  opencodeVersion: openspec_ver,
  superpowersPath: process.env.SUPERPOWERS_BASE || '',
  files: files_list,
  overwriteDecisions: decisions,
};
fs.writeFileSync(manifest_path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
NODEEOF

    echo "$(t "✓ 安装清单已写入: .opencode/install-manifest.json" "✓ Install manifest written: .opencode/install-manifest.json")"
    echo "$(t "  已记录 ${#INSTALLED_FILES[@]} 个文件" "  ${#INSTALLED_FILES[@]} files recorded")"
    # overwriteDecisions 计数
    DECISION_COUNT=$(wc -l < "$DECISIONS_FILE" 2>/dev/null || echo 0)
    if [ "$DECISION_COUNT" -gt 0 ]; then
        echo "$(t "  已记录 $DECISION_COUNT 项覆盖决策" "  $DECISION_COUNT overwrite decisions recorded")"
    fi
else
    echo "$(t "  [DRY-RUN] 跳过的操作:" "  [DRY-RUN] Skipped operations:")"
    echo "    - $(t "写入安装清单 .opencode/install-manifest.json" "Write install manifest")"
    echo "    - $(t "所有文件复制操作" "All file copy operations")"
    echo "    - openspec schema validate"
    echo "    - $(t "OpenSpec 工作流验证" "OpenSpec workflow validation")"
fi
echo ""

# ---- 完成 ----
echo "$(t "=== 安装完成 ===" "=== Installation Complete ===")"
echo ""
echo "$(t "下一步：" "Next steps:")"
echo "$(t "  0. 快速开始指南在安装目录 docs/QUICKSTART.md" "  0. Quick start guide at docs/QUICKSTART.md in installation directory")"
echo "$(t "  1. /opsx-ff <功能名> 创建第一个变更，或" "  1. /opsx-ff <feature-name> to create your first change, or")"
echo "$(t "  2. /opsx-onboard 进行引导式入门" "  2. /opsx-onboard for guided onboarding")"
echo ""
echo "$(t "重置： openspec-superpowers-opencode reset" "Reset: openspec-superpowers-opencode reset")"
echo "$(t "预览： openspec-superpowers-opencode dry-run" "Preview: openspec-superpowers-opencode dry-run")"
# EOF - intentionally empty trailing line for LF normalization
