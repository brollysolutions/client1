# Configurable financial-product application forms

Status: **User-supplied product direction with approved derived implementation shape**

As of: **2026-08-21**

Authority: **Authoritative for the product catalogue, product-specific intake
fields, Admin-to-Client configuration behavior, and the implementation shape
explicitly approved when the user asked to start implementation.**

## 1. Supplied direction

The user requires every product configured by Admin to be reflected in the
Client dashboard, and requires a different application form for each product.
The supplied draft fields were:

1. Personal loan: name, mobile, age, net salary, requested amount, work
   experience, location, and PIN code.
2. Business loan: name, mobile, age, requested amount, income from the latest
   two ITR years, business age, business location, and PIN code.
3. Home loan: name, mobile, age, salaried/self-employed income source, income
   proof, under-construction/ready-to-move/resale property state, property
   value, requested amount, property location, and PIN code.
4. Loan against property: name, mobile, age, salaried/self-employed income
   type, income proof, property type, property value, location, and PIN code.
5. Car loan: name, age, mobile, income source, car company/model, car value,
   and requested amount.
6. Education loan: applicant name/mobile/age/course/university/country/amount;
   co-applicant name/mobile/age/relationship/income source and net income,
   monthly for salaried and annual for self-employed.
7. Vehicle loan: name, mobile, age, income source, net income, vehicle
   company/model, price, and requested amount.
8. Equipment loan: name, mobile, age, income source, net income, equipment
   company/model, price, and requested amount.
9. School funding: name, mobile, school name, organization name, registration
   details, and school age.
10. Secured loan: name, mobile, age, FD/bond/security collateral, applicable
    face or market value, requested amount, and location.
11. Credit cards: name, mobile, age, salaried/self-employed income source,
    location, and PIN code.
12. Insurance: life/term, health, property, and travel variants with the
    supplied identity, income, premium/coverage, property, destination, travel
    date, and transport fields.
13. Project funding: name, mobile, real-estate company type/name/age, completed
    and ongoing project counts, current project value, requested amount,
    project location, and PIN code.

The user explicitly requested professional field names and a recommended field
order because the supplied names and ordering were not final.

## 2. Approved interpretation

### 2.1 Catalogue and workflow

- The Admin and authenticated Client surfaces use one **Financial Products**
  catalogue. The existing internal `loan_types` name may remain for backward
  compatibility.
- Lending and funding products use the existing loan-application lifecycle.
- Credit Cards and Insurance are quote/enquiry products. They share catalogue
  and form behavior but never enter sanction/disbursal states.
- Public marketing catalogue unification is not part of this implementation;
  the requested synchronization boundary is Admin to authenticated Client.
- Equipment Financing replaces the public-only OD/DOD catalogue direction for
  this approved application catalogue. Existing historical database rows are
  deactivated rather than deleted.

### 2.2 Configuration behavior

- Admin can create, rename, order, activate/deactivate, and configure the form
  for a Financial Product without a deployment.
- Only allowlisted field types, validation rules, option lists, and simple
  conditional visibility are accepted. Admin never edits raw JSON, HTML,
  JavaScript, or executable validation expressions.
- A configured form is versioned. Every submitted record stores its form
  version and immutable schema snapshot so later Admin changes do not rewrite
  history.
- A product is available for new Client submissions only when it is active and
  has a valid published form.
- Registered name and mobile are resolved from the authenticated identity and
  are not trusted from submitted answer data. Date of birth replaces mutable
  age wording.

### 2.3 Professional catalogue labels

1. Personal Loan
2. Business Loan
3. Home Loan
4. Loan Against Property
5. Car Loan
6. Education Loan
7. Commercial Vehicle & Two-Wheeler Loan
8. Equipment Financing
9. Educational Institution Funding
10. Loan Against Financial Assets
11. Credit Cards
12. Life & Term Insurance
13. Health Insurance
14. Property Insurance
15. Travel Insurance
16. Real Estate Project Finance

### 2.4 Form ordering

Individual forms begin with Full Name, Registered Mobile Number, and Date of
Birth, then progress through employment/business facts, product/property facts,
requested finance or coverage, declaration, review, and submission.

