/** Single source of truth for both the generated HTML and read-only tools. */
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3010').replace(/\/$/, '');

export const prompts = [
  'Compare Explorer v2, Maker, and Pro for an 11-year-old beginner who cannot solder.',
  'Find support code AK-E17, give me the three calibration steps, and tell me when to escalate.',
  'Check EU shipping, school discounts, returns, and the parts warranty for a verified robotics club.',
];

export const products = [
  { name: 'Explorer v2', price: '€89', facts: ['Ages 10+', '24 guided projects', 'No soldering'] },
  { name: 'Maker', price: '€179', facts: ['Camera', 'Robotic arm', '30 guided projects'] },
  { name: 'Pro', price: '€449', facts: ['LiDAR', 'ROS 2'] },
];

export const diagnostic = {
  code: 'AK-E17',
  title: 'Maker arm calibration',
  steps: [
    'Power the Maker kit off, disconnect USB-C, and wait 30 seconds.',
    'Place the arm on a level surface with every joint aligned to its neutral marker, reconnect power, then run Settings → Arm calibration → Zero.',
    'After the zero cycle ends, run the built-in pick-and-place test once and confirm every joint returns to its neutral marker.',
  ],
  escalation:
    'Stop and escalate with code AK-E17 if the code returns after this single calibration, a joint cannot reach neutral, or the arm grinds or becomes hot. Do not repeat calibration.',
};

export const policies = [
  { label: 'EU shipping', value: 'Free standard delivery in 2–4 business days.' },
  { label: 'Schools and clubs', value: '20% discount after school or club verification.' },
  { label: 'Returns', value: 'Return eligible kits within 30 days.' },
  { label: 'Parts warranty', value: 'A 2-year parts warranty is included.' },
];

export const resources = [
  {
    path: '/guides/agent-access-policy.html',
    title: 'Agent access policy',
    description: 'The current read-only WebMCP access and content-boundary reference',
    date: '2026-08-28',
    body: 'Aurora Kits exposes only four read-only tools for public content. The policy lists what an agent can retrieve and what remains unavailable.',
  },
  {
    path: '/guides/maker-arm-calibration.html',
    title: 'Maker arm calibration guide',
    description: 'The three fixed AK-E17 recovery steps and escalation conditions',
    date: '2026-08-21',
    body: `${diagnostic.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\nEscalation: ${diagnostic.escalation}`,
  },
  {
    path: '/guides/choose-a-robotics-kit.html',
    title: 'Choose your first robotics kit',
    description: 'Explorer v2, Maker, and Pro comparison by price and included capabilities',
    date: '2026-08-14',
    body: 'Explorer v2 is €89 for ages 10+, includes 24 guided projects, and requires no soldering. Maker is €179 with a camera, robotic arm, and 30 guided projects. Pro is €449 with LiDAR and ROS 2.',
  },
  {
    path: '/guides/robotics-club-rollout.html',
    title: 'Robotics club rollout checklist',
    description: 'Verified school or club discount, EU delivery, returns, and warranty checklist',
    date: '2026-08-07',
    body: 'Confirm school or club verification for the 20% discount. EU standard delivery is free and takes 2–4 business days. Eligible kits can be returned within 30 days, and kit parts have a 2-year warranty.',
  },
  {
    path: '/guides/pro-ros2-map-lab.html',
    title: 'Pro ROS 2 map lab',
    description: 'A lab outline for the Pro kit using ROS 2 and LiDAR',
    date: '2026-07-31',
    body: 'This lab identifies the two Pro capabilities needed for a mapping exercise: ROS 2 and LiDAR. Check the Pro kit comparison before planning the lab.',
  },
  {
    path: '/guides/maker-camera-project.html',
    title: 'Maker camera project guide',
    description: 'A project-planning guide for the Maker kit camera and robotic arm',
    date: '2026-07-24',
    body: 'The Maker kit includes both a camera and a robotic arm. Use this guide to identify those components before choosing one of its 30 guided projects.',
  },
];

export const accessBoundary = {
  can: [
    'Search public titles and descriptions with search_site.',
    'Read a public page as clean Markdown with get_page_content.',
    'Browse public pages and posts with list_content.',
    'Retrieve the bounded public URL map with get_sitemap.',
  ],
  cannot: [
    'Buy, reserve, or add a kit to a cart.',
    'Submit a form or open a support ticket.',
    'Read customer accounts, private records, or draft content.',
    'Act on another site or call a tool the owner did not publish.',
  ],
};

export const integrationStacks = [
  { name: 'Next.js', detail: 'App Router handlers plus a deferred bridge script', current: false },
  {
    name: 'Astro',
    detail: 'Server endpoints plus a bridge script in the page shell',
    current: false,
  },
  {
    name: 'Express',
    detail: 'Routes mounted beside the existing content provider',
    current: false,
  },
  {
    name: 'Static HTML',
    detail: 'Generated files plus one same-origin MCP function',
    current: true,
  },
];

