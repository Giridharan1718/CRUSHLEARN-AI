// Authored visual explanation content. Content is plain data: no React, no
// executable strings, and no AI-generated claims at runtime.

const electricityCircuit = {
  schemaVersion: 1,
  id: 'electricity-circuit',
  topic: 'How does electricity flow through a simple circuit?',
  title: 'Electricity in a simple circuit',
  aliases: [
    'how does electricity flow',
    'electricity flow',
    'electric circuit',
    'how does a circuit work',
    'battery and lamp circuit',
  ],
  domainId: 'science',
  visualType: 'process',
  durationMinutes: 8,
  learningObjective:
    'Explain how a battery, wires and a load form a closed circuit, and distinguish electric-field propagation from the slow drift of charge carriers.',
  intro: {
    beginner:
      'A circuit is a loop that lets electric charge move. A battery supplies energy, wires give charge a path, and a load such as a lamp turns that energy into light and heat.',
    intermediate:
      'A battery maintains a potential difference across a closed conducting path. The resulting electric field pushes charge carriers through the wires and load, transferring energy from the battery to the load.',
    advanced:
      'In a simple DC model, an electrochemical source maintains a terminal potential difference. Surface charge and the associated electric field establish quickly along the circuit, while charge carriers acquire a slow drift velocity. Energy is transferred through the fields and dissipated in the load; real circuits add internal resistance, capacitance, inductance and transient effects.',
  },
  process: {
    steps: [
      {
        id: 'source',
        title: 'The battery creates a potential difference',
        summary:
          'Chemical reactions separate charge at the battery terminals, giving the circuit a voltage difference to work with.',
        details: {
          beginner:
            'The battery has a positive end and a negative end. Its chemistry pushes charge apart, so the two ends are at different electrical potential energy levels.',
          intermediate:
            'The battery maintains a potential difference, measured in volts. This difference is the source of the electric field that drives current when a closed path exists.',
          advanced:
            'Electrochemical reactions maintain an electric potential difference across the terminals. In an ideal cell this voltage is constant; a real cell has internal resistance, so its terminal voltage drops as current rises.',
        },
        annotations: [
          'Voltage is measured in volts (V).',
          'A battery is an energy source, not a container that simply empties electrons.',
        ],
      },
      {
        id: 'field',
        title: 'The electric field spreads through the circuit',
        summary:
          'The field that pushes charge establishes itself through the conducting path much faster than individual charges move.',
        details: {
          beginner:
            'When the circuit is closed, the push reaches the wires quickly. That does not mean one electron races from the battery to the lamp at the speed of light.',
          intermediate:
            'The electric field is established through the circuit at a speed related to the surrounding electromagnetic properties, while charge carriers drift much more slowly.',
          advanced:
            'Surface charge distribution and the associated field propagate through the circuit on electromagnetic timescales. The drift velocity of carriers is typically far smaller than the signal speed.',
        },
        annotations: [
          'Field propagation and charge drift are different speeds.',
          'The model is simplest for a closed DC circuit with short wires.',
        ],
      },
      {
        id: 'current',
        title: 'Charge carriers drift as current',
        summary:
          'The field causes a net movement of charge. Conventional current points in the direction positive charge would move.',
        details: {
          beginner:
            'Current is the amount of charge passing a point each second. It is measured in amperes, or amps.',
          intermediate:
            'Electrons in a metal drift opposite to conventional current. The conventional direction is still used because it matches the flow of positive charge in many circuit equations.',
          advanced:
            'Current density depends on carrier density, charge and drift velocity. The sign convention is historical and independent of whether the physical carriers are electrons, holes or ions.',
        },
        annotations: [
          'Current is measured in amperes (A).',
          'In metal wires, electron drift is opposite conventional current.',
        ],
      },
      {
        id: 'load',
        title: 'The load converts electrical energy',
        summary:
          'A lamp, motor or resistor converts electrical potential energy into light, motion or heat.',
        details: {
          beginner:
            'The lamp has resistance. As current passes through it, electrical energy becomes light and heat.',
          intermediate:
            'The load has a potential difference across it. The product of current and voltage gives the rate of energy transfer for that component.',
          advanced:
            'A resistive load dissipates energy as heat. A motor or lamp may have a more complex electrical model, but the circuit still transfers energy from the source to the load.',
        },
        annotations: [
          'A load is where useful or unwanted energy conversion happens.',
          'An ideal wire is treated as having negligible resistance in this model.',
        ],
      },
      {
        id: 'return',
        title: 'The return path closes the loop',
        summary:
          'Charge must have a complete path back to the source. Opening the switch interrupts the path and current stops.',
        details: {
          beginner:
            'If the loop is broken, the circuit is open and charge cannot circulate. A switch works by making or breaking that path.',
          intermediate:
            'A closed circuit allows a continuous current. The lamp does not consume electrons; it converts energy while charge circulates back to the source.',
          advanced:
            'In steady state, charge does not accumulate in an ideal series loop. A switch introduces a transient and then an approximately open circuit; real switches and wires can have leakage and capacitance.',
        },
        annotations: [
          'The lamp does not use up electrons.',
          'A switch controls the path, not the battery’s ability to create charge.',
        ],
      },
    ],
    limitations: [
      'This is a simplified DC circuit with ideal wires and a resistive load.',
      'It ignores transient fields, capacitance, inductance and alternating current.',
      'Conventional current is used, while electron drift is in the opposite direction.',
      'Real components have ratings, internal resistance and energy losses that are not shown.',
    ],
  },
  accessibilityDescription:
    'A five-step vertical process from the battery, through electric-field establishment, charge drift and a load, back to the source. Each step is a button and its explanation appears in a separate text panel.',
  workedExample: {
    title: 'A battery, a switch and a lamp',
    body:
      'Connect a battery to a lamp through a switch. With the switch open, the path is broken and the lamp is off. Close the switch and the field is established through the circuit. Electrons drift through the wires and lamp, transferring energy; the lamp converts that energy into light and heat, and the charge continues around the return path to the battery.',
  },
  practice: {
    question: 'Which statement best describes a closed simple circuit?',
    options: [
      'Electrons drift slowly, while the electric field is established quickly through the circuit.',
      'Electrons travel from the battery to the lamp at nearly the speed of light.',
      'The lamp uses up electrons, so fewer electrons return to the battery.',
      'A battery creates brand-new electrons at its positive terminal.',
    ],
    correctIndex: 0,
    explanation:
      'The field establishes quickly along the circuit, but individual charge carriers drift much more slowly. The lamp converts energy; it does not consume the electrons that circulate.',
    hint: 'Separate the speed of the field from the speed of the charges.',
  },
  application: {
    title: 'Why a light switch works',
    body:
      'A switch is a controlled break in the circuit. Opening it interrupts the conducting path, so the sustained current stops. This is also why a loose wire can make a lamp flicker: the path is repeatedly completed and interrupted.',
  },
  provenance: {
    kind: 'authored',
    note:
      'Curated explanatory model. It is not derived from a learner-uploaded source and does not cite a specific external passage.',
  },
  sources: [],
};

export default electricityCircuit;
