# Aurora Kits WordPress fixture

Aurora Kits is a fictional, deterministic demo corpus; prices and policies are not commercial offers.

This fixture gives a fresh WordPress site enough structured, public content to demonstrate the four read-only Corsen Context tools. It uses only WordPress pages, posts, and portable core-block markup. It does not require Elementor, Elementor Pro, WooCommerce, JavaScript, external media, a form, or a write-capable tool.

The Corsen Context plugin remains the WebMCP implementation. The fixture contains content only; importing it does not install, activate, or configure the plugin.

## Included content

`aurora-kits.wordpress.xml` contains eight published pages and six published posts:

- **Home** — hero, three selectable prompt examples, product comparison, AK-E17 diagnostic, and the agent-access boundary.
- **Products** (`/products/`) — the canonical comparison for Explorer v2, Maker, and Pro.
- **Guides** (`/guides/`) — a dated index of six resource posts plus the support diagnostic.
- **AK-E17 — Maker arm calibration** (`/guides/ak-e17/`) — exactly three fixed steps and an explicit escalation condition.
- **Shipping & education** (`/shipping-education/`) — the canonical policy page.
- **Updates** (`/updates/`) — a small, dated freshness log.
- **Integrate** (`/integrate/`) — the owner-side WordPress/WebMCP path and verification sequence.
- **Agent access** (`/agent-access/`) — a visible Can/Cannot boundary.
- Six dated resource posts published from 18 to 23 August 2026.

Every imported item carries the public custom field `aurora_fixture_id`. It is a cleanup marker, not a deduplication key.

## Before importing

Use a disposable or staging WordPress site. Take a database backup or snapshot first. The standard WordPress WXR importer is **not an idempotent provisioning system**: it may skip some identical items, but a repeated import can create duplicates after titles, dates, authors, or importer behavior change. Do not rerun the import to “repair” an existing fixture. Restore the pre-import snapshot, or remove the previously imported, verified fixture items first.

Requirements:

- WordPress 6.0 or newer.
- Administrator access.
- Pretty permalinks. **Post name** is the expected setting for the resource links in this corpus.
- The current Corsen Context candidate when testing its strict WebMCP contract. A public stable release may expose a different feature set; check its displayed version and release notes.
- A browser/client that actually implements WebMCP when testing the in-page bridge. The WordPress setting alone cannot add `document.modelContext` to an unsupported browser.

Do not put private, draft, membership-only, personalized, or credential-protected content into this demonstration site.

## Import and configure

1. Back up the database, or create a clean disposable WordPress site.
2. In **Settings → Permalinks**, choose **Post name** and save.
3. In **Tools → Import → WordPress**, install the official WordPress Importer if prompted.
4. Import `aurora-kits.wordpress.xml`. Assign the content to a suitable local administrator or allow the importer to create the fictional `aurora-kits` author. There are no attachments to download.
5. In **Settings → Reading**, select **A static page**, set **Homepage** to **Home**, and save.
6. Confirm that the public URLs listed below render and that `/guides/ak-e17/` is a child of `/guides/`.
7. Install and activate Corsen Context using the installation path documented for the candidate being tested.
8. In **Settings → Corsen Context**:
   - enable the public context layer;
   - enable the MCP server;
   - select both `page` and `post` as exposed post types;
   - expose exactly `search_site`, `get_page_content`, `list_content`, and `get_sitemap`;
   - review excluded paths and keep all fixture URLs public;
   - enable WebMCP only for an intended compatible-browser test;
   - leave `llms-full.txt` disabled unless that separate bounded export is specifically under test.
9. Save, then read the Agent Access panel. It should say that the selected tools are read-only and that `page` and `post` are exposed.

The supplied in-page WebMCP bridge sends no API key, cookies, or visitor credentials. Do not embed an MCP key in page source. For this public read-only WebMCP demo, use the plugin's rate-limited public endpoint. If the endpoint is protected with `CORSEN_CONTEXT_API_KEY`, test it with a configured server-side MCP client and leave the in-page WebMCP bridge disabled.

## Automated disposable receipt

From the repository root on Linux, or inside WSL, first build the candidate and
then run the full import receipt:

```sh
pnpm build:wordpress
pnpm verify:wordpress:aurora
```

The verifier requires WP-CLI, MariaDB server binaries, PHP, Node.js, and
network access to download WordPress and the official WordPress Importer into
an isolated temporary site. It does not connect to or mutate an existing
WordPress installation.

The receipt was last reproduced on 30 August 2026 with WordPress 7.0.2,
PHP 8.3.6, Node.js 22.22.2, and candidate plugin 1.4.1. It verified the 8-page,
6-post import, the exact AK-E17 two-tool journey, owner WebMCP revocation,
path exclusion/restoration across tools and `llms.txt` while the human page
remained public, full uninstall, and endpoint removal. Those
environment-specific results do not replace a separate browser receipt on the
final public deployment.

