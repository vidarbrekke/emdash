# Founder Strategy Blueprint: Licensing, Pricing, and Marketplace Model for the Commerce Plugin

> Internal strategy document.  
> Purpose: serve as the single source of truth from which we can later derive:
> 1. the Core License summary page,
> 2. the Marketplace Developer Agreement, and
> 3. the public FAQ.
>
> Status: business strategy draft, not legal advice.  
> Action before launch: have counsel convert this into final legal text and enforceable agreements.

---

## 1. Executive summary

We are pursuing a **Balanced launch** built around a **source-available commercial core**, not a GPL/AGPL core.

The model is intentionally designed to achieve all of the following at once:

- keep us in full control of the core codebase;
- monetize the core through paid production licenses;
- monetize our own modules however we choose;
- allow third-party developers to create modules under **any lawful license**, including commercial pay-per-site licenses;
- require that all paid marketplace-listed module transactions happen through **our marketplace**;
- preserve our exclusive right to offer the hosted / managed / SaaS version of the product;
- give developers enough transparency and trust through source availability and a stable extension SDK;
- avoid unnecessary legal or architectural complexity.

This document is deliberately **DRY & YAGNI**. It captures only the policies and structural decisions that matter.

---

## 2. Non-negotiable strategic goals

These are the principles the product and legal structure must preserve.

### 2.1 Core control
We retain sole control over:

- the core codebase;
- the canonical repository;
- merge rights;
- release rights;
- roadmap direction;
- branding and trademarks;
- security patch process;
- hosted / SaaS rights;
- module review and marketplace admission.

### 2.2 Monetization control
We want revenue from four layers:

1. **core commercial licenses**;
2. **official modules we build**;
3. **marketplace transaction fees / revenue share** on third-party paid modules;
4. **hosted / SaaS / managed services** that only we may offer.

### 2.3 Ecosystem growth without losing the business
We want developers to build on top of the platform, but not to weaken the platform's business model.

That means:

- we expose a real extension API / SDK;
- we allow third-party modules under any license;
- we do **not** allow others to turn our core into a competing hosted service;
- we do **not** allow others to sell the core itself as a substitute product;
- we do **not** allow marketplace sellers to bypass our payment and licensing layer for listed paid modules.

### 2.4 Clear external messaging
We must never blur the difference between **open source** and **source-available**.

The core is **source-available commercial software**.

It is not accurate to call it open source if:

- production commercial use requires a paid license;
- hosted / SaaS rights are reserved to us;
- redistribution is restricted.

**Insider tip:**  
Do not compromise on language here. Mislabeling source-available software as open source creates avoidable trust damage with developers and can haunt positioning later.

---

## 3. Why we are not using GPL/AGPL for the main core

This point matters enough to be explicit internally.

A GPL/AGPL core sounds attractive because it appears to combine community legitimacy with commercial licensing. In practice, it conflicts with several of our core goals.

### 3.1 Why GPL/AGPL is the wrong fit for the main runtime
If the core were GPL or AGPL:

- others could use it commercially under that license;
- we could not say "commercial production use requires a paid license" for everyone;
- AGPL would not reserve hosted / SaaS rights to us;
- deeply integrated modules could create licensing ambiguity for third-party commercial extensions.

That clashes directly with our intended business model.

### 3.2 The right interpretation
We want:

- source visibility,
- inspectability,
- developer trust,
- controlled commercialization,
- reserved hosting rights,
- flexible third-party module licensing.

That points to a **source-available commercial core** with a **separate extension SDK / API boundary**, not GPL/AGPL for the main runtime.

**Insider tip:**  
If we ever want a community-facing open-source component, the safest place for it is the SDK, examples, or starter tooling — not the monetizable core runtime.

---

## 4. Product structure

The business model works because the product is split cleanly into four layers.

## 4.1 Core Commerce Engine
Licensed under our **Commercial Source-Available License**.

The core is the product everyone depends on. It must remain under our control.

## 4.2 SDK / Extension API / Developer Tooling
Published under either:

- a permissive developer-facing license, or
- separate developer terms.

This is the "safe surface" for third parties to build against.

