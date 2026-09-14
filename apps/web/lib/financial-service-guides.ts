// Enquiry prompts for the existing public service types. These describe what a
// visitor can discuss; they are not provider terms or eligibility requirements.
export type FinancialServiceGuide = {
  introduction: string;
  topics: readonly [string, string, string];
};

export const FINANCIAL_SERVICE_GUIDES: Record<string, FinancialServiceGuide> = {
  "personal-loan": {
    introduction: "Tell us about the expense you are planning, the amount you have in mind and when you need it. Our team can help you explore the next step for your personal loan enquiry.",
    topics: ["The expense you want to cover", "Your budget and preferred repayment period", "When you would like to get started"],
  },
  "business-loan": {
    introduction: "Share what your business needs next, whether that is working capital, equipment or expansion. Start with your funding goal and the timing of the investment you are planning.",
    topics: ["Your business and funding purpose", "The amount and timing you have in mind", "Questions about repayment and available options"],
  },
  "home-loan": {
    introduction: "Buying, building and transferring a home loan involve different plans. Tell us where you are in your property journey so our team can understand the support you are looking for.",
    topics: ["Buying, building or transferring a home loan", "The property location and planned budget", "Your purchase timeline and repayment questions"],
  },
  "loan-against-property": {
    introduction: "If you are considering funding against a property you own, begin with the property and the purpose of the funds. Our team can discuss your enquiry and the information needed for the next step.",
    topics: ["The property you would like to discuss", "How you plan to use the funds", "Your funding amount and repayment questions"],
  },
  "car-loan": {
    introduction: "Share whether you are considering a new or used car and the price range you have in mind. Your purchase plans give our team a starting point for discussing your car loan enquiry.",
    topics: ["A new or used car and your preferred model", "The vehicle price and funding you need", "Your purchase timeline and repayment preferences"],
  },
  "vehicle-loan": {
    introduction: "Tell us about the two-wheeler or commercial vehicle you are planning to purchase. Include how you intend to use it and the budget you are working with when you speak with our team.",
    topics: ["The vehicle type and intended use", "Your purchase budget and funding amount", "Your expected purchase date"],
  },
  "education-loan": {
    introduction: "Start with the course, institution and study destination you are considering. Discuss the costs you want to plan for and your admission timeline with our team.",
    topics: ["Your course, institution and study destination", "Tuition and other planned study expenses", "Admission dates and funding questions"],
  },
  "school-funding": {
    introduction: "Tell us about the educational institution you represent and its funding plans. Share the purpose, amount and timing of the investment so our team can understand the support your institution is looking for.",
    topics: ["Your institution and managing organization", "The funding purpose and amount", "Your project or operating timeline"],
  },
  "secured-loans": {
    introduction: "If you are considering borrowing against an asset, tell us what you would like to discuss and why you need the funds. Our team can help you understand the next step for your enquiry.",
    topics: ["The asset you would like to discuss", "Your funding purpose and amount", "Questions about repayment and pledged assets"],
  },
  "od-and-dod": {
    introduction: "Share how your business uses working capital and when funding needs arise. Discuss overdraft and drop-line overdraft enquiries with our team in the context of your business plans.",
    topics: ["Your business and working-capital needs", "The funding limit and usage you have in mind", "Questions about an overdraft or drop-line facility"],
  },
  "project-funding": {
    introduction: "Tell us about your construction or development project, its current stage and the milestones ahead. A clear outline of the project gives our team context for your funding enquiry.",
    topics: ["Your project location, scope and current stage", "The budget and funding you want to discuss", "Project milestones and expected funding dates"],
  },
  "life-insurance": {
    introduction: "Share the financial protection goals you want to discuss for your family. Our team can help you take the next step and raise the questions that matter to your life insurance enquiry.",
    topics: ["Your family protection goals", "The cover and budget you want to discuss", "Questions about plan terms and exclusions"],
  },
  "health-insurance": {
    introduction: "Tell us who you would like to cover and what you want to understand about a health insurance plan. Begin with your priorities and the questions you would like our team to help with.",
    topics: ["Individual or family cover", "Your priorities and planned budget", "Questions about hospitals, waiting periods and exclusions"],
  },
  "property-insurance": {
    introduction: "Share the type of property you want to discuss and the protection you are looking for. Our team can help you take the next step with your property insurance enquiry.",
    topics: ["The property type, location and use", "The building or contents you want to discuss", "Questions about covered risks and exclusions"],
  },
  "travel-insurance": {
    introduction: "Tell us where you are travelling, your planned dates and who is joining the trip. Your travel plans help our team understand the cover questions you want to discuss.",
    topics: ["Your destination and travel dates", "The travellers and type of trip", "Questions about medical, baggage and cancellation cover"],
  },
  "credit-cards": {
    introduction: "Start with how you expect to use a card and the features you would like to compare. Discuss your spending priorities, fees and repayment questions with our team.",
    topics: ["Your everyday spending and card preferences", "Features, rewards and fees you want to compare", "Questions about billing and repayment"],
  },
};
