const decoder = new TextDecoder("utf-8");
const data = Deno.readFileSync("repositories-ignore.txt");
const ignores = decoder
  .decode(data)
  .split("\n")
  .filter((s) => !s.startsWith("#"));

console.debug(`Ignoring:`);
for (const r of ignores) {
  console.debug(`- ${r}`);
}

export const isIgnored = (repo: Repo): boolean =>
  !ignores.includes(`${repo.owner}/${repo.repo}`);
