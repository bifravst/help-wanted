import { Octokit } from "https://esm.sh/octokit?dts";
import { formatDistanceToNow } from "npm:date-fns";
import { isIgnored } from "./isIgnored.ts";

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({
  auth: Deno.env.get("GITHUB_TOKEN"),
});

let repositories: Repos = [
  {
    owner: "NordicPlayground",
    repo: "nrf-docker",
    project: "other",
  },
];

const unique = (repos: Repos): Repos =>
  repos.reduce((unique, repo) => {
    if (
      unique.find(
        (r) => `${r.owner}/${r.repo}` === `${repo.owner}/${repo.repo}`
      ) === undefined
    )
      unique.push(repo);
    return unique;
  }, [] as Repos);

type Issue = Record<string, any>;

const htmlUrlRx = /^https:\/\/github\.com\/(?<org>[^\/]+)\/(?<repo>[^\/]+)\/.+/;
const groupIssuesByRepo = (issues: Issue[]): Record<string, Issue[]> =>
  issues.reduce((groupedIssues, issue) => {
    const { html_url } = issue;
    const { org, repo } = htmlUrlRx.exec(html_url)?.groups ?? {};
    const repoId = `${org}/${repo}`;
    if (!groupedIssues[repoId]) {
      groupedIssues[repoId] = [];
    }
    groupedIssues[repoId].push(issue);
    return groupedIssues;
  }, {});

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
  ["NordicSemiconductor", "cellular-iot-applications-cloud-squad", "other"],
  ["NordicPlayground", "thingy-world", "world.thingy.rocks"],
];

for (const [org, team, project] of teams) {
  console.log(`Fetching team ${org}/${team}...`);
  const repos = await octokit.rest.teams.listReposInOrg({
    org,
    team_slug: team,
    per_page: 100,
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

// Make unique
repositories = unique(repositories);
// Remove ignores
repositories = repositories.filter(isIgnored);

const helpWantedIssues: Record<string, Issue[]> = {};

for (const { owner, repo, project } of repositories) {
  const issues = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  for (const issue of issues.data) {
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
for (const [project, projectIssues] of Object.entries(helpWantedIssues)) {
  issueMarkdown.push(`### ${project}`);

  for (const [repo, issues] of Object.entries(
    groupIssuesByRepo(
      projectIssues
        .sort(
          (a, b) => b.created_at.localeCompare(a.created_at) // sort by time
        )
        // Not a PR
        .filter(({ pull_request }) => pull_request === undefined)
        // help wanted
        .filter(({ labels }) =>
          labels.find(({ name }) => name === "help wanted")
        )
    )
  )) {
    if (issues.length === 0) {
      continue;
    }
    issueMarkdown.push(`#### ${repo}`);
    for (const issue of issues) {
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
}

// PRs
issueMarkdown.push(`## PRs`);
issueMarkdown.push();
issueMarkdown.push(
  "Add the `help wanted` label a PR to add them to this list."
);
issueMarkdown.push(
  "Add the `on hold` label a PR to remove them from the list. This has precedence over `help wanted`."
);
for (const [project, issues] of Object.entries(helpWantedIssues)) {
  const prsToShow = issues
    .sort(
      (a, b) => b.created_at.localeCompare(a.created_at) // sort by time
    )
    .filter(({ pull_request }) => pull_request !== undefined)
    .filter(({ draft }) => (draft ?? false) === false)
    // help wanted, or renovate
    .filter(
      ({ labels, user }) =>
        labels.find(({ name }) => name === "help wanted") !== undefined ||
        user.login === "renovate[bot]"
    )
    // on hold
    .filter(({ labels, user }) =>
      labels.find(({ name }) => name === "on hold") !== undefined ? false : true
    );

  if (prsToShow.length === 0) {
    issueMarkdown.push(`No PRs to help with.`);
    continue;
  }

  issueMarkdown.push(`### ${project}`);

  for (const [repo, issues] of Object.entries(groupIssuesByRepo(prsToShow))) {
    issueMarkdown.push(`#### ${repo}`);
    for (const issue of issues) {
      const createdAt = new Date(issue.created_at);

      issueMarkdown.push(
        `- ${issue.user.login === "renovate[bot]" ? ":package: " : ""}${
          issue.html_url
        } (<time datetime="${createdAt.toISOString()}">${formatDistanceToNow(
          createdAt,
          { addSuffix: true }
        )}</time>)`
      );
    }
  }
}

// List of repos
issueMarkdown.push(`## Repos`);
issueMarkdown.push();
issueMarkdown.push(
  `The issues and PRs in the list above are sourced from these repositories:`
);
for (const { owner, repo } of unique(repositories)) {
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