The canonical ordered field sets are:

- **Personal Loan:** current location, PIN code, employment type, net monthly
  salary, total work experience, requested loan amount.
- **Business Loan:** business/trade name, business constitution, years in
  business, business location, PIN code, latest and previous financial-year ITR
  income, requested loan amount, loan purpose.
- **Home Loan:** employment type, period-aware net income, available income
  documents, property purchase stage, estimated property value, property
  location, PIN code, requested loan amount.
- **Loan Against Property:** employment type, period-aware net income,
  available income documents, property category, ownership status, estimated
  market value, property location, PIN code, requested loan amount, loan
  purpose.
- **Car Loan:** employment type, period-aware net income, new/used condition,
  manufacturer, model and variant, purchase/on-road price, registration
  location, PIN code, requested loan amount.
- **Education Loan:** course/programme, institution/university, country of
  study, admission status, total education cost, requested loan amount, then
  co-applicant name/mobile/date of birth/relationship/employment type and
  period-aware net income.
- **Commercial Vehicle & Two-Wheeler Loan:** employment type, net income,
  vehicle type/intended use, condition, manufacturer, model, quoted price,
  applicant location, PIN code, requested loan amount.
- **Equipment Financing:** business/organization name, business constitution,
  years in operation, income source, period-aware net income, equipment
  category/manufacturer/model, supplier quotation price, business location,
  PIN code, requested finance amount.
- **Educational Institution Funding:** authorized representative name/mobile,
  school/institution name, managing organization/trust/society name,
  registration or affiliation type/number, years in operation, institution
  location, PIN code, funding purpose, requested funding amount.
- **Loan Against Financial Assets:** applicant location, PIN code, collateral
  asset type, issuer/financial institution, conditional face value, conditional
  current market value, requested loan amount.
- **Credit Cards:** employment type, period-aware net income,
  occupation/employer or business name, current location, PIN code, optional
  preferred card benefits.
- **Life & Term Insurance:** product type, employment type, occupation, net
  annual income, desired cover term, desired sum assured, annual premium
  budget.
- **Health Insurance:** coverage type, members to cover, location, PIN code,
  desired sum insured.
- **Property Insurance:** property use, ownership/occupancy, property age,
  estimated reinstatement value, property location, PIN code, desired sum
  insured. Vehicle/equipment cover is outside this product.
- **Travel Insurance:** travellers to cover, trip type, departure location,
  destination countries, departure/return dates, travel purpose, optional
  primary travel mode (Air, Rail, Road, Sea, or Multiple Modes), desired sum
  insured. The transport taxonomy is grounded in Indian insurer proposal forms;
  it remains optional because the precise underwriting requirement varies by
  insurer.
- **Real Estate Project Finance:** authorized representative name/mobile/date
  of birth, developer legal name, business constitution, years in operation,
  RERA registration, completed/ongoing project counts, project name/stage,
  total project cost, requested funding amount, project location, PIN code.

## 3. Conflicts and superseded text

This decision supersedes only the shared-field-set deferral in SRS v1.2 section
5.3, the aligned feature-list revision note, and the `Loan-type custom fields`
row in `current-implementation-state.md`. All other requirements and security
invariants remain in force.

The current Client form accepts only product and amount, `custom_fields` is
read-only, and the public product list is maintained separately. Those are
implementation gaps, not competing product authority.

## 4. Lender configuration supplied 2026-08-21

The user subsequently supplied lender lists for Business Loan, Home Loan, Loan
Against Property, Vehicle Loans, Education Loans, and Equipment Financing, then
explicitly clarified that lender names must not be hardcoded. The later
instruction governs implementation:

- no lender name or product-to-lender availability row is seeded by this
  feature;
- Admin creates, edits, activates, or deactivates lender records and configures
  their product availability through the existing lender management surface;
- the supplied lists are setup reference for the Admin, not executable seed
  data;
- previously merged migrations and their historical reference rows remain
  immutable. Admin can manage those rows through the application.

The supplied insurance classification confirms four independently configurable
products: Health Insurance, Life & Term Insurance, Travel Insurance, and
Property Insurance.
