const startupRevenue = {
  schemaVersion: 1,
  id: 'startup-revenue',
  topic: 'How does a startup make money?',
  title: 'How a startup turns a customer problem into revenue',
  aliases: [
    'how does a startup make money',
    'startup revenue',
    'startup business model',
    'how do startups earn money',
    'revenue and profit',
  ],
  domainId: 'business',
  visualType: 'process',
  durationMinutes: 8,
  learningObjective:
    'Distinguish revenue, cost, profit and cash flow while tracing how a startup acquires and serves paying customers.',
  intro: {
    beginner:
      'A startup makes money by solving a problem someone will pay for. Revenue is the money customers pay. Profit is what remains after the costs of delivering and running the business.',
    intermediate:
      'A business model connects a customer problem to a value proposition, an acquisition channel, a transaction and the cost of delivery. Revenue is the inflow from sales; profit subtracts costs over a period; cash flow tracks when money actually moves.',
    advanced:
      'A viable model needs a repeatable path from a defined customer segment to willingness to pay, with acquisition and delivery economics that can support the chosen growth strategy. Revenue, gross margin, contribution margin, operating profit and cash conversion are distinct measures; none alone proves durability.',
  },
  process: {
    steps: [
      {
        id: 'problem',
        title: 'Find a customer problem worth paying for',
        summary:
          'The startup identifies a specific group with a painful, frequent or valuable problem.',
        details: {
          beginner:
            'People pay when a product saves them time, money or effort, or helps them do something they care about. The problem needs to matter enough to someone.',
          intermediate:
            'A useful customer segment shares a problem and a context. The team validates that the problem is real and that the segment can be reached, rather than assuming demand from a clever idea.',
          advanced:
            'Problem validation combines qualitative research with behavioural evidence. Segment definition, urgency, existing alternatives and willingness to pay matter more than a large but unqualified total addressable market.',
        },
        annotations: [
          'A customer segment is not simply “everyone”.',
          'Interest is weaker evidence than repeated use or payment.',
        ],
      },
      {
        id: 'value',
        title: 'Offer a value proposition customers choose',
        summary:
          'The product must be better than the customer’s current alternative in a way the customer values.',
        details: {
          beginner:
            'The startup explains what the product does, who it helps and why it is better than what people use today.',
          intermediate:
            'The value proposition combines a promised outcome with a reason to believe it. The relevant comparison is the customer’s existing alternative, including doing nothing.',
          advanced:
            'Positioning depends on the buying context, switching costs and proof. A differentiated capability only becomes value if the target segment recognises it and can act on it.',
        },
        annotations: [
          'The alternative may be a spreadsheet or a manual process, not a competitor app.',
          'A feature is not automatically a benefit.',
        ],
      },
      {
        id: 'acquisition',
        title: 'Reach customers through a repeatable channel',
        summary:
          'Marketing, sales and distribution create awareness and bring qualified customers into the buying process.',
        details: {
          beginner:
            'A startup has to tell people the product exists. That can happen through advertising, content, sales conversations or referrals.',
          intermediate:
            'A channel is useful when it reaches the target segment at an acquisition cost the business model can support. Teams compare reach, conversion and payback rather than raw traffic.',
          advanced:
            'Acquisition economics connect channel spend to qualified demand and eventual contribution margin. Attribution is noisy, channel saturation is real, and scaled spend often behaves differently from a small pilot.',
        },
        annotations: [
          'Acquisition cost is not the same as the product price.',
          'A channel that works at small scale may not work at large scale.',
        ],
      },
      {
        id: 'transaction',
        title: 'Convert interest into a paid transaction',
        summary:
          'A customer agrees to pay through a subscription, one-time purchase, usage fee or another pricing model.',
        details: {
          beginner:
            'Revenue appears when a customer pays. The price and payment frequency are part of the business model.',
          intermediate:
            'Pricing can be subscription, usage-based, transactional or a mix. Conversion depends on trust, proof, purchase friction and whether the promised outcome is clear.',
          advanced:
            'Pricing captures value and shapes incentives. Contract terms, refunds, discounts and payment timing affect recognised revenue and cash collection. Booked revenue is not necessarily cash received.',
        },
        annotations: [
          'Revenue is an inflow from sales, not the same as profit.',
          'Annual contracts can create revenue and cash-timing differences.',
        ],
      },
      {
        id: 'delivery',
        title: 'Deliver the product and account for costs',
        summary:
          'Serving customers costs money. The startup must understand both the cost of delivery and its operating expenses.',
        details: {
          beginner:
            'It costs money to make and support the product. Profit is what is left after those costs.',
          intermediate:
            'Cost of goods sold includes direct delivery costs such as hosting or support. Operating expenses include research, sales and administration. Gross profit is revenue minus cost of goods sold.',
          advanced:
            'Contribution margin measures revenue minus variable costs. Gross margin includes direct delivery costs; operating margin also subtracts operating expenses. Unit economics must be interpreted with scale effects and fixed costs.',
        },
        annotations: [
          'Revenue − costs = profit for the period, before taxes and other items.',
          'High revenue with unsustainable delivery costs can still be a weak business.',
        ],
      },
      {
        id: 'retain-reinvest',
        title: 'Retain customers and reinvest what works',
        summary:
          'Repeat purchase and retention determine whether the model can grow without replacing every customer.',
        details: {
          beginner:
            'If customers stay or buy again, the startup can keep earning. Some of that money can fund better products and reaching more customers.',
          intermediate:
            'Retention, churn and expansion affect lifetime value. A business can reinvest in acquisition, product or delivery, but each choice consumes cash or margin.',
          advanced:
            'Sustainable growth depends on payback, retention cohorts, expansion and the marginal return on reinvestment. Growth that requires ever-increasing acquisition spend can consume cash even while revenue rises.',
        },
        annotations: [
          'Revenue growth and cash generation are different outcomes.',
          'Retention matters most when acquiring a replacement customer is expensive.',
        ],
      },
    ],
    limitations: [
      'This is a simplified business-model walkthrough, not financial advice.',
      'Startups vary widely: marketplaces, hardware, services and regulated products have different economics.',
      'It omits taxes, financing, working capital, refunds and many accounting details.',
      'The process is not a guarantee of a viable or ethical business.',
    ],
  },
  accessibilityDescription:
    'A six-step vertical process from identifying a customer problem through value proposition, acquisition, paid transaction, delivery costs, and retention or reinvestment. Each step opens a detailed explanation.',
  workedExample: {
    title: 'A simple subscription example',
    body:
      'A team sells a $50 monthly subscription. In one month it collects $50,000 from 1,000 customers. Hosting and support cost $20,000, so gross profit is $30,000 before operating expenses such as salaries and marketing. Revenue is $50,000; it is not the same as profit.',
  },
  practice: {
    question:
      'A startup collects $50,000 from customers and spends $20,000 directly delivering the service. What is its revenue?',
    options: ['$20,000', '$30,000', '$50,000', '$70,000'],
    correctIndex: 2,
    explanation:
      'Revenue is the $50,000 inflow from customers. The $30,000 difference is gross profit before other operating expenses; revenue and profit are different measures.',
    hint: 'Revenue is the money coming in from sales, before subtracting delivery costs.',
  },
  application: {
    title: 'Why revenue headlines can mislead',
    body:
      'A company can report growing revenue while losing money on every sale or running out of cash. When evaluating a business, ask what it sells, who pays, how often they pay, what delivery costs, and when cash actually arrives.',
  },
  provenance: {
    kind: 'authored',
    note:
      'Curated explanatory model. It is not financial advice and is not derived from a learner-uploaded source.',
  },
  sources: [],
};

export default startupRevenue;