## 4.3 Official Modules
Modules built by us and licensed separately by us.

These are one of our main monetization layers.

## 4.4 Hosted / SaaS Companion
Managed services offered only by us.

This becomes one of the strongest long-term moats because services are harder to clone than code.

**Insider tip:**  
The strongest businesses in this category usually stop thinking of "the plugin" as the entire product. The real product becomes a layered system:
core + official modules + marketplace + control plane + hosted services.

---

## 5. Core license blueprint

## 5.1 Name
**Commercial Source-Available License for [Product Name] Core**

This is a working internal name. Counsel can refine the final legal title later.

## 5.2 What the core license should allow
The core license should allow:

- source code inspection;
- local development;
- testing;
- staging;
- evaluation;
- contributions submitted back under our contribution terms.

Depending on our go-to-market strategy, we may also allow limited internal non-production use.

## 5.3 What the core license should require
The core license should require:

- a paid license for any production commercial use;
- paid tiers based on number of production sites or commercial deployments;
- compliance with licensing and branding rules;
- compliance with marketplace and hosted-rights restrictions.

## 5.4 What the core license should prohibit
The core license should prohibit:

- offering the core as a competing hosted, managed, or SaaS service;
- relicensing or sublicensing the core except as expressly allowed;
- selling or redistributing the core as a substitute product;
- removing license notices, copyright notices, or branding notices;
- public commercial forks that function as competing replacements;
- bypassing licensing or update controls.

## 5.5 What the core license should *not* try to do
It should not try to regulate everything.

Avoid:

- vague morality clauses;
- vague "unfair competition" wording;
- deeply complex contributor carve-outs;
- exceptions that only five lawyers will understand.

We want the shortest enforceable set of rights and restrictions that protect the business.

**Insider tip:**  
The best commercial source-available licenses feel boring and obvious. If a customer or developer needs a diagram to understand basic rights, the license is too complicated.

---

## 6. Core control policy

This is not just implied; it should be stated internally and reflected in all agreements.

We retain sole control over:

- the canonical repository;
- release cadence;
- version numbering;
- official update channels;
- security advisories;
- compatibility definitions;
- branding;
- approval of official extension points;
- acceptance or rejection of external patches.

### 6.1 Outside contributions
We may accept outside contributions, but only under a **Contributor License Agreement** or equivalent rights grant.

Reason:

- we must preserve relicensing flexibility;
- we must preserve commercial distribution rights;
- we must avoid future disputes over ownership.

### 6.2 No governance theater
We are not pretending this is community-governed.

This is founder-controlled commercial software with a developer ecosystem around it.

**Insider tip:**  
Do not over-democratize the roadmap too early. Founders often do this to appear friendly, then later regret it when monetization decisions become emotionally or politically harder. We can be developer-friendly without surrendering control.

---

## 7. Extension and SDK strategy

This is one of the most important structural decisions.

## 7.1 Published extension boundary
All third-party modules should integrate through a **published extension API / SDK**.

This should include:

- documented hooks, events, and service boundaries;
- stable packaging rules;
- compatibility targets;
- lifecycle events;
- data contracts where necessary;
- limited examples and starter modules.

## 7.2 Private internals remain private
Anything not documented as public API is private and may change without notice.

This protects our velocity and reduces long-term support burden.

### Product rule
- supported = public API;
- unsupported = private internals.

That is the line.

## 7.3 Marketplace modules should be required to use supported APIs
We should require marketplace-listed modules to use documented extension points wherever possible.

Modules that depend on private internals can be:

- rejected,
- flagged,
- or admitted only with explicit warning and no compatibility guarantee.

**Insider tip:**  
This is not only an engineering hygiene rule. It is a business defense rule. The more code that depends on private internals, the harder it becomes to evolve the platform or create official competing modules later.

## 7.4 Keep the extension API narrow at first
Do not expose every internal capability on day one.

Expose only what is needed for the first wave of valuable modules.

That keeps the surface area smaller, the docs smaller, and future breakage lower.

**Insider tip:**  
A narrow API creates scarcity in a good way. It lets us decide where third parties can innovate without accidentally giving away our future premium module surface.

---