export const integrationSteps = [
  'Install @corsenai/corsen-context in the build and function environment.',
  'Replace the demo records in content.mjs with your published page records.',
  'Run npm run build to generate HTML, llms.txt, llms-full.txt, and the browser bridge.',
  'Deploy public/ and function/server.js on one origin, then verify search_site followed by get_page_content.',
];

export const pages = [
  {
    path: '/',
    title: 'Static HTML WebMCP Demo - Corsen Context',
    description:
      'Copyable prompts for product comparison, AK-E17 support, and EU school policy research',
    type: 'page',
    lastModified: '2026-08-28',
    view: 'home',
    markdown: `# Aurora Kits WebMCP use-case gallery\n\nUse the site through four explicit read-only tools.\n\n## Copyable prompts\n\n${prompts.map((prompt) => `- ${prompt}`).join('\n')}\n\n## Demonstrated workflows\n\n- Compare Explorer v2, Maker, and Pro.\n- Diagnose support code AK-E17.\n- Check EU shipping, verified school or club discounts, returns, and warranty.\n- Review current guides and access boundaries.`,
  },
  {
    path: '/products',
    file: '/products/index.html',
    title: 'Compare Aurora robotics kits',
    description:
      'Explorer v2 €89 ages 10+ with 24 projects and no soldering; Maker €179 camera arm 30 projects; Pro €449 LiDAR ROS 2',
    type: 'page',
    lastModified: '2026-08-14',
    view: 'products',
    markdown: `# Compare Aurora robotics kits\n\n${products.map((product) => `## ${product.name} — ${product.price}\n\n${product.facts.map((fact) => `- ${fact}`).join('\n')}`).join('\n\n')}`,
  },
  {
    path: '/guides/ak-e17',
    file: '/guides/ak-e17/index.html',
    title: 'AK-E17 Maker arm calibration',
    description:
      'Three fixed Maker arm calibration steps plus the AK-E17 stop and escalation condition',
    type: 'page',
    lastModified: '2026-08-21',
    view: 'diagnostic',
    markdown: `# ${diagnostic.code} — ${diagnostic.title}\n\n## Recovery steps\n\n${diagnostic.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\n## Escalation\n\n${diagnostic.escalation}`,
  },
  {
    path: '/shipping-education',
    file: '/shipping-education/index.html',
    title: 'EU delivery, education discount, returns, and warranty',
    description:
      'Free EU delivery in 2–4 business days, verified schools and clubs 20% off, 30-day returns, 2-year parts warranty',
    type: 'page',
    lastModified: '2026-08-07',
    view: 'policies',
    markdown: `# Customer policies\n\n${policies.map((policy) => `## ${policy.label}\n\n${policy.value}`).join('\n\n')}`,
  },
  {
    path: '/guides',
    file: '/guides/index.html',
    title: 'Aurora Kits guide library',
    description:
      'Six dated guides covering WebMCP access, AK-E17, kit choice, clubs, ROS 2 LiDAR, and the Maker camera',
    type: 'page',
    lastModified: '2026-08-28',
    view: 'resources',
    markdown: `# Guide library\n\n${resources.map((resource) => `## ${resource.title}\n\nPublished ${resource.date}. ${resource.description}.`).join('\n\n')}`,
  },
  {
    path: '/agent-access',
    file: '/agent-access/index.html',
    title: 'What the read-only tools can and cannot access',
    description:
      'Public search, page content, content lists, and sitemap are available; purchases, forms, accounts, drafts, and other sites are not',
    type: 'page',
    lastModified: '2026-08-28',
    view: 'access',
    markdown: `# Agent access boundary\n\n## Can access\n\n${accessBoundary.can.map((item) => `- ${item}`).join('\n')}\n\n## Cannot access\n\n${accessBoundary.cannot.map((item) => `- ${item}`).join('\n')}`,
  },
  {
    path: '/integrate',
    file: '/integrate/index.html',
    title: 'Compare WebMCP integration patterns: static HTML example',
    description:
      'Static HTML integration comparison with generated pages, same-origin MCP function, WebMCP bridge, and two-tool verification steps',
    type: 'page',
    lastModified: '2026-08-28',
    view: 'integration',
    markdown: `# Compare integration patterns\n\n${integrationStacks.map((stack) => `- ${stack.name}: ${stack.detail}${stack.current ? ' (this example)' : ''}`).join('\n')}\n\n## Static HTML setup\n\n${integrationSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
  },
  ...resources.map((resource) => ({
    path: resource.path,
    file: resource.path,
    title: resource.title,
    description: resource.description,
    type: 'post',
    lastModified: resource.date,
    view: 'resource',
    markdown: `# ${resource.title}\n\nPublished ${resource.date}.\n\n${resource.body}`,
  })),
];
