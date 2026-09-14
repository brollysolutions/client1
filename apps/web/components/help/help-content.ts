import type { UserRole } from "@/lib/auth";

export type HelpTopic = { id: string; title: string; answer: string; href: string; action: string; roles?: UserRole[] };

export const HELP_TOPICS: HelpTopic[] = [
  { id: "account", title: "Create an account and sign in", answer: "Register with your mobile number and verify the one-time code. Use your own number: enquiries and agent introductions are linked to the verified account. An email is optional during ordinary registration. You can complete your profile in Settings after signing in.", href: "/register", action: "Create an account" },
  { id: "otp", title: "I did not receive my verification code", answer: "Check the mobile number shown on the screen and your mobile network. Wait for the resend countdown, then request a new code. Only use the latest code. Never share a password or one-time code with anyone, including someone claiming to be support.", href: "/login", action: "Return to sign in" },
  { id: "password", title: "Reset a forgotten password", answer: "Use password recovery from the sign-in screen and follow the verification steps. If you no longer have your registered mobile number, use the number-change recovery flow instead.", href: "/forgot-password", action: "Reset password" },
  { id: "mobile", title: "Recover access after losing a mobile number", answer: "Verify your replacement number through the mobile-number change flow. Support reviews your identity and a second administrator approves an eligible change. Creating a request does not immediately change your account number.", href: "/change-mobile", action: "Start number recovery" },
  { id: "products", title: "Explore loans, insurance and credit cards", answer: "Choose a category in Explore, compare available providers and open a product for its application or enquiry form. Availability follows the published catalogue. Submitting a request does not guarantee approval, an interest rate or an insurance policy.", href: "/dashboard/explore", action: "Explore products", roles: ["client"] },
  { id: "documents", title: "Submit and track documents", answer: "Open your application or the document section to upload the requested files. Follow the displayed file types and size limits. Administrators verify documents; an upload or employee collection is not itself approval. Keep identity documents inside the platform's secure upload flow.", href: "/dashboard/documents", action: "Open loan documents", roles: ["client"] },
  { id: "property", title: "Find a property and arrange a visit", answer: "Switch to Real Estate, explore listings, save properties and submit an enquiry or request a site visit. Track visit and transport updates in your workspace. Driver and vehicle details appear when the arrangement is ready and you are authorized to view them.", href: "/dashboard/explore", action: "Open Explore", roles: ["client"] },
  { id: "contacts", title: "Who is helping with my enquiry?", answer: "An introducing agent and an assigned officer have different responsibilities. After registration, your contact page shows the introducing agent when attribution is active, plus assigned staff when available. Registration does not mean an application is approved. If staff assignment is pending, use Support for help.", href: "/dashboard/support", action: "Contact support", roles: ["client", "agent"] },
  { id: "referrals", title: "Share a referral and track rewards", answer: "Eligible clients can copy their referral code or share their registration link on WhatsApp. Track conversion and reward status in Referrals. A reward depends on the configured eligibility and completion rules; sharing a code alone does not create a payment. Agents earn commissions through their agent workflow.", href: "/dashboard/referrals", action: "Open referrals", roles: ["client"] },
  { id: "agent-leads", title: "Introduce a lead and follow registration", answer: "Open Leads, introduce the person using their correct mobile number, and share the registration link. Open the lead to see registration, operational status and the attribution deadline. Follow the displayed edit permissions; registering an account and assigning staff are separate events.", href: "/dashboard/leads", action: "Open leads", roles: ["agent"] },
  { id: "calls", title: "Follow up with assigned leads", answer: "Open an assigned lead to review its details, place a call or open WhatsApp, and record the outcome. Keep application, property-deal and task updates in the relevant section. You can only work on records made available to your role and business line.", href: "/dashboard/leads", action: "Open assigned leads", roles: ["telecaller"] },
  { id: "tasks", title: "Complete field work or reopen a cancelled task", answer: "Open Tasks, select your assignment and start work. Record notes and the required outcome before completion. If you cancelled a task by mistake, choose Reopen task and explain why. It returns to Assigned with its documents and notes retained. Completed tasks remain locked, and document approval remains an administrator responsibility.", href: "/dashboard/tasks", action: "Open tasks", roles: ["employee"] },
  { id: "approvals", title: "Review operational queues", answer: "Use the Admin overview to find pending reviews and assignment gaps. Open a queue item for complete details and use the available review actions. Mobile-number changes require independent identity review and final approval; financial approvals retain their existing separation of duties.", href: "/dashboard", action: "Open overview", roles: ["admin"] },
  { id: "campaigns", title: "Prepare and review campaigns", answer: "Prepare content, choose its intended audience, artwork and internal destination, then follow the submission and review workflow. Type a slash in a destination field to browse suggestions. A preview is not evidence that a campaign is published or eligible to appear.", href: "/dashboard/banners", action: "Open banners", roles: ["sub_admin", "admin"] },
  { id: "appearance", title: "Choose Light, Dark or System appearance", answer: "Open the appearance control in navigation or your dashboard account menu. Light and Dark keep your selected appearance; System follows your device. The preference is saved in this browser and applies across public pages, sign-in and dashboards.", href: "/dashboard/settings", action: "Open settings" },
  { id: "tickets", title: "Raise a support ticket and view its progress", answer: "After signing in, open Support, choose a topic and describe the issue. Open a ticket under Your tickets to read its complete message and status. Do not include passwords, OTPs or identity-document numbers. Signed-out visitors can use account recovery and the published support contacts.", href: "/dashboard/support", action: "Open support" },
];

