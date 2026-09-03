# Setting up an MCP Proxy Outpost

An Outpost is a process that runs inside your own network and proxies traffic to Metorial
over a signed, authenticated channel. The **MCP proxy** outpost lets MCP clients and
agents connect to it directly, and it forwards their traffic to Metorial. You can monitor, intercept, transform, and block traffic in your own network before it reaches Metorial.

This is a step-by-step guide to setting one up:

1. [Create an Outpost](./01-create-an-outpost.md): register it in the Metorial dashboard and
   obtain a credential.
2. [Set up the code](./02-setup.md): install `@metorial/mcp-proxy` and write the logic for your proxy.
3. [Logging](./03-logging.md): observe what is flowing through the proxy and send logs to a
   durable destination.
4. [Dockerize it](./04-docker.md): package the script from step 2 into a container image.
5. Deploy it:
   - [Kubernetes](./05-deploy-kubernetes.md)
   - [Other platforms](./06-deploy-other-platforms.md)

This idea of an outpost is that you build your own proxy based 
on a set of libraries provided by Metorial that abstract away the outpost protocol.

## Further reference

This guide covers only the MCP proxy path. If you are embedding an Outpost yourself, writing a
custom adapter, or want protocol-level detail, see the reference guides one level up:

- [Signature system](../../../docs/signature-system.md): the signed registration and request formats.
- [Outpost registration](../../../docs/registration.md): the challenge and response handshake, `OutpostAuth`,
  and credential stores.
- [Instances and adapters](../../../docs/instances-and-adapters.md): starting an `OutpostInstance` directly
  and writing your own adapter.
- [Logging](../../../docs/logging.md): the full logger reference. This tutorial's
  [03-logging.md](./03-logging.md) covers only what an MCP proxy needs.
