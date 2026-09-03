# 1. Create an Outpost

Outposts are registered in the Metorial dashboard.
After this step, you will have a credential that you can use to enroll the Outpost in your network and connect it to Metorial.

## Create the Outpost

1. Go to your organization's **Settings → Outposts** and select **Create Outpost**.
2. Provide a name and a description. This creates the Outpost, but it is not usable yet. You
   cannot connect to it until you grant it access and create a credential in the following steps.

## Grant it access

1. Open the Outpost you just created and go to its **Access** tab.
2. For every Metorial instance that should be able to use this Outpost, select the services it
   needs:
   - **Proxy MCP connections**: required. Allows the instance to route MCP client connections
     through this Outpost.
   - **Proxy outpost registrations**: optional. Needed only if you plan to nest another Outposts
     behind this one, in which case this Outpost acts as the parent, or relay, for the child
     Outpost's registration and requests.
3. Select **Save Access**.

## Create a credential

1. On the Outpost's **Overview** tab select **Create Credential**.
2. Provide a name and, optionally, an expiry date. (Note that once an Outpost's credential expires it WILL NOT be able to connect to Metorial, and you will need to create a new credential and update the Outpost's configuration.)
3. The dialog displays the credential.

**Copy it immediately and store it in a secret manager or password manager.** Metorial cannot display it again. If it is lost, disable it in the dashboard
and create a new one.

This value is what you will set as `METORIAL_OUTPOST_CREDENTIAL` in
[the next step](./02-setup.md).