export const START_STEPS: Record<UserRole | "visitor", { title: string; text: string; href: string }[]> = {
  visitor: [
    { title: "Find your starting point", text: "Explore available financial services or property listings.", href: "/loans" },
    { title: "Create your account", text: "Verify your mobile number to keep enquiries together.", href: "/register" },
    { title: "Continue in your workspace", text: "Track applications, visits and support after signing in.", href: "/login" },
  ],
  client: [
    { title: "Complete your profile", text: "Check your account details and optional profile information.", href: "/dashboard/settings" },
    { title: "Explore your options", text: "Choose financial services or switch to Real Estate.", href: "/dashboard/explore" },
    { title: "Track the next step", text: "Return to your overview for application and enquiry progress.", href: "/dashboard" },
  ],
  agent: [
    { title: "Review your agent account", text: "Check your approval and verification status.", href: "/dashboard" },
    { title: "Introduce your first lead", text: "Record the correct mobile number and share registration.", href: "/dashboard/leads/new" },
    { title: "Follow leads and earnings", text: "Open a lead for progress and check commission updates.", href: "/dashboard/earnings" },
  ],
  telecaller: [
    { title: "Check assigned leads", text: "Start with the leads available in your business line.", href: "/dashboard/leads" },
    { title: "Record follow-up", text: "Open a lead, contact the person and save the outcome.", href: "/dashboard/leads" },
    { title: "Review your day", text: "Use your overview to prioritize the next action.", href: "/dashboard" },
  ],
  employee: [
    { title: "Review your assignments", text: "Check due dates and the work requested.", href: "/dashboard/tasks" },
    { title: "Start and document work", text: "Use permitted contact actions and submit the requested evidence.", href: "/dashboard/tasks" },
    { title: "Record the outcome", text: "Complete finished work or explain a blocked task.", href: "/dashboard" },
  ],
  sub_admin: [
    { title: "Review your workspace", text: "See available content and delegated responsibilities.", href: "/dashboard" },
    { title: "Prepare content", text: "Choose the audience, artwork and internal destination.", href: "/dashboard/banners" },
    { title: "Follow review status", text: "Submit completed drafts through the approval workflow.", href: "/dashboard/banners" },
  ],
  admin: [
    { title: "Review the overview", text: "Check pending approvals and staff-capacity gaps.", href: "/dashboard" },
    { title: "Review people and access", text: "Keep roles and business-line access accurate.", href: "/dashboard/users" },
    { title: "Resolve support requests", text: "Open full ticket details and number-change reviews.", href: "/dashboard/support-tickets" },
  ],
};
