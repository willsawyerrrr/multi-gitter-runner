FROM public.ecr.aws/lambda/nodejs:20 as build-image

WORKDIR /usr/app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm clean-install
RUN npm run build

FROM public.ecr.aws/lambda/nodejs:20

WORKDIR ${LAMBDA_TASK_ROOT}

COPY --from=build-image /usr/app/package.json /usr/app/package-lock.json /usr/app/dist ./

RUN npm clean-install --omit dev

CMD ["index.handler"]
