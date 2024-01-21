import { RestEndpointMethods } from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/method-types.js";
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
