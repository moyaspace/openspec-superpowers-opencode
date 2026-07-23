---
description: Remove a change — clean registry entry and worktree
---

Remove a change from the registry and delete its worktree directory and git branch.

**Input**: Change name (kebab-case), required.

**Steps**

```bash
# Step 1: Remove from registry (always clean registry first)
openspec-superpowers-opencode registry remove <name>

# Step 2: Remove worktree and branch
openspec-superpowers-opencode remove-worktree <name>
```

No confirmation needed. Registry entry is cleaned first, then filesystem.
