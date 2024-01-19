import { EmitterWebhookEvent } from "@octokit/webhooks";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { App } from "octokit";
import { safeOctokitRequest } from "./utils";

const app = new App({
    appId: process.env.APP_ID!,
    privateKey: process.env.PRIVATE_KEY!,
    webhooks: { secret: process.env.WEBHOOK_SECRET! },
});

app.webhooks.on("pull_request.closed", run);
app.webhooks.on(
    [
        "pull_request.edited",
        "pull_request.opened",
        "pull_request.ready_for_review",
        "pull_request.reopened",
        "pull_request.synchronize",
    ],
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

    if (!payload.pull_request.merged) {
        await safeOctokitRequest(octokit.rest.issues.createComment, {
            body: "Pull request was closed without merging.",
            issue_number: payload.pull_request.number,
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
        });

        return;
    }

    const { id: commentId } = await safeOctokitRequest(octokit.rest.issues.createComment, {
        body: "Running `multi-gitter`...",
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
    });

    await safeOctokitRequest(octokit.rest.issues.updateComment, {
        body: "Done running `multi-gitter`.",
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: commentId,
    });

    // check verification status
    // ideally, validate and use the previous verification status
    // otherwise, re-verify the pull request contents
}

async function verify({ payload }: EmitterWebhookEvent<"pull_request">) {
    const octokit = await app.getInstallationOctokit(payload.installation!.id);

    const { id: commentId } = await safeOctokitRequest(octokit.rest.issues.createComment, {
        body: "Verifying pull request contents...",
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
    });

    await safeOctokitRequest(octokit.rest.issues.updateComment, {
        body: "Done verifying.",
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: commentId,
    });
}
