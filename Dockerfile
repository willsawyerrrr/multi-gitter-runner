FROM ubuntu:22.04 as multi-gitter-image

WORKDIR /multi-gitter

RUN apt update && apt install curl --yes \
    && touch ./multi-gitter && chmod +w ./multi-gitter \
    && curl -s https://raw.githubusercontent.com/lindell/multi-gitter/master/install.sh -O \
    && chmod +x install.sh && sh install.sh -b .

FROM public.ecr.aws/lambda/nodejs:20 as build-image

WORKDIR /usr/app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm clean-install
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=multi-gitter-image /multi-gitter/multi-gitter /usr/local/bin/multi-gitter
COPY --from=build-image /usr/app/package.json /usr/app/package-lock.json /usr/app/dist ./

RUN npm clean-install --omit dev

CMD ["index.handler"]
