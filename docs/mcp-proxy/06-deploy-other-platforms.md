# 6. Deploy on other platforms

Every platform below requires the image built from
[step 4](./04-docker.md) .
## A plain virtual machine (systemd)

Pull and run the image with Docker, and let systemd keep it running, restarting it on boot or
after a crash:

```ini
# /etc/systemd/system/mcp-outpost.service
[Unit]
Description=Metorial MCP Outpost
After=docker.service
Requires=docker.service

[Service]
Restart=always
ExecStartPre=-/usr/bin/docker stop mcp-outpost
ExecStartPre=-/usr/bin/docker rm mcp-outpost
ExecStart=/usr/bin/docker run --rm --name mcp-outpost \
  -p 8080:8080 \
  --env-file /etc/mcp-outpost.env \
  registry.example.com/your-org/mcp-outpost:latest
ExecStop=/usr/bin/docker stop mcp-outpost

[Install]
WantedBy=multi-user.target
```

Place `METORIAL_OUTPOST_CREDENTIAL=metorial_op_...` in `/etc/mcp-outpost.env` (readable by its
owner only), then run:

```bash
sudo systemctl enable --now mcp-outpost
```

Place a reverse proxy, such as nginx or Caddy, in front for TLS termination, and use
`/outpost-status/api/status` (see [step 3](./03-logging.md#status-page)) as its health check
target.

## AWS ECS / Fargate

- Push the image to ECR.
- Define a task with one container using container port `8080`. Source
  `METORIAL_OUTPOST_CREDENTIAL` from **Secrets Manager** or **SSM Parameter Store** (the task
  definition's `secrets` field, not `environment`) rather than a plain environment value.
- Place the service behind an Application Load Balancer, and use `/outpost-status/api/status` as
  the target group health check path.
- Set `baseUrl` in `proxy.ts` to the load balancer's DNS name, or to a custom domain if one is
  pointed at it.

## Google Cloud Run

- Push the image to Artifact Registry.
- Deploy with `gcloud run deploy`, setting `METORIAL_OUTPOST_CREDENTIAL` using `--set-secrets`
  (backed by Secret Manager) rather than `--set-env-vars`.
- Cloud Run assigns the container port through the `PORT` environment variable it injects. Either
  read `process.env.PORT` for `proxy: { port }` in `proxy.ts`, or set Cloud Run's container port
  to match the `8080` hardcoded in step 2.
- `baseUrl` is the `*.run.app` URL that Cloud Run assigns, or a custom domain mapped to it. Cloud
  Run terminates TLS automatically.

## Fly.io / Railway

Both platforms build directly from the `Dockerfile` and manage TLS and routing automatically,
which makes them the simplest option in this list:

- **Fly.io**: `fly launch` detects the `Dockerfile`. Set the credential with
  `fly secrets set METORIAL_OUTPOST_CREDENTIAL=metorial_op_...`. Fly assigns a `*.fly.dev` URL,
  which should be used as `baseUrl`.
- **Railway**: connect the repository or run `railway up`, then add
  `METORIAL_OUTPOST_CREDENTIAL` under the service's **Variables** tab. Railway assigns a
  `*.up.railway.app` URL, which should be used as `baseUrl`.

Both platforms allow a custom domain to be attached afterward, if the platform's own subdomain
should not be exposed to MCP clients.
