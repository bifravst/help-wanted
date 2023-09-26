import { Octokit } from "https://esm.sh/octokit?dts";

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

const repositories = [
  {
    owner: "NordicPlayground",
    repo: "nrf-docker",
  },
];

const organizations = ["hello-nrfcloud", "bifravst"];

for (const org of organizations) {
  console.log(`Fetching organization ${org}...`);
  const repos = await octokit.rest.repos.listForOrg({
    org,
    type: "public",
    per_page: 100,
  });
  for (const repo of repos.data.filter(({ archived }) => !archived)) {
    repositories.push({
      owner: org,
      repo: repo.name,
    });
  }
}

const teams = [
  ["NordicSemiconductor", "nrf-asset-tracker"],
  ["NordicPlayground", "cellular-iot-applications"],
  ["NordicPlayground", "thingy-world"],
];

for (const [org, team] of teams) {
  console.log(`Fetching team ${org}/${team}...`);
  const repos = await octokit.rest.teams.listReposInOrg({
    org,
    team_slug: team,
  });
  for (const repo of repos.data
    .filter(({ archived }) => !archived)
    .filter(({ private: priv }) => !priv)) {
    repositories.push({
      owner: org,
      repo: repo.name,
    });
  }
}

const helpWantedIssues = [];

for (const { owner, repo } of repositories) {
  const issues = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  for (const issue of issues.data.filter(
    ({ labels, pull_request }) =>
      labels.find(({ name }) => name === "help wanted" && name !== "on hold") ||
      pull_request !== undefined
  )) {
    helpWantedIssues.push(issue);
  }
}

const issueMarkdown = [];

// Issues
issueMarkdown.push(`## Issues`);
issueMarkdown.push();
issueMarkdown.push(
  `Issues labeled with *help wanted*. Remove the *help wanted* label to not include them in this list.`
);
for (const issue of helpWantedIssues
  .sort((a, b) => b.created_at.localeCompare(a.created_at))
  .filter(({ pull_request }) => pull_request === undefined)) {
  issueMarkdown.push(`- ${issue.html_url}`);
}

// PRs
issueMarkdown.push(`## PRs`);
issueMarkdown.push();
issueMarkdown.push(`Add the *on hold* label to not include them in this list.`);
for (const issue of helpWantedIssues
  .sort((a, b) => b.created_at.localeCompare(a.created_at))
  .filter(({ pull_request }) => pull_request !== undefined)) {
  issueMarkdown.push(`- ${issue.html_url}`);
}

// List of repos
issueMarkdown.push(`## Repos`);
issueMarkdown.push();
issueMarkdown.push(
  `The issues and PRs in the list above are sourced from these repositories:`
);
for (const { owner, repo } of repositories) {
  issueMarkdown.push(
    `- [@${owner}/${repo}](https://github.com/${owner}/${repo})`
  );
}

await octokit.rest.issues.update({
  owner: "bifravst",
  repo: "help-wanted",
  issue_number: 2,
  body: issueMarkdown.join(`\n`),
});

console.log(issueMarkdown.join(`\n`));
