import { RestEndpointMethods } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types.js";
import { EmitterWebhookEvent } from "@octokit/webhooks";
import { RequestError } from "octokit";

function camelCaseToSentenceCase(str: string) {
    return str.replace(
        /([a-z])([A-Z])/g,
        (_, lower: string, upper: string) => `${lower} ${upper.toLowerCase()}`
    );
}

type OctokitMethod = {
    [Key in keyof RestEndpointMethods]: {
        [Subkey in keyof RestEndpointMethods[Key]]: RestEndpointMethods[Key][Subkey];
    }[keyof RestEndpointMethods[Key]];
}[keyof RestEndpointMethods];

/**
 * Calls an Octokit method, logging any errors that occur.
 *
 * @param method Octokit method to call
 * @param params parameters to pass to the method
 *
 * @returns the `data` property of the response
 *
 * @todo figure out how to type this to restrict the method to only those which are available on the `octokit.rest` instance
 */
export async function safeOctokitRequest<
    Method extends OctokitMethod & { (...params: Parameters<Method>): any },
>(method: Method, ...params: Parameters<Method>): Promise<Awaited<ReturnType<Method>>["data"]> {
    try {
        const response = await method(...params);
        return response.data;
    } catch (error) {
        if (error instanceof RequestError) {
            console.error(
                "Failed to %s: got HTTP %s response.",
                camelCaseToSentenceCase(method.name),
                error.status
            );
        }
        console.error(error);
        throw error;
    }
}

/**
 * Verifies that the pull request contains the desired non-empty files.
 *
 * @param getContent the `octokit.rest.repos.getContent` method
 * @param payload the pull request webhook payload
 * @param fileDiffs the files in the pull request
 * @param desiredFilenames the filenames to check for
 *
 * @returns markdown-formatted error messages for missing or empty files
 */
export async function verifyFiles(
    getContent: RestEndpointMethods["repos"]["getContent"],
    payload: EmitterWebhookEvent<"pull_request">["payload"],
    fileDiffs: Awaited<ReturnType<RestEndpointMethods["pulls"]["listFiles"]>>["data"],
    desiredFilenames: string[]
): Promise<string[]> {
    const errors: string[] = [];

    desiredFilenames.forEach(async (desiredFilename) => {
        const file = fileDiffs.find((file) => file.filename === desiredFilename);
        if (!file) {
            return errors.push(` - \`${desiredFilename}\` does not exist`);
        }

        const content = await safeOctokitRequest(getContent, {
            owner: payload.repository.owner.login,
            repo: payload.repository.name,
            path: desiredFilename,
            ref: payload.pull_request.head.ref,
        });

        if (content instanceof Array) {
            return errors.push(` - \`${desiredFilename}\` is a directory`);
        }

        if (content.type !== "file") {
            return errors.push(` - \`script.sh\` is not a file - is a \`${content.type}\``);
        } else if (!content.content) {
            return errors.push(" - `script.sh` is empty");
        }
    });

    return errors;
}
