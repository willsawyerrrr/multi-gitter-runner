import { EmitterWebhookEvent } from "@octokit/webhooks";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { App } from "octokit";

const app = new App({
    appId: process.env.APP_ID!,
    privateKey: process.env.PRIVATE_KEY!,
    webhooks: { secret: process.env.WEBHOOK_SECRET! },
});

app.webhooks.on("pull_request", ping);

export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
    const payload = JSON.parse(event.body!);
    await app.webhooks.receive({
        payload,
        id: event.requestContext.requestId,
        name: "pull_request",
    });

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: `Received ${payload.action} event for pull request ${payload.number}`,
        }),
    };
}

async function ping({ payload }: EmitterWebhookEvent<"pull_request">) {
    const octokit = await app.getInstallationOctokit(payload.installation!.id);

    await octokit.rest.issues.createComment({
        body: `Received ${payload.action} event for pull request ${payload.number}`,
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
    });
}
