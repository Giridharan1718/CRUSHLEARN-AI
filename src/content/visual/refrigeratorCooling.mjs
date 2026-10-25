const refrigeratorCooling = {
  schemaVersion: 1,
  id: 'refrigerator-cooling',
  topic: 'How does a refrigerator keep food cold?',
  title: 'Moving heat out of a refrigerator',
  aliases: [
    'how does a refrigerator work',
    'how does a fridge work',
    'refrigerator cooling',
    'keep food cold',
    'fridge cooling cycle',
  ],
  domainId: 'general',
  visualType: 'process',
  durationMinutes: 7,
  learningObjective:
    'Describe the repeating vapour-compression cycle that moves heat from inside a refrigerator to the surrounding room.',
  intro: {
    beginner:
      'A refrigerator does not create cold. It moves heat from inside the fridge to the room outside. A refrigerant and a compressor keep that transfer going.',
    intermediate:
      'A vapour-compression system circulates refrigerant through an evaporator, compressor, condenser and expansion valve. The refrigerant absorbs heat inside, is compressed to a higher temperature, releases heat outside, then expands and repeats.',
    advanced:
      'The vapour-compression cycle uses phase change and pressure differences to move enthalpy from a cold reservoir to a warmer one. Work input at the compressor enables heat rejection at the condenser; real systems add controls, fans, defrost cycles and losses.',
  },
  process: {
    steps: [
      {
        id: 'evaporate',
        title: 'Cold refrigerant absorbs heat inside',
        summary:
          'Liquid refrigerant evaporates in the evaporator, taking heat from the refrigerator compartment.',
        details: {
          beginner:
            'A cold liquid inside the fridge turns into a gas. As it changes phase, it absorbs heat from the food and air around it.',
          intermediate:
            'Low-pressure refrigerant enters the evaporator and boils at a low temperature. The phase change absorbs heat, cooling the compartment.',
          advanced:
            'The evaporator operates at low pressure so the refrigerant’s saturation temperature is below the compartment temperature. Enthalpy is absorbed as the mixture evaporates; airflow and heat-exchanger design affect the rate.',
        },
        annotations: [
          'Heat moves from the colder compartment to the colder refrigerant.',
          'The compartment is cooled by removing heat, not by adding “cold”.',
        ],
      },
      {
        id: 'compress',
        title: 'The compressor raises pressure and temperature',
        summary:
          'The compressor takes low-pressure vapour and compresses it, making it hot enough to reject heat to the room.',
        details: {
          beginner:
            'A pump squeezes the gas. Squeezing raises its pressure and temperature.',
          intermediate:
            'The compressor adds work to the refrigerant, raising its pressure and temperature so it is warmer than the surrounding room.',
          advanced:
            'Compression raises the refrigerant’s saturation pressure and temperature. Real compression is not ideal or isentropic; motor efficiency, heat loss and refrigerant properties determine the outlet state.',
        },
        annotations: [
          'The compressor uses electrical energy.',
          'The refrigerant must leave hot enough for the next step to transfer heat outward.',
        ],
      },
      {
        id: 'condense',
        title: 'The condenser releases heat outside',
        summary:
          'Hot high-pressure refrigerant condenses on the coils behind or beneath the fridge, giving heat to the room.',
        details: {
          beginner:
            'The hot gas travels through coils outside the fridge. It cools and turns back into a liquid, releasing heat into the kitchen.',
          intermediate:
            'In the condenser, refrigerant rejects heat to room air and condenses. The back of the refrigerator therefore warms while the inside cools.',
          advanced:
            'The condenser’s saturation temperature must exceed ambient temperature for heat rejection. Condenser airflow, coil fouling and ambient conditions change the rejection rate and system efficiency.',
        },
        annotations: [
          'The heat removed from the food ends up in the room.',
          'Warm coils are an expected part of the process.',
        ],
      },
      {
        id: 'expand',
        title: 'The expansion valve lowers pressure',
        summary:
          'The high-pressure liquid passes through a restriction, dropping its pressure and temperature before returning to the evaporator.',
        details: {
          beginner:
            'A narrow valve lets the liquid expand. It becomes cold again and is ready to absorb more heat.',
          intermediate:
            'The expansion device drops refrigerant pressure, lowering its temperature before it enters the evaporator. Some refrigerant may flash into vapour.',
          advanced:
            'An expansion valve or capillary tube creates a pressure drop and meters flow. The resulting low-pressure mixture has a lower saturation temperature, allowing heat absorption in the evaporator.',
        },
        annotations: [
          'This step prepares the refrigerant to absorb heat again.',
          'The cycle is continuous while the compressor runs.',
        ],
      },
      {
        id: 'control',
        title: 'The thermostat repeats the cycle',
        summary:
          'Sensors and controls switch the compressor on and off to hold the compartment near a target temperature.',
        details: {
          beginner:
            'A thermostat checks the temperature. When the fridge is cold enough, it can pause the compressor; when it warms, the cycle starts again.',
          intermediate:
            'The control system balances compressor runtime against the target temperature. Door openings, room temperature and food load change how much heat enters.',
          advanced:
            'Thermostats, thermistors and electronic controllers manage setpoints, defrost and compressor cycling. Efficiency depends on insulation, door seals, heat load, refrigerant and system design.',
        },
        annotations: [
          'The process runs in a loop, not as a one-time sequence.',
          'Opening the door adds warm air and makes the system work harder.',
        ],
      },
    ],
    limitations: [
      'This is a simplified vapour-compression model.',
      'It omits defrost cycles, fans, insulation details, refrigerant types and control electronics.',
      'Actual efficiency depends on room temperature, door seals, load and maintenance.',
      'The arrows describe the loop conceptually, not a complete thermodynamic calculation.',
    ],
  },
  accessibilityDescription:
    'A five-step looping process: refrigerant absorbs heat inside, the compressor raises its temperature, the condenser releases heat outside, the expansion valve lowers the pressure, and the thermostat repeats the cycle. Each step is a button with a text explanation.',
  workedExample: {
    title: 'Why the back of the fridge is warm',
    body:
      'Place a bottle of water in a fridge. Heat from the bottle moves into the colder evaporator and is carried away by the refrigerant. The compressor raises the refrigerant’s temperature, and the condenser coils release that heat into the kitchen. The bottle cools because heat leaves it, while the kitchen receives the same heat plus energy added by the compressor.',
  },
  practice: {
    question: 'Where does the heat removed from the refrigerator compartment go?',
    options: [
      'It disappears inside the fridge.',
      'It is converted entirely into electricity.',
      'It is released to the surrounding room through the condenser.',
      'It is stored permanently in the refrigerant.',
    ],
    correctIndex: 2,
    explanation:
      'A refrigerator moves heat rather than destroying it. The condenser releases heat from the refrigerant to the room, which is why the coils can feel warm.',
    hint: 'Follow the heat from inside the fridge to the coils outside.',
  },
  application: {
    title: 'Everyday signs the cycle is working',
    body:
      'Warm condenser coils, a running compressor and a cold interior are consistent with the cycle. A fridge that runs constantly may have a door-seal leak, blocked airflow, a dirty condenser or another fault. The diagram explains the normal cycle, not a repair diagnosis.',
  },
  provenance: {
    kind: 'authored',
    note:
      'Curated explanatory model. It is not derived from a learner-uploaded source and is not appliance repair guidance.',
  },
  sources: [],
};

export default refrigeratorCooling;
