import { EmitterWebhookEvent } from "@octokit/webhooks";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { App } from "octokit";

const app = new App({
    appId: process.env.APP_ID!,
    privateKey: process.env.PRIVATE_KEY!,
    webhooks: { secret: process.env.WEBHOOK_SECRET! },
});

app.webhooks.on("pull_request.closed", run);
app.webhooks.on(
    ["pull_request.opened", "pull_request.reopened", "pull_request.synchronize"],
    verify
);

export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
    await app.webhooks.receive({
        payload: JSON.parse(event.body!),
        id: event.requestContext.requestId,
        name: "pull_request",
    });

    return { statusCode: 200, body: JSON.stringify({ message: `success` }) };
}

async function run({ payload }: EmitterWebhookEvent<"pull_request">) {
    const octokit = await app.getInstallationOctokit(payload.installation!.id);

    const message = payload.pull_request.merged
        ? "Running `multi-gitter`..."
        : "Pull request was closed without merging.";

    await octokit.rest.issues.createComment({
        body: message,
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
    });
}

async function verify({ payload }: EmitterWebhookEvent<"pull_request">) {
    const octokit = await app.getInstallationOctokit(payload.installation!.id);

    await octokit.rest.issues.createComment({
        body: "Verifying pull request contents...",
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
    });
}
