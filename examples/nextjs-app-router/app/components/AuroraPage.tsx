import {
  accessBoundary,
  diagnostic,
  type DemoPage,
  integrationStacks,
  integrationSteps,
  policies,
  products,
  prompts,
  resources,
} from '../../lib/provider';
import { CopyablePrompt, WebMCPStatus } from './DemoInteractions';

const navigation = [
  ['/', 'Overview'],
  ['/products', 'Kits'],
  ['/guides/ak-e17', 'Support'],
  ['/shipping-education', 'Policies'],
  ['/guides', 'Guides'],
  ['/agent-access', 'Access'],
  ['/integrate', 'Integrate'],
] as const;

export function AuroraPage({ page }: { page: DemoPage }) {
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Aurora Kits home">
          <span aria-hidden="true">AK</span>
          Aurora Kits
        </a>
        <nav aria-label="Demo pages">
          <ul>
            {navigation.map(([href, label]) => (
              <li key={href}>
                <a href={href} aria-current={page.path === href ? 'page' : undefined}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        {page.view === 'home' && <Home />}
        {page.view === 'products' && <ProductComparison />}
        {page.view === 'diagnostic' && <Diagnostic />}
        {page.view === 'policies' && <Policies />}
        {page.view === 'resources' && <ResourceLibrary />}
        {page.view === 'access' && <AccessBoundary />}
        {page.view === 'integration' && <IntegrationSelector />}
        {page.view === 'resource' && <ResourceArticle page={page} />}
      </main>
      <footer>
        <p>
          Four read-only tools · <a href="/llms.txt">llms.txt</a> · <code>POST /v1/mcp</code> ·
          WebMCP
        </p>
        <p>Next.js reference integration powered by Corsen Context.</p>
      </footer>
    </>
  );
}

function Home() {
  const workflows = [
    {
      path: '/products',
      eyebrow: 'Product discovery',
      title: 'Compare three kits from published facts',
      copy: 'Prices, age guidance, project counts, camera, arm, LiDAR, and ROS 2.',
    },
    {
      path: '/guides/ak-e17',
      eyebrow: 'Support',
      title: 'Retrieve a fixed diagnostic sequence',
      copy: 'Three ordered steps and one explicit stop-and-escalate rule for AK-E17.',
    },
    {
      path: '/shipping-education',
      eyebrow: 'Policy research',
      title: 'Answer a multi-policy question',
      copy: 'EU shipping, verified education discount, returns, and parts warranty.',
    },
    {
      path: '/guides',
      eyebrow: 'Fresh content',
      title: 'Browse six dated guides',
      copy: 'Every guide is a real provider entry with its own retrievable URL.',
    },
  ];

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">WebMCP use-case gallery</p>
          <h1>One useful website. Four explicit tools.</h1>
          <p className="lede">
            Aurora Kits is a fictional robotics catalog built to show how a browser agent can
            research products, support, and policies through owner-published read-only data.
          </p>
          <p className="demo-disclaimer">
            Aurora Kits is a fictional, deterministic demo corpus; prices/policies are not
            commercial offers.
          </p>
          <p className="hero-links">
            <a className="primary-link" href="#try-prompts">
              Try a prompt
            </a>
            <a className="secondary-link" href="/agent-access">
              Check the boundary
            </a>
          </p>
        </div>
        <aside className="tool-panel" aria-labelledby="tool-panel-title">
          <p className="eyebrow" id="tool-panel-title">
            Published interface
          </p>
          <dl>
            <div>
              <dt>search_site</dt>
              <dd>Find the relevant URL</dd>
            </div>
            <div>
              <dt>get_page_content</dt>
              <dd>Retrieve its clean content</dd>
            </div>
            <div>
              <dt>list_content</dt>
              <dd>Browse public records</dd>
            </div>
            <div>
              <dt>get_sitemap</dt>
              <dd>Map the public corpus</dd>
            </div>
          </dl>
        </aside>
        <aside className="browser-status" aria-live="polite">
          <p>
            <strong>Browser WebMCP:</strong> <WebMCPStatus />
          </p>
          <a href="/integrate">Browser setup</a>
        </aside>
      </section>

      <section className="section" id="try-prompts" aria-labelledby="prompt-title">
        <p className="eyebrow">Try with your agent</p>
        <h2 id="prompt-title">Three copyable research prompts</h2>
        <p className="section-intro">
          Copy any prompt into your agent. The page does not simulate an answer or perform an action
          on your behalf.
        </p>
        <ol className="prompt-rail">
          {prompts.map((prompt, index) => (
            <li key={prompt}>
              <span aria-hidden="true">0{index + 1}</span>
              <CopyablePrompt prompt={prompt} index={index + 1} />
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="workflow-title">
        <p className="eyebrow">Different retrieval patterns</p>
        <h2 id="workflow-title">A gallery of real content workflows</h2>
        <div className="card-grid">
          {workflows.map((workflow) => (
            <article className="case-card" key={workflow.path}>
              <p className="eyebrow">{workflow.eyebrow}</p>
              <h3>
                <a href={workflow.path}>{workflow.title}</a>
              </h3>
              <p>{workflow.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="integration-callout" aria-labelledby="integration-callout-title">
        <div>
          <p className="eyebrow">For site owners</p>
          <h2 id="integration-callout-title">Replace the demo provider with your content.</h2>
          <p>
            The human pages and all four tools read from the same records, so URLs and answers stay
            aligned.
          </p>
        </div>
        <a className="primary-link" href="/integrate">
          View the Next.js path
        </a>
      </section>
    </>
  );
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{copy}</p>
    </header>
  );
}

function ProductComparison() {
  return (
    <>
      <PageIntro
        eyebrow="Product discovery"
        title="Compare Aurora robotics kits"
        copy="A compact fact table that can be retrieved from the same provider as this page."
      />
      <div className="table-wrap">
        <table>
          <caption>Published Aurora Kits comparison</caption>
          <thead>
            <tr>
              <th scope="col">Kit</th>
              <th scope="col">Price</th>
              <th scope="col">Published facts</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.name}>
                <th scope="row">{product.name}</th>
                <td className="price">{product.price}</td>
                <td>
                  <ul className="inline-facts">
                    {product.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="evidence-note">
        <strong>Useful chain:</strong> search for “no soldering” or “LiDAR”, then retrieve this page
        with <code>get_page_content</code>.
      </aside>
    </>
  );
}

function Diagnostic() {
  return (
    <>
      <PageIntro
        eyebrow="Support diagnostic"
        title={`${diagnostic.code} — ${diagnostic.title}`}
        copy="The recovery sequence has exactly three steps. Its stop condition is part of the published record."
      />
      <section className="diagnostic-card" aria-labelledby="steps-title">
        <div className="code-badge">{diagnostic.code}</div>
        <h2 id="steps-title">Run once, in this order</h2>
        <ol className="steps">
          {diagnostic.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <aside className="escalation" aria-labelledby="escalation-title">
        <p className="eyebrow">Safety boundary</p>
        <h2 id="escalation-title">When to stop and escalate</h2>
        <p>{diagnostic.escalation}</p>
      </aside>
    </>
  );
}

function Policies() {
  return (
    <>
      <PageIntro
        eyebrow="Policy research"
        title="Four policies, one retrievable page"
        copy="A multi-part question can be answered from explicit policy records without a checkout or form action."
      />
      <dl className="policy-grid">
        {policies.map((policy) => (
          <div key={policy.label}>
            <dt>{policy.label}</dt>
            <dd>{policy.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function ResourceLibrary() {
  return (
    <>
      <PageIntro
        eyebrow="Freshness and discovery"
        title="Six dated guides"
        copy="Each guide has a stable provider URL, title, description, and publication date."
      />
      <ol className="resource-grid">
        {resources.map((resource) => (
          <li key={resource.path}>
            <article>
              <time dateTime={resource.date}>{resource.date}</time>
              <h2>
                <a href={resource.path}>{resource.title}</a>
              </h2>
              <p>{resource.description}.</p>
            </article>
          </li>
        ))}
      </ol>
    </>
  );
}

function AccessBoundary() {
  return (
    <>
      <PageIntro
        eyebrow="Owner control"
        title="What the tools can and cannot access"
        copy="The public contract is intentionally read-only and limited to this site’s published corpus."
      />
      <div className="boundary-grid">
        <section className="boundary can" aria-labelledby="can-title">
          <p className="boundary-mark" aria-hidden="true">
            ✓
          </p>
          <h2 id="can-title">Can access</h2>
          <ul>
            {accessBoundary.can.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="boundary cannot" aria-labelledby="cannot-title">
          <p className="boundary-mark" aria-hidden="true">
            ×
          </p>
          <h2 id="cannot-title">Cannot access</h2>
          <ul>
            {accessBoundary.cannot.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function IntegrationSelector() {
  return (
    <>
      <PageIntro
        eyebrow="Implementation comparison"
        title="Compare integration patterns for your stack"
        copy="This page compares the Next.js, Astro, Express, and static HTML examples; it highlights the pattern rendered here."
      />
      <section className="stack-selector" aria-label="Available integration patterns">
        <ul>
          {integrationStacks.map((stack) => (
            <li className={stack.current ? 'current' : ''} key={stack.name}>
              <span className="stack-name" aria-current={stack.current ? 'page' : undefined}>
                {stack.name}
              </span>
              <span>{stack.detail}</span>
              {stack.current && <strong>Current example</strong>}
            </li>
          ))}
        </ul>
      </section>
      <section className="setup-card" aria-labelledby="setup-title">
        <p className="eyebrow">Next.js App Router</p>
        <h2 id="setup-title">Integration path</h2>
        <ol className="steps compact">
          {integrationSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </>
  );
}

function ResourceArticle({ page }: { page: DemoPage }) {
  const resource = resources.find((item) => item.path === page.path);
  if (!resource) return null;
  return (
    <article className="resource-article">
      <p className="eyebrow">Aurora Kits guide</p>
      <h1>{resource.title}</h1>
      <p className="published">
        Published <time dateTime={resource.date}>{resource.date}</time>
      </p>
      <p className="lede">{resource.description}.</p>
      <div className="resource-copy">{resource.body}</div>
      <p>
        <a href="/guides">← Back to all six guides</a>
      </p>
    </article>
  );
}
