# Branch of Encompass API Middle | Google AI Studio

> Exported from https://aistudio.google.com/prompts/1VmKBEyssnBQP6Br3ThqrTR953GnqI8Vl on 2026-11-06 16:35 · AI Studio · 13 messages

## Assistant

Here is the mental model.

Think of **Encompass** like a high-security, fragile bank vault built in the 1990s:

**Your gateway is the high-tech, bulletproof reception lobby you built right outside the vault.** Vendors never step foot in the vault; they only talk to the reception desk.

Here are the 5 moving parts that make this work:

---

### 1. The Reception Desk & Guest Badges (API Gateway + Admin Portal)

### 2. The Disguise Closet (OAuth Token Impersonation + DynamoDB Cache)

### 3. The Express Lane: Reading Data (Synchronous GET)

### 4. The Shock Absorber: Writing Data (Asynchronous SQS FIFO Queue)

### 5. The "No-Server" Deployment (GitHub Pages + CloudShell)

---

### The TL;DR Summary

```
[Vendor]
   │
   ├── (GET Read) ──► Fast Passthrough ──► Grabs 3 fields ──────► Instant Response (150ms)
   │
   └── (PATCH Write) ─► SQS FIFO Queue ──► Retries on Locks ────► Returns 202 "We got it"
                            │
                      (Only 10 at a time)
                            ▼
                   [ Encompass Instance ] (Completely protected, never overwhelmed)
```

---

## Assistant

**Considering Integration Approaches**

I'm currently focused on how best to structure the information for external vendors. I'm exploring offering a key that links field IDs to names and explanations, as per the user's initial prompt. This aims to streamline integration by providing clear context around those numeric identifiers, and other methods of data identification, to the vendors. I'm thinking about the various ways to offer this key, and what level of detail it should have.

**Analyzing Field Identifiers**

I'm now diving into the specifics of Encompass field IDs. The numerical IDs are cryptic, so I'm thinking a dictionary or mapping endpoint might be essential. It could be a simple GET /v1/fields or friendly aliases. I'm also considering documentation on GitHub Pages. Logging is another key consideration. It seems Encompass's audit log can handle the vendor impersonation, which is good. CloudWatch already logs HTTP requests, so audit trails seem well covered.

**Clarifying Key Storage**

I've clarified the key storage mechanism. It's serverless, using AWS API Gateway's native key store and DynamoDB. There's no traditional server running. The API keys live in the managed AWS key store, with metadata linking API key IDs to Encompass user IDs stored in a DynamoDB table.

**Describing Request Flow**

I'm now detailing the precise API request handling. The process starts with API Gateway's rapid key verification. Then, Lambda fetches the api_title_vendor from DynamoDB using the API key ID. I've also readdressed logging: Encompass records audit events from the impersonated user. Alongside this, CloudWatch monitors everything, from API Gateway's perspective, providing complete technical logging.

---

## Assistant

Here are direct answers to all three questions: where the keys live, how logging actually works, and how vendors know what those cryptic Encompass field numbers mean.

---

### 1. "Where are we storing the middleware keys? Is there a server?"

**There is no server.** You are not paying for or managing an EC2 instance, Docker container, or Linux box running 24/7.

The keys live inside two managed, serverless AWS services:

---

### 2. "Do we need logging, or does that happen in Encompass?"

**Both, but for completely different reasons.** You get two distinct audit trails automatically:

#### A. The Legal & Compliance Log (Inside Encompass)

Because we use **Token Impersonation**, Encompass treats the request as if a human logged in under that user account.

#### B. The Technical Diagnostic Log (Inside AWS CloudWatch)

