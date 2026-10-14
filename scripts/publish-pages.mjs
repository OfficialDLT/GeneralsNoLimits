import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
if (!existsSync(join(dist, "index.html")))
  throw Error("Run npm run build first.");
writeFileSync(join(dist, ".nojekyll"), "");
const git = (args, options = {}) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", ...options }).trim();
const remote = git(["ls-remote", "origin", "refs/heads/gh-pages"]);
const parent = remote.split(/\s+/)[0];
if (parent) git(["fetch", "origin", "gh-pages"]);
const temp = mkdtempSync(join(tmpdir(), "generals-pages-"));
try {
  const env = { ...process.env, GIT_INDEX_FILE: join(temp, "index") };
  git(["read-tree", "--empty"], { env });
  git(
    [
      "--git-dir",
      join(root, ".git"),
      "--work-tree",
      dist,
      "add",
      "--all",
      "--",
      ".",
    ],
    { env, cwd: dist },
  );
  const tree = git(["write-tree"], { env });
  const files = git(["ls-tree", "--name-only", tree]).split("\n");
  if (
    !files.includes("index.html") ||
    !files.includes("assets") ||
    files.some(
      (name) => ![".nojekyll", "index.html", "assets", "art"].includes(name),
    )
  )
    throw Error("Unexpected files in website build; refusing publication.");
  const commit = git(
    [
      "-c",
      "user.name=Generals No Limits Publisher",
      "-c",
      "user.email=pages@users.noreply.github.com",
      "commit-tree",
      tree,
      ...(parent ? ["-p", parent] : []),
    ],
    {
      input: `Publish browser game from ${git(["rev-parse", "--short", "HEAD"])}\n`,
    },
  );
  git(["push", "origin", `${commit}:refs/heads/gh-pages`]);
  console.log(
    "Published website files to gh-pages. GitHub Pages must use gh-pages / (root).",
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
