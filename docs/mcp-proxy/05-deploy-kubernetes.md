# 5. Deploy on Kubernetes

This assumes an image is already available at a registry address, as described in
[step 4](./04-docker.md).

Store the credential as a `Secret` rather than a plain environment value, and use the status
endpoint from [step 3](./03-logging.md#status-page) for probes:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: mcp-outpost-credential
type: Opaque
stringData:
  METORIAL_OUTPOST_CREDENTIAL: metorial_op_...
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-outpost
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-outpost
  template:
    metadata:
      labels:
        app: mcp-outpost
    spec:
      containers:
        - name: mcp-outpost
          image: registry.example.com/your-org/mcp-outpost:latest
          ports:
            - containerPort: 8080
          env:
            - name: METORIAL_OUTPOST_CREDENTIAL
              valueFrom:
                secretKeyRef:
                  name: mcp-outpost-credential
                  key: METORIAL_OUTPOST_CREDENTIAL
          readinessProbe:
            httpGet:
              path: /outpost-status/api/status
              port: 8080
            initialDelaySeconds: 5
          livenessProbe:
            httpGet:
              path: /outpost-status/api/status
              port: 8080
            initialDelaySeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-outpost
spec:
  selector:
    app: mcp-outpost
  ports:
    - port: 443
      targetPort: 8080
```

Apply it:

```bash
kubectl apply -f mcp-outpost.yaml
```

## Considerations

- **`baseUrl` must match whatever fronts the `Service`.** Place a standard ingress or load
  balancer in front for TLS termination, and set `baseUrl` in `proxy.ts` (from
  [step 2](./02-setup.md)) to that public hostname. MCP clients rewrite discovery and connect
  URLs against this value, so a mismatch breaks connections rather than merely appearing
  incorrect.