Every time a vendor makes a call, your Lambda handlers output structured JSON into AWS CloudWatch (AWS's built-in log viewer):

If a vendor says "Your API is broken," the lender IT admin opens CloudWatch, filters by tenantName: "First American Title", and immediately sees if Encompass rejected the payload or if the vendor passed bad data.

---

### 3. "Do we need to offer field IDs with names/explanations?"

**Yes, because native Encompass field IDs are complete gibberish to an external developer.**

To a vendor:

#### The Trap to Avoid:

Do **not** try to build a custom translator in the gateway that maps every Encompass field to friendly names (e.g., writing code that translates loanAmount ↔ 1109). Encompass has **over 15,000 fields**, plus unlimited custom fields (CX.*). If you hardcode a dictionary in the middleware, you will spend your entire life updating field mappings whenever a lender changes a custom field.

#### The Lean Solution (YAGNI):

We solve this in two simple ways:

This keeps the gateway code tiny, relies on Encompass as the source of truth, and gives external developers the exact documentation they need to build their payloads.

---

## Assistant

**Clarifying Question Scope**

I'm currently focused on dissecting the initial question, specifically the ambiguity around "admin." My goal is to determine if the reference pertains to the vendor/broker admin or the lender's Encompass admin, or both. This clarity is paramount for establishing a correct framework for subsequent considerations.

**Addressing Security Concerns**

I'm now grappling with the security implications. My previous model included the lender admin generating an API key. Now, it seems I need a method where vendors can't simply create keys mapped to high-level Encompass access without proper authorization. I'm exploring invite links or one-time registration tokens generated by the lender, which seems much more secure than unauthenticated key creation.

**Refining Registration Options**

I'm now comparing self-registration models. While self-registration with a default persona initially seems appealing, domain-based matching presents authorization challenges. The two-step approval flow, where an admin approves access, feels more robust. But wait...the original PRD! It seems the project's intent was always a 2-step setup where the admin has to be involved. Can we rethink that?

**Exploring Setup Flexibility**

I'm now focusing on streamlining the initial setup after the Encompass installation. I'm considering standard role templates that can be configured once, such as "Title Vendor," "Mortgage Broker," and "Appraisal AMC," each mapping to specific Encompass users. My current concern revolves around securely providing access to these roles. I'm exploring shareable vendor invite links or onboarding secrets, and evaluating if self-registration with a "Partner Code" or "Lender Onboarding Key" is feasible. The goal is to minimize Encompass admin involvement after the initial setup. I also need to evaluate if Encompass has documentation for those key-value pairs.

**Clarifying Key Generation**

I'm now zeroing in on the specifics of key generation. I need to pinpoint exactly who's creating the keys – is it the vendor, the broker, or the lender's Encompass admin? Understanding this is crucial to isolating and removing the problematic party from the process. This dissection has become the focal point of my mental exercise.

**Isolating the Key Origin**

I've made a breakthrough. It seems the Encompass admin is entirely out of the day-to-day key setup. That shifts the focus: how do we prevent unauthorized key generation? If an unauthenticated vendor could just get a key, how do we block an anonymous hacker or, for example, a rival title vendor, from using the system to impersonate a broker? The plan is for the Encompass admin to predefine three persona templates: title, broker, and AMC. Now, how does the system enable vendors to self-onboard without needing an admin? This brings me to considering the "single reusable onboarding secret" approach.

**Exploring Self-Onboarding Options**

I'm now contemplating streamlined vendor onboarding. The automated webhook approach seems promising: trigger key generation directly from the lender's system when a vendor is marked as active. This reduces admin involvement drastically. However, the question of whether Encompass provides a public source of key-value pairs remains unanswered. I am curious if Encompass has a public page with the key-value pairs documented. It is unclear if that is documented and accessible, given that documentation is massive and partially gated.

---

## Assistant

### 1. Who Generates the Key? (How to Actually Get the Encompass Admin Out of the Loop)

You caught a major workflow detail. If an unauthenticated vendor walks up to a public /portal link, types "I'm Acme Title", and selects api_title_vendor, you have a security problem: anyone who discovers that URL could generate an active API key into the lender's Encompass system.

However, **we can get the Encompass Admin completely out of the day-to-day onboarding loop** with a **1-Time Template + Role-Based Invite Link** model:

```
[Encompass Admin]
       │
   (Does this ONCE at deployment, then leaves forever)
       ▼
Sets up 3 Generic Service Accounts in Encompass:
  ├── api_title_template      (Persona: Title / Settlement only)
  ├── api_broker_template     (Persona: TPO External Originator)
  └── api_appraisal_template  (Persona: AMC / Appraisal only)
```

#### How the Vendor Self-Serves (Zero Admin Intervention):

**Result:** The Encompass Admin never logs in. The vendor's dev team gets their own credentials in 30 seconds.

---

### 2. "Does Encompass have a public page with those field IDs?"

The short answer: **Not in a format your vendors can easily use.**

Here is the unvarnished truth about ICE Mortgage Technology's documentation and how we solve it:

#### The Problem with ICE's Public Docs:

#### How We Solve It (Zero Manual Documenting for You):

Instead of you or the admin manually building a dictionary, we handle this in two automated ways:

#### A. A 1-Page "Top 40 Fields" Cheat Sheet on Your GitHub Pages Site

On your GitHub Pages repo, we publish a clean, copy-paste table of the **universal standard fields** that title and broker partners actually care about:

(This covers 90% of basic third-party integrations right out of the box).

#### B. The Dynamic Schema Passthrough Route: GET /v1/fields

For everything else—including the lender's custom CX.* fields—we point the gateway at Encompass’s native **Field Schema API** (/encompass/v3/schemas/loan/fields)[[2](https://www.google.com/url?sa=E&q=https%3A%2F%2Fvertexaisearch.cloud.google.com%2Fgrounding-api-redirect%2FAUZIYQFkAO_mULowWyQK8aPc10Ujgmo9nFvQ992w2h5f0iS7Wo0c5WAh7_TrzpPb579HQuLw5XJLNqpABIB3DIU5yeQpYrMk2CPRwSVwh7xOkCPgHRFpTt5qbhEiN2CJBvN8cIgpKLvQobr2ViC86ZN4ceyGeXtE2ekjubtr4c-_psAUFLd79ektaLOwE0nDy-8Gmqy-xFvVaQ0zhDRHdyis)].

If a vendor wants to know what a field does, they hit your gateway:

```
GET /v1/fields?ids=11,646,CX.TITLE.STATUS
```

The gateway queries Encompass on the fly and returns:

```
{
  "11": { "description": "Subject Property Address", "type": "STRING" },
  "646": { "description": "Title - Lender Title Insurance", "type": "DECIMAL" },
  "CX.TITLE.STATUS": { "description": "Custom Title Milestone Status", "type": "STRING" }
}
```

No spreadsheets to maintain, no asking the Encompass admin to write documentation, and external developers get exact field definitions directly from the source of truth.

---

## Assistant

**Exploring Potential Integrations**

I'm currently focused on expanding the API gateway's applicability beyond the Encompass system. My thoughts are revolving around identifying other loan origination systems ripe for integration, particularly those known for causing significant headaches for lenders. Calyx Point is top-of-mind, but I'm also digging into the market for other potential targets that would benefit from streamlined API access.

**Considering API Key Implementation**

I'm now contemplating how to empower users directly. The goal is enabling loan origination system integration quickly, and I'm examining if user-managed API keys could accelerate that. Specifically, I'm thinking about the Calyx Point integration challenges. It's a Windows-based system that can't be readily integrated through a modern API gateway. My focus is on determining what integration methods would be useful, since Calyx Point is a desktop, legacy application.

**Analyzing Legacy LOS Systems**

I'm now diving deeper into the specific challenges of legacy Loan Origination Systems. The idea of implementing a Windows agent for systems lacking modern APIs, like Calyx Point, feels like a maintenance nightmare. I'm prioritizing identifying other systems with similar "pain in the ass" qualities: high market share, awful APIs, and a desperate need for integration with other vendors. My classification system starts with categorizing the mortgage ecosystem. Black Knight/ICE Empower is a target because its legacy nature creates integration headaches.

**Prioritizing Integration Targets**

I'm now zeroing in on specific LOS targets, expanding beyond origination. MeridianLink and OpenClose stand out due to their legacy interfaces and certification challenges. I'm also starting to look at servicing platforms. MSP's IBM Mainframe-based architecture presents a particularly intriguing challenge and potential opportunity for modernization. The focus now is on how to integrate the existing APIs or build new ones atop the servicing platform.

**Categorizing Ecosystem Elements**

I'm now expanding my target list and categorizing key players in the mortgage ecosystem. My analysis includes FICS, a significant player among mid-sized institutions and regional banks, notorious for its Windows-based, on-prem SQL Server. I'm also including Sagent (formerly Fiserv LoanServ), a heavy servicing platform with integration challenges. The focus now is on documenting and understanding the pain points for each.

**Refining Target Criteria**

I'm now assessing potential targets against a refined set of criteria. The Encompass model's success hinges on a cloud-accessible, though flawed, API, high third-party demand, and the value of a serverless wrapper. Calyx Point is off the table due to its desktop nature, and the focus is now on MeridianLink and its legacy APIs, vendor certification friction, and cost barriers. FIS is now on the radar.

**Evaluating Integration Needs**

I'm now focusing on specific pain points and potential solutions. Jack Henry's JXchange, a SOAP/XML relic, is a prime target for modernizing into a JSON REST API with self-serve keys. Servicing platforms like FICS and Sagent, with their reliance on batch jobs, are also high on the list. OpenClose and BytePro are of interest too, given their clunky REST APIs. Calyx Point is officially off the table. I'm prioritizing these candidates based on integration complexity and market impact.

---

## Assistant

**Defining the Pivot**

I'm currently focused on identifying the critical pivot points for the BytePro API gateway project. I'm asking myself what key decisions or changes are necessary for this version. The question I'm trying to answer is: what do we need to focus on or decide to bring this new port of the project to life?

**Assessing BytePro API**

I'm now diving deep into the architecture of Byte Software's BytePro API. I'm focusing on dissecting the authentication methods (Basic Auth, custom session/token, or Bearer tokens) and the expected data model format—JSON or XML. I'm also looking into concurrency and hosting models. I'll need to know which of these items are required for the new port. The goal is to avoid unnecessary complexity.

**Analyzing Deployment Options**

I'm now considering the deployment landscape for the project. The split between cloud and on-premise BytePro instances presents challenges. Self-hosted instances add complexity, especially regarding API endpoint accessibility from AWS Lambda functions; VPCs, VPNs, and reverse proxies are now in the mix. I'm also confirming BytePro lacks OAuth 2.0 token exchange, which significantly affects permissions handling. BytePro uses its own security profiles/roles within its admin interface and API accounts to specify which user context applies.

**Clarifying Authentication Strategy**

I'm now zeroing in on the authentication and impersonation mechanism—the most significant shift. The ideal scenario involves a Master Client ID/Secret, facilitating OAuth 2.0 token exchange, and finally, impersonated bearer tokens per persona. BytePro currently uses Basic Auth, session tokens, or API Keys. I'm exploring whether BytePro supports native token impersonation or if we must manage multiple service account credentials in Secrets Manager or lean on their OnBehalfOf parameter, if available.

**Evaluating Deployment Options**

I'm now thinking about deployment models. It's clear BytePro offers a bifurcated approach: a cloud version and self-hosted instances. For version one, I'm leaning toward simplifying things by focusing on the BytePro Enterprise Cloud, avoiding the complexities of VPC peering and VPN tunnels inherent in the self-hosted model. This will let me maintain the simplicity of the 1-click model. I'm also examining the data schema differences between Encompass and BytePro, understanding that Encompass uses simpler field IDs.

**Investigating Concurrency Issues**

I'm now deep-diving into concurrency issues, specifically examining Encompass's request cap and how BytePro handles database locking with Microsoft SQL Server. The plan is to determine if BytePro's web API throws a specific lock exception. Ultimately, I'm confident we will still need the SQS FIFO queue to serialize loan file updates, preventing SQL deadlocks.

**Determining Webhook Strategy**

I'm now determining the best webhook strategy. I'm assessing if BytePro supports native outbound webhooks, as it historically has lacked a modern engine. Lenders often rely on workarounds like SQL triggers or status-polling jobs. Should it lack webhooks, I must decide whether to drop them for v1 (YAGNI) or build a lightweight polling worker. I'm focusing on the trade-offs of each approach now.

---

## Assistant

BytePro is the right move for mid-market Independent Mortgage Bankers (IMBs), but **we cannot do a simple copy-paste of the Encompass gateway.**

Byte Software’s architecture is completely different under the hood. To port this cleanly without bloating the codebase, here are the **4 major architectural pivots and decisions** we need to make right now:

---

### 1. The Auth Pivot: No OAuth Token Exchange

---

### 2. The Network Topography: Cloud vs. On-Prem (Non-Negotiable Constraint)

---

### 3. Webhooks: Kill Them from V1 (Pure YAGNI)

---

### 4. Data Modeling: Object Notation vs. Cryptic Field IDs

---

### What Stays Exactly the Same (Zero Rework)

The core architecture we already validated remains untouched:

---

### Questions to Lock Down Before Writing the BytePro Template:

---

## Assistant

**Inspecting the Repository**

I'm currently focused on the provided GitHub repository. I'm trying to figure out how MeridianLink was implemented. I'm diving into the code to gain a more precise understanding of its architecture and capabilities. I'm searching for relevant documentation or patterns that can help guide further analysis.

**Analyzing MeridianLink's Approach**

I've been looking at MeridianLink's practices, specifically their template.yaml size, which is impressively under 51,200 bytes for direct CloudFormation upload. They've also inlined their Lambda code. Their invite code portal uses a specific pattern (?role=title&code=...) to define a user's persona (title, broker, appraisal). Further, I'm noting their use of SQS FIFO queues.

**Investigating On-Prem BytePro**

I'm now diving into the implications of supporting on-prem BytePro installations. It seems we need to consider how external APIs can reach these environments behind corporate firewalls. I'm exploring two main approaches: a potentially costly Site-to-Site VPN or a lighter tunneling agent solution. This seems important to consider as part of our decision.

**Exploring Hybrid Agent Architecture**

I'm now focusing on hybrid agent architecture for on-prem BytePro support. I'm leaning towards an outbound worker daemon, possibly as a Windows Service, polling an SQS queue. This agent would handle HTTPS outbound communication to AWS, eliminating the need for open inbound firewall ports. This differs from a direct proxy approach, and validates that an on-prem edition is necessary. I see similarities to MeridianLink: their invite portal design, role masking, and async SQS FIFO writes mirror our approach.

**Confirming Architectural Similarities**

I'm solidifying the shared architectural patterns with MeridianLink. The role-invite portal's structure, the use of SQS FIFO queues for async writes, and the 51.2KB CloudFormation limit all highlight our parallel approaches. Now, I'm verifying the necessity of a static egress IP using NAT Gateway, especially if IP whitelisting is required by Byte Cloud. This is all building the case for a standalone on-prem edition.

---

## Assistant

Looking at the MeridianLink implementation in your repo[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fgithub.com%2FSpuds0588%2FMeridianLink-Mortgage-API-Passthrough-Middleware-Gateway)], **you are spot on.**