## Expected public URLs

After assigning Home as the static front page and using Post name permalinks:

- `/`
- `/products/`
- `/guides/`
- `/guides/ak-e17/`
- `/shipping-education/`
- `/updates/`
- `/integrate/`
- `/agent-access/`
- `/choose-the-right-aurora-kit/`
- `/explorer-v2-first-24-projects/`
- `/maker-camera-privacy-checklist/`
- `/prepare-an-arm-calibration-session/`
- `/pro-lidar-ros2-lab-setup/`
- `/school-club-launch-checklist/`

If WordPress adds a numeric suffix to a slug, treat that as evidence of a prior conflicting item or duplicate import. Resolve it before recording a demo.

## Verify the two-tool journey

First open Settings > Corsen Context and copy the exact MCP endpoint displayed
there. The same canonical URL can be discovered from the site's `MCP:` line in
`robots.txt` or its HTML `<link rel="mcp">` when those surfaces are enabled.
Do not build the URL by appending `/wp-json/`: a typical pretty-permalink site
uses `/wp-json/corsen-context/v1/mcp`, Plain permalinks can use
`?rest_route=/corsen-context/v1/mcp`, and a filtered REST prefix can differ.
Confirm that exact displayed or discovered URL responds before continuing.

Then use the browser's WebMCP inspector, a compatible in-page agent, or an MCP client to run this exact read-only sequence:

1. Call `search_site` with:

   ```json
   { "query": "AK-E17 Maker arm calibration", "limit": 10 }
   ```

2. Confirm that the result includes **AK-E17 — Maker arm calibration** and returns an absolute URL on the same site.
3. Copy that returned URL exactly into `get_page_content`:

   ```json
   { "uri": "ABSOLUTE_URL_RETURNED_BY_SEARCH_SITE" }
   ```

4. Confirm that the page content contains exactly three numbered calibration steps, in order, followed by the escalation condition.

Repeat the same two-tool pattern for the other deterministic checks:

| Search query                                   | Canonical result     | Required evidence                                                                                                  |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Explorer v2 no soldering 24 projects`         | Products             | EUR 89, age 10+, 24 projects, no soldering                                                                         |
| `Maker camera arm 30 projects`                 | Products             | EUR 179, camera, arm, 30 projects                                                                                  |
| `Pro LiDAR ROS 2`                              | Products             | EUR 449, LiDAR, ROS 2                                                                                              |
| `EU school shipping discount returns warranty` | Shipping & education | EU delivery 2–4 business days and free; verified school/club discount 20%; returns 30 days; parts warranty 2 years |
| `what agents cannot do`                        | Agent access         | no create/edit/delete, order/payment, private content, credentials, or cross-origin reading                        |

Also verify:

- `list_content` with `{"type":"page","page":1,"limit":20}` lists the eight fixture pages.
- `list_content` with `{"type":"post","page":1,"limit":20}` lists the six dated resources.
- `get_sitemap` includes the exposed fixture URLs within the owner's configured content cap.
- The browser page source contains a visible `document.modelContext.registerTool` call only after WebMCP is enabled in the plugin.
- A compatible browser/client lists the same four selected tools. An unsupported browser is an expected environment limitation, not a successful WebMCP test.

## Rollback and repeatable runs

The preferred rollback is to restore the database snapshot made immediately before import. This returns content, authorship, Reading settings, and permalinks to the known pre-test state.

On a disposable WP-CLI site, the marker can help inventory fixture content before manual deletion:

```bash
wp post list --post_type=page,post --post_status=any --meta_key=aurora_fixture_id --fields=ID,post_type,post_status,post_title --format=table
```

Inspect every row. Only after confirming that the list contains this fixture and nothing else, delete those exact numeric IDs using the site's normal backup and change-control practice. The fixture deliberately does not provide a broad automatic delete command.

After rollback, confirm that no item with `aurora_fixture_id` remains, then import once into the clean state. Plugin settings are not part of the WXR file; reset or reconfigure them separately when repeating a browser test.

## Corpus invariants

- Explorer v2 is always **EUR 89**, **age 10+**, **24 projects**, and **requires no soldering**. Its project count remains 24 throughout the corpus.
- Maker is always **EUR 179** and includes a **camera**, an **arm**, and **30 projects**.
- Pro is always **EUR 449** and uses **LiDAR** with **ROS 2**.
- AK-E17 always has exactly three fixed calibration steps before its escalation condition.
- EU delivery is always **2–4 business days** and **free** in this fictional corpus.
- The verified school/club discount is always **20%**; returns are **30 days**; the parts warranty is **2 years**.
- Every callable action described by the fixture is read-only.