## 8. Official modules strategy

Our own modules are a central revenue layer.

## 8.1 Licensing freedom for official modules
We may license our own modules however we choose, including:

- per site;
- per deployment;
- annual subscription;
- bundle pricing;
- enterprise-only pricing;
- usage-based pricing where justified;
- module bundles;
- premium support bundles.

## 8.2 How we should think about our official modules
We should reserve for ourselves the highest-value and most strategically important categories.

Examples:

- subscriptions;
- advanced B2B pricing;
- bundles and kits;
- wholesale workflows;
- premium tax and shipping integrations;
- ERP / PIM / marketplace sync;
- analytics and reporting;
- search / merchandising / AI;
- returns / RMA;
- multi-store / multi-warehouse;
- operational automation.

## 8.3 How we should position our modules
Official modules should be positioned as:

- the best-supported option;
- the best-tested option;
- the first to support new core versions;
- the safest choice for mission-critical workflows.

**Insider tip:**  
Do not try to own every category. Own the categories that are most likely to become strategic anchors:
mission-critical, high-value, hard to support, or tightly adjacent to future hosted services.

---

## 9. Third-party module licensing strategy

This is one of the defining features of the balanced launch.

## 9.1 Allowed licensing model
Third-party developers may publish modules under **any lawful license**, including:

- permissive open-source licenses;
- copyleft licenses where legally compatible;
- proprietary commercial licenses;
- pay-per-site licenses;
- subscriptions;
- freemium models;
- enterprise agreements;
- usage-based commercial terms.

We do not need to force one license model on all modules.

## 9.2 The non-negotiable rule
If a module is listed in our official marketplace and is a **paid module**, then:

- purchase must happen through our marketplace;
- renewal must happen through our marketplace;
- upgrade must happen through our marketplace;
- license issuance must happen through our marketplace.

This is the monetization gate.

## 9.3 What we are not doing
We are not trying to control how every module author licenses their code.

We are controlling:

- marketplace participation,
- transaction flow,
- platform standards,
- update distribution,
- compatibility expectations.

That is enough.

**Insider tip:**  
This is the sweet spot. Let developers choose their license. Make the marketplace economics non-negotiable. Platform businesses usually make more money controlling distribution than trying to micromanage every seller's code license.

---

## 10. Marketplace strategy

The marketplace is not just a convenience feature. It is a revenue engine and strategic control layer.

## 10.1 Marketplace role
The marketplace exists to do four things:

1. distribute official modules;
2. distribute third-party modules;
3. centralize billing, renewals, updates, and licenses;
4. strengthen the platform's gravitational pull.

## 10.2 Marketplace principles
We should adopt these principles:

1. listing is a privilege, not a right;
2. sellers keep ownership of their module code;
3. sellers choose their own module license;
4. we control review, placement, standards, and removal;
5. paid marketplace-listed modules must transact through our marketplace;
6. the marketplace serves customer trust by centralizing updates and billing.

## 10.3 Marketplace admission
To sell a module, a developer must:

- create a verified seller account;
- sign the Marketplace Developer Agreement;
- pass identity and payout verification;
- submit the module for review;
- comply with security and packaging standards.

We may later require an Agency-tier core license to become a seller.

**Insider tip:**  
Requiring a paid Agency or Partner plan to sell can become a powerful quality filter and monetization lever. It also discourages drive-by low-quality extensions.

## 10.4 Revenue share
Default recommendation at launch:

- platform keeps **20%**
- seller keeps **80%**

Later options:

- 15% for top partners;
- 25% for lower-volume sellers who need more marketplace support.

Keep the default simple.

## 10.5 What we should control operationally
We should control:

- listing approval;
- ranking / featuring;
- security review;
- packaging rules;
- refund workflow;
- update distribution;
- compatibility badges;
- emergency delisting;
- abuse handling.

**Insider tip:**  
Featuring is power. Keep merchandising and search ranking entirely discretionary. That becomes both a quality-control tool and a business lever.

---

## 11. Hosted / SaaS exclusivity strategy

This must be plainly reserved to us.

## 11.1 Reserved right
Only we may offer a hosted, managed, or SaaS version of the core product or substantially similar managed services built directly from it.