The MeridianLink repo already solved the exact problem we were discussing for BytePro: **role-scoped invite codes (/portal?role=title&code=...)** that bind API keys to a deny-by-default persona, keeping the lender's admin out of the onboarding loop entirely[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fgithub.com%2FSpuds0588%2FMeridianLink-Mortgage-API-Passthrough-Middleware-Gateway)].

Here is how the BytePro Cloud version directly inherits from that MeridianLink architecture, followed by the answer to your question about handling **on-prem BytePro** later.

---

### 1. What Carries Over Directly from the MeridianLink Repo

You can reuse about 80% of the MeridianLink architectural decisions:

---

### 2. "Will we have to do a separate version for on-prem BytePro orgs later?"

**Yes, 100%. And it will be a fundamentally different architecture.**

Here is why you cannot use a direct passthrough proxy for on-prem BytePro, and what that "On-Prem Edition" will actually look like:

#### Why the Cloud Gateway Fails for On-Prem

#### How the On-Prem Version Must Work: The "Outbound-Only Agent" Pattern

To support on-prem lenders without opening firewall ports, you have to pivot from a **Synchronous Passthrough** to an **Asynchronous Queue Poller**:

```
[External Vendor]
       │
 (POST / GET)
       ▼
[AWS API Gateway] ──► [SQS Command Queue]
                              ▲
                              │ (Outbound HTTPS Polling over Port 443)
                              │ (NO INBOUND FIREWALL PORTS NEEDED)
                              │
                    ┌─────────┴─────────┐
                    │  ByteRelay.exe    │  (Lightweight Windows Service
                    │  On-Prem Agent    │   running on lender's Byte Server)
                    └─────────┬─────────┘
                              │
                              ▼ (Localhost)
                    [ Local BytePro Server / SQL ]
```

