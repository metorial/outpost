# 4. Dockerize it

Package the `proxy.ts` from [step 2](./02-setup.md) into a container image so that it can run
unattended, restart automatically, and be deployed anywhere that runs containers. This step
covers building and running the image.

## Dockerfile

This uses Bun's first-party image.

```dockerfile
FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY proxy.ts ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["bun", "run", "proxy.ts"]
```

`bun.lock` is created the first time `bun install` runs locally (in [step 2](./02-setup.md)).
Commit it alongside `package.json`.

If the project was set up with `npm` instead of Bun in step 2, use a Node base image and install
step instead:

```dockerfile
FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY proxy.mjs ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "proxy.mjs"]
```

## Run the image

- [Kubernetes](./05-deploy-kubernetes.md)
- [Other platforms](./06-deploy-other-platforms.md) (a plain virtual machine, ECS, Cloud Run,
  Fly.io, or Railway)