That language should appear in:

- the core license;
- the marketplace developer agreement;
- the public-facing FAQ.

## 11.2 Why this matters
Hosted services are:

- recurring;
- sticky;
- higher-margin over time;
- harder to clone;
- strategically important for future upsells.

## 11.3 What third parties may still do
Third parties may:

- build modules;
- implement customer deployments;
- provide consulting;
- provide migration services;
- provide support around customer-owned deployments;

but they may not offer our product itself as a competing hosted service unless we explicitly authorize it.

**Insider tip:**  
Keep "hosted" and "managed service" definitions broad enough to stop obvious substitutes, but not so broad that agencies fear ordinary consulting work will violate the rules.

---

## 12. Trademark and brand policy

We should reserve trademarks aggressively and simply.

## 12.1 We retain sole control over:
- product name;
- logo;
- brand assets;
- "official" designation;
- certification marks, if any.

## 12.2 Third parties may not:
- market themselves as the official core;
- present a fork as our product;
- imply endorsement beyond the marketplace rules;
- use confusingly similar branding.

**Insider tip:**  
Trademark is one of the cleanest defenses against confusion and "shadow official" competitors. Even when code is visible, trademark control keeps the center of gravity anchored to us.

---

## 13. Contribution strategy

## 13.1 Outside patches are optional, not foundational
We should welcome useful contributions, but we should never depend on them to sustain product velocity.

## 13.2 Contribution rule
Any accepted contribution must come with a rights grant that lets us:

- use it commercially;
- modify it;
- sublicense it where needed;
- include it in paid offerings.

### Minimum operational approach
Use:

- a CLA or equivalent contributor rights agreement;
- a contribution guide;
- a clear statement that submission does not guarantee acceptance.

**Insider tip:**  
The contribution process should be easy enough that helpful developers do not bounce, but strict enough that we never lose relicensing freedom.

---

## 14. Recommended pricing strategy

This is the starting pricing structure for the balanced launch.

## 14.1 Core plans

### Free Developer
For local development, testing, staging, and evaluation.

Includes:

- source access;
- local development;
- testing and staging;
- docs;
- SDK;
- example modules.

Excludes:

- production commercial use;
- SLA support;
- hosted features.

Price: **Free**

### Builder
For a single production site.

Includes:

- 1 production site;
- core commercial license;
- standard updates;
- basic email support;
- access to the marketplace.

Price: **$499/year**

### Pro
For growing merchants and more serious deployments.

Includes:

- up to 5 production sites;
- core commercial license;
- priority updates;
- priority support;
- discounted official modules.

Price: **$1,499/year**

### Agency
For implementers and multi-client use.

Includes:

- up to 25 production sites;
- agency deployment rights;
- dev/staging workflows;
- partner support;
- bulk license management;
- marketplace seller eligibility.

Price: **$4,999/year**

### Enterprise
For large merchants, platform partners, or OEM use.

Includes:

- custom volume;
- SLA;
- migration and architecture support;
- security review assistance;
- optional roadmap collaboration.

Price: **custom**

## 14.2 Official module pricing bands
Suggested ranges:

- small utility modules: **$149–$299/year**
- growth modules: **$399–$799/year**
- advanced business modules: **$999–$1,999/year**
- enterprise connectors / workflow modules: **custom**

## 14.3 Hosted / SaaS pricing bands
Suggested ranges:

- starter cloud features: **$49/month**
- growth operations suite: **$199/month**
- advanced analytics / search / automation: **$499+/month**
- enterprise managed services: **custom**

## 14.4 Marketplace revenue share
Recommended default:

- **20% platform fee**
- **80% seller payout**

**Insider tip:**  
Do not start too cheap. Underpricing creates three problems:
1. it lowers perceived seriousness;
2. it makes support margin worse;
3. it leaves no room for partner discounts or future packaging.

---

## 15. Pricing logic and packaging rationale

## 15.1 Why the core is annual
The core should be annual, not lifetime.

Reason:

- security updates are ongoing;
- compatibility work is ongoing;
- support burden is ongoing;
- the ecosystem will evolve.

