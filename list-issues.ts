import { Octokit } from "https://esm.sh/octokit?dts";
import { formatDistanceToNow } from "npm:date-fns";

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

const repositories = [
  {
    owner: "NordicPlayground",
    repo: "nrf-docker",
    project: "other",
  },
];

const organizations = [
  {
    name: "hello-nrfcloud",
    project: "hello.nrfcloud.com",
  },
  {
    name: "bifravst",
    project: "other",
  },
];

for (const { name: org, project } of organizations) {
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
      project,
    });
  }
}

const teams = [
  ["NordicSemiconductor", "nrf-asset-tracker", "nRF Asset Tracker"],
  ["NordicPlayground", "cellular-iot-applications", "other"],
  ["NordicPlayground", "thingy-world", "world.thingy.rocks"],
];

for (const [org, team, project] of teams) {
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
      project,
    });
  }
}

type Issue = Record<string, any>;
const helpWantedIssues: Record<string, Issue[]> = {};

for (const { owner, repo, project } of repositories) {
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
    if (helpWantedIssues[project] === undefined) helpWantedIssues[project] = [];
    helpWantedIssues[project].push(issue);
  }
}

const issueMarkdown = [];

// Issues
issueMarkdown.push(`## Issues`);
issueMarkdown.push();
issueMarkdown.push(
  `Issues labeled with *help wanted*. Remove the *help wanted* label to not include them in this list.`
);
for (const [project, issues] of Object.entries(helpWantedIssues)) {
  issueMarkdown.push(`### ${project}`);
  for (const issue of issues
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(({ pull_request }) => pull_request === undefined)) {
    const createdAt = new Date(issue.created_at);
    issueMarkdown.push(
      `- ${
        issue.html_url
      } (<time datetime="${createdAt.toISOString()}">${formatDistanceToNow(
        createdAt,
        { addSuffix: true }
      )}</time>)`
    );
  }
}

// PRs
issueMarkdown.push(`## PRs`);
issueMarkdown.push();
issueMarkdown.push(`Add the *on hold* label to not include them in this list.`);
for (const [project, issues] of Object.entries(helpWantedIssues)) {
  issueMarkdown.push(`### ${project}`);
  for (const issue of issues
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter(({ pull_request }) => pull_request !== undefined)) {
    const createdAt = new Date(issue.created_at);
    issueMarkdown.push(
      `- ${
        issue.html_url
      } (<time datetime="${createdAt.toISOString()}">${formatDistanceToNow(
        createdAt,
        { addSuffix: true }
      )}</time>)`
    );
  }
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

Deno.exit(0);
