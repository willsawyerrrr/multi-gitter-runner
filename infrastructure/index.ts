import {
    App,
    Duration,
    Stack,
    StackProps,
    aws_ecr as ecr,
    aws_lambda as lambda,
} from "aws-cdk-lib";

class MultiGitterRunnerStack extends Stack {
    constructor(scope: App, id: string, props?: StackProps) {
        super(scope, id, props);

        new lambda.DockerImageFunction(this, "multi-gitter-runner-lambda-function", {
            code: lambda.DockerImageCode.fromEcr(
                ecr.Repository.fromRepositoryName(
                    this,
                    "multi-gitter-runner-repo",
                    "multi-gitter-runner"
                ),
                {
                    tagOrDigest: process.env.IMAGE_TAG!,
                }
            ),
            environment: {
                APP_ID: process.env.APP_ID!,
                PRIVATE_KEY: process.env.PRIVATE_KEY!,
                WEBHOOK_SECRET: process.env.WEBHOOK_SECRET!,
            },
            timeout: Duration.seconds(30),
        });
    }
}

const app = new App();
new MultiGitterRunnerStack(app, "multi-gitter-runner-stack", {
    env: { account: process.env.AWS_ACCOUNT_ID!, region: "ap-southeast-2" },
});

app.synth();