Recurring pricing matches reality.

## 15.2 Why the entry tier should not be too low
A commerce platform is mission-critical software.

A low-end "race to the bottom" price signals commodity status and attracts customers who are expensive to support relative to revenue.

## 15.3 Why official modules should be separate
Separate modules let us:

- expand average revenue per account over time;
- keep the core lean;
- target high-value workflows selectively;
- avoid giving away future upsells.

## 15.4 Why the marketplace should own the transaction flow
Owning the transaction flow gives us:

- platform fee revenue;
- customer relationship visibility;
- license key control;
- update channel control;
- better abuse prevention;
- more reliable ecosystem data.

**Insider tip:**  
The transaction layer is often more defensible than the code itself. Never give away transaction control unless there is a compelling strategic reason.

---

## 16. What should stay out of the first launch

Do not overbuild the governance or licensing stack.

Avoid at first launch:

- overly complex seller tiers;
- multiple revenue-share formulas by category;
- public voting rights over roadmap;
- dozens of module review badges;
- custom license exceptions for every early partner;
- broad public promises about future open-sourcing of the core;
- deep policy language around edge cases that may never happen.

Launch with the smallest system that enforces the economic model.

**Insider tip:**  
Founders often over-negotiate exceptions early because they want early partners badly. Resist this unless the revenue opportunity is material. Every special exception becomes precedent.

---

## 17. Public positioning guidance

This section is for internal use when later drafting the public site and FAQ.

## 17.1 How we should describe the product
Use language like:

- "source-available core";
- "paid production licenses";
- "official and third-party modules in one marketplace";
- "developer-friendly extension SDK";
- "commercially licensed for production use."

## 17.2 How we should not describe the product
Avoid saying:

- "open source core" if the core is not actually open source;
- "community-governed";
- "free for commercial use" unless that is true;
- "self-host anything" if hosted rights are reserved.

## 17.3 Good positioning sentence
A useful public-friendly sentence to adapt later:

> Inspect the core. Build with confidence. License production use commercially. Extend the platform through official and third-party modules in one trusted marketplace.

**Insider tip:**  
Clarity beats idealism. Developers and buyers can accept source-available if it is explained plainly and the value is real. What they dislike is fuzziness.

---

## 18. Marketplace policy skeleton

This section is here so we preserve structure before later converting it into the Marketplace Developer Agreement.

## 18.1 Seller eligibility
A seller must:

- create an account;
- verify identity and payout details;
- sign the developer agreement;
- submit modules for review;
- comply with packaging, security, and support standards.

## 18.2 Allowed module licenses
Sellers may use any lawful software license for their module, provided that:

- the terms are disclosed clearly;
- the terms do not conflict with marketplace rules;
- the seller does not claim rights over the core;
- the seller does not bypass our checkout for paid marketplace-listed modules.

## 18.3 Paid transaction rule
For any paid marketplace-listed module:

- purchase happens through our marketplace;
- renewal happens through our marketplace;
- upgrade happens through our marketplace;
- refunds are governed by marketplace policy;
- license keys, where applicable, are issued through our marketplace.

## 18.4 Review standards
A module may be approved only if it:

- uses supported APIs where applicable;
- discloses dependencies;
- meets packaging rules;
- meets baseline security review;
- does not degrade core stability;
- does not violate law, privacy rules, or trademark rules.

## 18.5 Removal triggers
A module may be rejected, suspended, or delisted for:

- malware or hidden behavior;
- license circumvention;
- off-platform payment links for listed paid modules;
- false claims;
- repeated breakage;
- abandonment;
- infringement complaints;
- misuse of brand or marks.

## 18.6 Support boundary
- we support the core and our official modules;
- sellers support their own modules unless otherwise stated;
- we may provide marketplace triage, but not full third-party code support by default.

**Insider tip:**  
Keep support boundaries painfully clear. Undefined support expectations can consume more founder time than bad code.

---

## 19. Draft internal "north star" statement

This is the shortest statement of the strategy. Keep it handy.

