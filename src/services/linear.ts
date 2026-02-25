import type { LinearIssue, ProjectConfig } from '../types';

const LINEAR_API = 'https://api.linear.app/graphql';

export async function fetchIssues(
  apiKey: string,
  project: ProjectConfig,
  singleIssue?: string
): Promise<LinearIssue[]> {
  let query: string;

  if (singleIssue) {
    const number = singleIssue.split('-').pop();
    query = `query {
      issues(filter: {
        team: { key: { eq: "${project.linearTeam}" } }
        number: { eq: ${number} }
      }) {
        nodes { id identifier title description url priority state { name type } }
      }
    }`;
  } else {
    query = `query {
      issues(filter: {
        team: { key: { eq: "${project.linearTeam}" } }
        assignee: { displayName: { containsIgnoreCase: "${project.linearAssignee}" } }
        labels: { name: { eq: "${project.linearLabel}" } }
        state: { name: { eq: "Todo" } }
      }) {
        nodes { id identifier title description url priority state { name type } }
      }
    }`;
  }

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const data = (await res.json()) as any;

  if (data.errors?.length) {
    throw new Error(`Linear API error: ${data.errors[0].message}`);
  }

  return data.data.issues.nodes.map((n: any) => ({
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    description: n.description ?? 'No description provided.',
    url: n.url,
    priority: n.priority,
    state: n.state,
  }));
}

export async function updateIssueState(
  apiKey: string,
  teamKey: string,
  issueId: string,
  stateName: string
): Promise<void> {
  const stateQuery = `query {
    workflowStates(filter: {
      team: { key: { eq: "${teamKey}" } }
      name: { eq: "${stateName}" }
    }) { nodes { id } }
  }`;

  const stateRes = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: stateQuery }),
  });

  const stateData = (await stateRes.json()) as any;
  const stateId = stateData.data?.workflowStates?.nodes?.[0]?.id;

  if (!stateId) return;

  const mutation = `mutation {
    issueUpdate(id: "${issueId}", input: { stateId: "${stateId}" }) { success }
  }`;

  await fetch(LINEAR_API, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation }),
  });
}

export async function addComment(
  apiKey: string,
  issueId: string,
  body: string
): Promise<void> {
  const escaped = body.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const mutation = `mutation {
    commentCreate(input: { issueId: "${issueId}", body: "${escaped}" }) { success }
  }`;

  await fetch(LINEAR_API, {
    method: 'POST',
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: mutation }),
  });
}