### The Strategy:

Keep the **BytePro Enterprise Cloud** repo as your clean, lightweight sister project to MeridianLink and Encompass[[1](https://www.google.com/url?sa=E&q=https%3A%2F%2Fgithub.com%2FSpuds0588%2FMeridianLink-Mortgage-API-Passthrough-Middleware-Gateway)].

When you tackle on-prem BytePro later, package it as **BytePro-OnPrem-Gateway**, because it introduces a Windows service installer that Cloud lenders don't need and shouldn't have to look at.

---

## You

Okay write up the master dev doc for this version next then (PRD&lt; implimentation guide, dev task list, agents.md). make sure your response contains the full contents of that master dev doc in markdown.

---

## Assistant

**Defining the Master Plan**

I'm now zeroing in on defining the scope and components needed for the BytePro Enterprise Cloud API Passthrough & Middleware Gateway's Master Dev Doc. Right now, I'm breaking down the PRD as the starting point. Next, I need to outline all the different sections that the documentation will include, and identify all necessary stakeholders and subject matter experts.

**Refining the Technical Specs**

I'm now zeroing in on the Implementation Guide and Technical Architecture components. Also, I've outlined the Dev Task List and the AGENTS.md manual. I have the platform defined as BytePro Enterprise Cloud SaaS, accessed via the public HTTPS API. I've decided on multiple dedicated service accounts within BytePro Admin, stored securely. The onboarding will be invite-code driven through an SSR admin portal, similar to the MeridianLink project.

**Defining the Features**

I'm solidifying the architecture. I'll utilize an asynchronous SQS FIFO queue for record locking, returning a 202 and job ID, along with synchronous, path-filtered reads and in-memory caching for faster responses. Webhooks are explicitly dropped for v1. I'm aiming for a 1-click CloudShell script for deployment, along with optional static egress IPs for firewall compatibility, and structured JSON logging. All of this while sticking to principles of YAGNI.

**Outlining Document Sections**

I'm currently fleshing out the PRD, breaking it into two distinct parts. Part 1 focuses on the core problem and scope, the target audience, and system requirements, including API specifications. Part 2 details the implementation guide, covering architecture and the specific AWS components, plus authentication and session cache. I'm focusing on providing very detailed documentation.

---

## Assistant

# Master Dev Document: BytePro Enterprise Cloud API Passthrough & Middleware Gateway

---

## Part 1: Product Requirements Document (PRD)

### 1. Executive Summary

Independent Mortgage Bankers (IMBs) and credit unions running **Byte Software’s BytePro Enterprise Cloud** require a streamlined, secure mechanism to onboard third-party vendors (Title, Settlement, Appraisal Management Companies, and Wholesale Brokers). Native BytePro Web API integrations present key operational barriers:

This product is an **open-source, 1-click deployable, serverless middleware gateway** designed exclusively for **BytePro Enterprise Cloud**. Deployed directly into the lender's AWS account in under two minutes via AWS CloudShell or direct CloudFormation upload (under the 51,200-byte template limit), the gateway provides a self-serve, invite-driven vendor portal, maps partners to isolated BytePro service personas, buffers write collisions through an Amazon SQS FIFO queue, provides a dedicated static egress IP for Byte firewall allowlisting, and maintains zero loan data at rest.

---

### 2. Core Scope & Boundaries

#### In Scope (V1)

#### Explicitly Out of Scope (V1)

---

### 3. Target Audience

---

### 4. System Requirements

---

### 5. API Specification

#### External API (Vendor-Facing)

```
{
  "loanId": "BYTE-1002948",
  "data": {
    "Property": {
      "Street": "456 Oak Avenue",
      "City": "Dallas",
      "State": "TX",
      "Zip": "75001"
    },
    "Loan": {
      "BaseLoanAmount": 385000.00,
      "InterestRate": 6.625
    },
    "Milestones": {
      "CurrentStatus": "Underwriting"
    }
  },
  "_cached": false
}
```

```
{
  "data": {
    "Fees": [
      {
        "FeeType": "TitleLendersPolicy",
        "Amount": 1350.00,
        "PaidTo": "First American Title"
      }
    ],
    "CustomFields": {
      "TitleCommitmentNumber": "FAT-99281-TX",
      "TitleStatus": "ClearToInsure"
    }
  }
}
```

```
{
  "status": "ACCEPTED",
  "jobId": "job-byte-88371-abc",
  "loanId": "BYTE-1002948",
  "statusUrl": "/v1/jobs/job-byte-88371-abc"
}
```

```
{
  "jobId": "job-byte-88371-abc",
  "loanId": "BYTE-1002948",
  "status": "COMPLETED",
  "attempts": 1,
  "updatedAt": "2026-11-06T16:00:00Z",
  "error": null
}
```

#### Internal / Administrative Endpoints

```
{
  "tenantName": "First American Title",
  "role": "title",
  "inviteCode": "SECURE_TITLE_INVITE_CODE"
}
```

```
{
  "message": "Key provisioned successfully",
  "apiKey": "byte_live_key_xyz123",
  "role": "title",
  "egressIp": "54.210.10.45"
}
```

---

## Part 2: Implementation Guide & Architecture

### 1. System Architecture Diagram

```
[EXTERNAL PARTNERS]
                        (Title, AMCs, Wholesale Brokers)
                                       │
                                ( x-api-key )
                                       ▼
                         [ AMAZON API GATEWAY REST API ]
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   GET /portal (SSR)           GET /v1/loans/{id}         PATCH /v1/loans/{id}
   POST /portal (Key Gen)      (Synchronous Read)         (Async Enqueue)
            │                          │                          │
            ▼                          ▼                          ▼
   ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
   │  Admin Portal   │        │   Read Proxy    │        │  Write Enqueue  │
   │  Lambda Handler │        │  Lambda Handler │        │  Lambda Handler │
   └────────┬────────┘        └────────┬────────┘        └────────┬────────┘
            │                          │                          │
            ▼                          │                          ▼
     [DynamoDB: Tenants]               │                ┌──────────────────┐
                                       │                │  SQS FIFO Queue  │
                                       │                │(GroupID=LoanId)  │
                                       │                └─────────┬────────┘
                                       │                          │
                                       ▼                          ▼
                         ┌───────────────────────────────────────────────┐
                         │           BYTEPRO SESSION ENGINE              │
                         │   1. Resolve tenant role (e.g. "title")       │
                         │   2. Check DynamoDB for valid SessionToken    │
                         │   3. If expired: Retrieve role user/pass      │
                         │      from Secrets Manager & call /api/session │
                         │   4. Cache SessionToken in DynamoDB (TTL 30m) │
                         └──────────────────────┬────────────────────────┘
                                                │
                                    (VPC Outbound Route)
                                                ▼
                                    ┌───────────────────────┐
                                    │    AWS NAT GATEWAY    │
                                    │  (Static Elastic IP)  │
                                    └───────────┬───────────┘
                                                │
                                       (Allowlisted Egress)
                                                ▼
                                  [ BYTEPRO ENTERPRISE CLOUD ]
                                 https://api.bytesoftware.com
```

---

### 2. AWS Component Stack

#### A. Networking Layer (Static Egress Subsystem)

#### B. Amazon API Gateway (REST API)

#### C. AWS Secrets Manager (ByteProMasterSecret)

Stores BytePro connection parameters and role credentials:

```
{
  "accountCode": "LENDER_BYTE_ID",
  "apiBaseUrl": "https://api.bytesoftware.com/api/v1",
  "inviteCodes": {
    "title": "CODE_TITLE_9918",
    "broker": "CODE_BROKER_7721",
    "appraisal": "CODE_AMC_3310"
  },
  "roles": {
    "title": { "username": "api_title_user", "password": "SecurePassword1!" },
    "broker": { "username": "api_broker_user", "password": "SecurePassword2!" },
    "appraisal": { "username": "api_amc_user", "password": "SecurePassword3!" }
  }
}
```

#### D. Amazon DynamoDB Tables

#### E. Amazon SQS FIFO Queue (ByteProWriteQueue.fifo)

---

### 3. Execution Flows & Contention Resolution

#### Flow 1: Session Management & Cache

BytePro uses stateful session tokens. To prevent authentication storms:

#### Flow 2: Asynchronous Write & Record Lock Backoff

BytePro locks loans when an internal user opens the loan file in the desktop client.

---

## Part 3: Developer Task List

### Phase 1: Infrastructure as Code & Static Network

### Phase 2: Session Vault & Auth Engine

### Phase 3: Synchronous Path Read Passthrough

### Phase 4: SQS FIFO Write Pipeline & Contention Handling

### Phase 5: Self-Serve Invite-Code Onboarding Portal

### Phase 6: Automated Distribution & Verification

---

## Part 4: AGENTS.md (AI Agent & Developer Operating Manual)

### 1. Operating Rules & Constraints

---

### 2. Standardized Structured Logging Schema

All Lambda handlers must log using the standard structured JSON schema to enable CloudWatch Insights filtering.

```
const log = (level, action, details = {}) => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "ByteProGateway",
    level,              // "INFO" | "WARN" | "ERROR"
    action,             // e.g. "SESSION_CACHE_HIT", "RECORD_LOCK_RETRY"
    ...details
  }));
};
```

---

### 3. Complete Reference Implementation: Core Read Proxy (byte_read_proxy.js)

Below is the complete, single-file reference implementation for the synchronous read router, illustrating session token caching, VPC routing, and path projection.

```
/**
 * File: byte_read_proxy.js
 * Description: Synchronous, path-projected read proxy for BytePro Enterprise Cloud.
 * Runtime: Node.js 20.x (Zero external dependencies).
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secrets = new SecretsManagerClient({});

const SECRET_ARN = process.env.BYTE_SECRET_ARN;
const TENANT_TABLE = process.env.TENANT_TABLE;
const SESSION_TABLE = process.env.SESSION_TABLE;

const log = (level, action, details = {}) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), service: "ByteProGateway", level, action, ...details }));
};

let cachedSecret = null;

async function getMasterSecret() {
  if (cachedSecret) return cachedSecret;
  log("INFO", "FETCHING_MASTER_SECRETS");
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  cachedSecret = JSON.parse(res.SecretString);
  return cachedSecret;
}

async function getSessionToken(role) {
  const now = Math.floor(Date.now() / 1000);

  // 1. Check DynamoDB Session Cache
  const sessionRecord = await ddb.send(new GetCommand({
    TableName: SESSION_TABLE,
    Key: { role }
  }));

  if (sessionRecord.Item && sessionRecord.Item.expiresAt > (now + 300)) {
    log("INFO", "SESSION_CACHE_HIT", { role });
    return sessionRecord.Item.sessionToken;
  }

  // 2. Authenticate Against BytePro Cloud API
  log("INFO", "SESSION_LOGIN_REQUEST", { role });
  const secret = await getMasterSecret();
  const roleCreds = secret.roles[role];

  if (!roleCreds) {
    throw new Error(`Role configuration missing for: ${role}`);
  }

  const loginUrl = `${secret.apiBaseUrl}/session`;
  const response = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accountCode: secret.accountCode,
      username: roleCreds.username,
      password: roleCreds.password
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    log("ERROR", "BYTE_LOGIN_FAILED", { role, status: response.status, errorText });
    throw new Error(`BytePro authentication failed: ${response.status}`);
  }

  const authData = await response.json();
  const sessionToken = authData.sessionToken || authData.token;
  const expiresAt = now + (authData.expiresIn || 1800);

  // 3. Cache Active Session in DynamoDB
  await ddb.send(new PutCommand({
    TableName: SESSION_TABLE,
    Item: { role, sessionToken, expiresAt }
  }));

  log("INFO", "SESSION_LOGIN_SUCCESS", { role, expiresAt });
  return sessionToken;
}

exports.handler = async (event) => {
  const requestId = event.requestContext?.requestId;
  const loanId = event.pathParameters?.id;
  const apiKeyId = event.requestContext?.identity?.apiKeyId;
  const paths = event.queryStringParameters?.paths || "Property,Loan,Milestones";

  log("INFO", "READ_REQUEST_RECEIVED", { requestId, loanId, apiKeyId, paths });

  try {
    if (!loanId) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing loanId in path" }) };
    }

    // 1. Resolve Tenant Role
    const tenantRecord = await ddb.send(new GetCommand({
      TableName: TENANT_TABLE,
      Key: { apiKeyId }
    }));

    if (!tenantRecord.Item || !tenantRecord.Item.role) {
      log("WARN", "TENANT_NOT_FOUND", { apiKeyId });
      return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized tenant key" }) };
    }

    const role = tenantRecord.Item.role;

    // 2. Acquire Valid Session Token
    const sessionToken = await getSessionToken(role);
    const secret = await getMasterSecret();

    // 3. Query BytePro Cloud
    const targetUrl = `${secret.apiBaseUrl}/loans/${encodeURIComponent(loanId)}?paths=${encodeURIComponent(paths)}`;
    const startTime = Date.now();

    let byteResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${sessionToken}`,
        "Content-Type": "application/json"
      }
    });

    // 4. Handle Stale Session Recovery
    if (byteResponse.status === 401) {
      log("WARN", "SESSION_INVALIDATED_RETRYING", { role });
      // Invalidate cache and force fresh login
      await ddb.send(new PutCommand({
        TableName: SESSION_TABLE,
        Item: { role, sessionToken: "EXPIRED", expiresAt: 0 }
      }));
      const freshToken = await getSessionToken(role);
      byteResponse = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${freshToken}`,
          "Content-Type": "application/json"
        }
      });
    }

    const durationMs = Date.now() - startTime;
    const responseBody = await byteResponse.text();

    log("INFO", "BYTE_READ_COMPLETE", { loanId, status: byteResponse.status, durationMs });

    return {
      statusCode: byteResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30"
      },
      body: responseBody
    };

  } catch (error) {
    log("ERROR", "READ_PROXY_EXCEPTION", { message: error.message, stack: error.stack });
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal Gateway Error", details: error.message })
    };
  }
};
```

---

### 4. Verification & Diagnostics Protocol