> We operate a founder-controlled source-available commercial core. We retain sole control of the core codebase, roadmap, releases, trademarks, and hosted offering. We monetize the core through paid production licenses, monetize official modules on our own terms, and run a controlled marketplace where third-party developers may publish modules under any lawful license, including commercial licenses, provided all paid marketplace-listed transactions flow through our marketplace and all modules comply with our API, security, and platform rules.

This statement should remain stable unless the business model materially changes.

---

## 20. Practical launch checklist

This section is operational, so the strategy does not get lost later.

## 20.1 Before launch
Prepare:

- core license summary;
- final legal license text;
- trademark policy;
- contributor agreement;
- marketplace developer agreement;
- marketplace seller terms;
- buyer terms;
- pricing page;
- seller onboarding flow;
- extension packaging spec;
- module review checklist;
- refund and payout policy;
- basic compliance / security process.

## 20.2 Product requirements before opening the marketplace
We should have:

- stable extension loading mechanism;
- clear public API boundary;
- packaging and versioning format;
- compatibility metadata;
- license key and renewal system;
- update delivery mechanism;
- seller admin workflow;
- internal review pipeline.

## 20.3 Messaging requirements before launch
We should be able to answer clearly:

- what is free?
- what requires payment?
- what is source-available?
- what is allowed for module authors?
- why do paid marketplace modules transact through us?
- who can offer hosted services?
- who supports what?

**Insider tip:**  
If a smart developer cannot understand the model in two minutes, adoption will slow. If a smart buyer cannot understand the pricing in one minute, conversions will slow.

---

## 21. Red lines and anti-patterns

These are strategic mistakes to avoid.

### 21.1 Do not call the core open source if it is not
This is the fastest way to create licensing distrust.

### 21.2 Do not expose too much internal API too early
That will weaken future module strategy and slow core evolution.

### 21.3 Do not let sellers bypass the marketplace for listed paid modules
That guts platform economics.

### 21.4 Do not create custom legal exceptions casually
Those become permanent negotiation baggage.

### 21.5 Do not let third-party modules quietly become substitutes for the core
That is how platform leverage erodes.

### 21.6 Do not underprice the core
Mission-critical commerce software should not be priced like a toy.

### 21.7 Do not pretend governance is more open than it really is
Developer trust comes from honesty, not posture.

---

## 22. Future optional moves

These are optional later-stage moves, not launch requirements.

### 22.1 Delayed-open versioning for old releases
We could later choose to relicense old versions under a true open-source license after a set number of years.

Only consider this if it becomes strategically useful for adoption.

### 22.2 Tiered partner program
We could later add:

- certified partner tier;
- featured seller tier;
- OEM partner tier.

Not needed at launch.

### 22.3 Official hosting certification
We could later certify service providers for implementation or support without allowing them to run competing hosted core offerings.

### 22.4 Controlled OEM deals
We may later license the product to hosts, agencies, or platform partners under negotiated terms.

**Insider tip:**  
Keep these as optional moves, not launch commitments. Optionality is valuable. Promises are expensive.

---

## 23. Final recommended strategy

This is the final recommended package.

### Core
- source-available commercial;
- free for development, testing, staging, and evaluation;
- paid for production commercial use;
- founder-controlled;
- hosted / SaaS rights reserved.

### SDK / examples
- developer-friendly and clearly documented;
- open or permissive where useful;
- narrow at first.

### Official modules
- commercial;
- priced however we choose;
- focused on high-value and strategic categories.

### Third-party modules
- any lawful license allowed;
- paid marketplace-listed modules must transact through our marketplace;
- must comply with API, packaging, and security rules.

### Marketplace
- controlled by us;
- 20% default platform fee;
- centralizes billing, renewals, updates, and trust.

### Hosted
- reserved exclusively to us.

### Brand
- reserved aggressively through trademark policy.

---

## 24. Closing note

This strategy gives us the balance we want:

- enough openness to build developer trust,
- enough control to preserve founder leverage,
- enough structure to support a marketplace,
- enough monetization paths to build a real business.

Everything in this document should later roll cleanly into:
1. the Core License summary page,
2. the Marketplace Developer Agreement,
3. the public FAQ.

Until those are drafted, this document is the canonical internal strategy source.
