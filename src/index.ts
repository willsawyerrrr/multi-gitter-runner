import { components } from "@octokit/openapi-types";
import { EmitterWebhookEvent } from "@octokit/webhooks";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { SpawnSyncReturns, execSync } from "child_process";
import { writeFileSync } from "fs";
import { App } from "octokit";

import { safeOctokitRequest, verifyFiles } from "./utils";

const requiredFiles = ["script.sh", "config.yaml"];

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

    const fileDiffs = await safeOctokitRequest(octokit.rest.pulls.listFiles, {
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        pull_number: payload.pull_request.number,
    });

    const errors = await verifyFiles(
        octokit.rest.repos.getContent,
        payload,
        fileDiffs,
        requiredFiles
    );

    if (errors.length) {
        errors.unshift("Failed to verify pull request contents:");
        await safeOctokitRequest(octokit.rest.issues.updateComment, {
            body: errors.join("\n"),
            issue_number: payload.pull_request.number,
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            comment_id: commentId,
        });

        return;
    }

    fileDiffs.forEach(async (fileDiff) => {
        const { name, content } = (await safeOctokitRequest(octokit.rest.repos.getContent, {
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            path: fileDiff.filename,
            ref: payload.pull_request.head.sha,
        })) as components["schemas"]["content-file"];

        writeFileSync(`/tmp/${name}`, content, {
            mode: name === "script.sh" ? 0o755 : 0o644,
        });
    });

    let result: Buffer;
    try {
        result = execSync("multi-gitter run /tmp/script.sh --config /tmp/config.yaml --dry-run");
    } catch (error) {
        const stdout = (error as SpawnSyncReturns<Buffer>).stdout.toString();
        const stderr = (error as SpawnSyncReturns<Buffer>).stderr.toString();

        await safeOctokitRequest(octokit.rest.issues.updateComment, {
            body: "Failed to run `multi-gitter`.",
            issue_number: payload.pull_request.number,
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            comment_id: commentId,
        });

        return;
    }

    await safeOctokitRequest(octokit.rest.issues.updateComment, {
        body: "Done verifying.",
        issue_number: payload.pull_request.number,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        comment_id: commentId,
    });
}
