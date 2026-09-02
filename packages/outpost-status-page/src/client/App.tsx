import type { ReactNode } from 'react';
import { Card } from './components/Card';
import { Field } from './components/Field';
import { Logo } from './components/Logo';
import { Section } from './components/Section';
import { StatusDot, type StatusTone } from './components/StatusDot';
import { formatDateTime, formatDuration } from './format';
import { useOutpostStatus } from './useOutpostStatus';

let Centered = ({ children }: { children: ReactNode }) => (
  <div className="page">
    <div className="centered">{children}</div>
  </div>
);

export let App = () => {
  let result = useOutpostStatus();

  if (result.status === 'loading') {
    return (
      <Centered>
        <p className="muted">Loading outpost status…</p>
      </Centered>
    );
  }

  let data = result.data;
  if (!data) {
    return (
      <Centered>
        <p className="error-text">
          {result.status === 'error' ? result.error : 'Unable to load outpost status.'}
        </p>
      </Centered>
    );
  }

  let stale = result.status === 'error';
  let overallTone: StatusTone = stale ? 'warning' : data.registered ? 'connected' : 'neutral';
  let overallLabel = stale ? 'Stale' : data.registered ? 'Online' : 'Registering…';

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <Logo />
          <span className="brand-label">Metorial Outpost</span>
        </div>
        <div className="status-pill">
          <StatusDot tone={overallTone} />
          {overallLabel}
        </div>
      </header>

      <main className="content">
        <Section title="This Outpost">
          <Card>
            <div className="card-heading">
              <StatusDot tone={data.registered ? 'connected' : 'neutral'} />
              <span className="card-title">{data.outpostName ?? data.outpostId}</span>
            </div>
            <div className="field-grid">
              <Field label="Outpost ID" value={data.outpostId} />
              <Field label="Instance ID" value={data.instanceId ?? '—'} />
              <Field label="Credential ID" value={data.credentialId} />
              <Field label="Uptime" value={formatDuration(Date.now() - data.startedAt)} />
              <Field label="Base URL" value={data.baseUrl} />
            </div>
          </Card>
        </Section>

        <Section title="Upstream Connection">
          <Card>
            <div className="card-heading">
              <StatusDot tone={data.registered ? 'connected' : 'warning'} />
              <span className="card-title">
                {data.upstream.kind === 'metorial' ? 'Metorial Cloud' : 'Parent Outpost'}
              </span>
            </div>
            <div className="field-grid">
              <Field label="Host" value={data.upstream.host} />
              <Field
                label="Session expires"
                value={data.tokenExpiresAt ? formatDateTime(data.tokenExpiresAt) : 'Never'}
              />
            </div>
          </Card>
        </Section>

        <Section title="Services">
          {data.services.length === 0 ? (
            <Card>
              <p className="muted">No services are running on this outpost.</p>
            </Card>
          ) : (
            <div className="service-list">
              {data.services.map(service => (
                <Card key={service.id}>
                  <div className="card-heading">
                    <StatusDot tone={service.granted ? 'connected' : 'error'} />
                    <span className="card-title">{service.id}</span>
                    {service.version ? (
                      <span className="badge">v{service.version}</span>
                    ) : null}
                  </div>
                  {!service.granted ? (
                    <p className="muted">Not allowed to run on this outpost.</p>
                  ) : service.paths.length > 0 ? (
                    <div className="path-list">
                      {service.paths.map(path => (
                        <code key={path} className="path-tag">
                          {path}
                        </code>
                      ))}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </Section>

        {data.access ? (
          <Section title="Access">
            {data.access.length === 0 ? (
              <Card>
                <p className="muted">Not granted access to any organization or project.</p>
              </Card>
            ) : (
              <div className="service-list">
                {data.access.map(entry => (
                  <Card key={`${entry.organizationId}:${entry.projectId}:${entry.instanceId}`}>
                    <div className="field-grid">
                      <Field label="Organization ID" value={entry.organizationId} />
                      <Field label="Project ID" value={entry.projectId} />
                      <Field label="Instance ID" value={entry.instanceId} />
                    </div>
                    {entry.services.length > 0 ? (
                      <div className="path-list">
                        {entry.services.map(service => (
                          <code key={service} className="path-tag">
                            {service}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            )}
          </Section>
        ) : null}
      </main>

      <footer className="footer">
        {result.status === 'ready'
          ? `Updated ${formatDateTime(result.updatedAt)}`
          : `Showing last known status (updated ${result.updatedAt ? formatDateTime(result.updatedAt) : 'never'})`}
      </footer>
    </div>
  );
};
