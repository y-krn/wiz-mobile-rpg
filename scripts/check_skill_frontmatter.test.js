import assert from "node:assert/strict";
import { checkSkillDirectory, checkSkillSource } from "./check_skill_frontmatter.js";

const valid = `---
name: example-skill
description: A valid skill description.
---

# Example

Use this skill.
`;

assert.deepEqual(checkSkillSource("/tmp/example-skill/SKILL.md", valid), []);
assert.match(
  checkSkillSource("/tmp/example-skill/SKILL.md", `${valid.replace("description:", "unexpected: yes\ndescription:")}`)[0].message,
  /Unexpected frontmatter key/
);
assert.match(
  checkSkillSource("/tmp/Bad_Name/SKILL.md", valid.replace("example-skill", "Bad_Name"))[0].message,
  /lowercase letters/
);
assert.match(
  checkSkillSource("/tmp/example-skill/SKILL.md", valid.replace("example-skill", `${"a".repeat(65)}`))[0].message,
  /exceeds 64/
);
assert.match(
  checkSkillSource("/tmp/example-skill/SKILL.md", valid.replace("A valid skill description.", "x".repeat(1025)))[0].message,
  /exceeds 1024/
);
assert.match(checkSkillDirectory("/tmp/missing-skill")[0].message, /requires SKILL.md/);
