# Practice Simulation Engine - CrushLearn AI

## Overview
The Practice Simulation Engine provides hands-on coding practice within lessons. Students must complete practice tasks before marking lessons as complete.

## Flow

1. **View Slides** → Watch video from lesson
2. **Watch Video** → Complete video requirement
3. **Practice Simulation** → Unlocked after slides + video
4. **Pass Simulation** → Unlock lesson completion button
5. **Mark Complete** → Lesson marked as complete

## Component: Simulation.jsx

### Features
- ✅ Task description with requirements
- ✅ Textarea input for user solutions
- ✅ Run button to validate
- ✅ Output preview area
- ✅ Correct/Incorrect status
- ✅ Progressive hint system
- ✅ Attempt tracking
- ✅ localStorage persistence
- ✅ Retry functionality
- ✅ No solution reveals

### Props

```javascript
<Simulation
  taskId="unique_task_id"           // Unique identifier
  taskData={simulationTaskObject}   // Task configuration
  onComplete={(passed) => {}}       // Callback when passed
/>
```

## Task Data Structure

### Basic Example

```javascript
{
  id: 'lesson-1_simulation',
  description: 'Create output that displays: Hello World',
  requirements: [
    'Output must be exactly "Hello World"',
    'Check spelling and capitalization',
    'No extra spaces or characters'
  ],
  expectedOutput: 'Hello World',
  caseSensitive: true,
  type: 'text',
  difficulty: 'Beginner',
  placeholder: 'Type your output here...',
  hints: [
    'First hint after 1 attempt',
    'Second hint after 2 attempts',
    'Third hint after 3+ attempts'
  ],
  successMessage: 'Great job! You completed the task!'
}
```

### Validation Types

#### 1. Text Match (Case-Sensitive)
```javascript
{
  type: 'text',
  caseSensitive: true,
  expectedOutput: 'Hello World'
}
// Matches: "Hello World"
// Fails: "hello world", "Hello  World"
```

#### 2. Text Match (Case-Insensitive)
```javascript
{
  type: 'text',
  caseSensitive: false,
  expectedOutput: 'color: blue;'
}
// Matches: "color: blue;", "COLOR: BLUE;", "Color: Blue;"
```

#### 3. Numeric Match
```javascript
{
  type: 'numeric',
  expectedOutput: '42'
}
// Matches: "42", "42.0", "42.000"
// Uses floating point comparison with 0.001 tolerance
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique task identifier |
| `description` | string | ✅ | Main task instruction |
| `requirements` | array | ❌ | List of specific requirements |
| `expectedOutput` | string | ✅ | Expected solution output |
| `caseSensitive` | boolean | ❌ | Case-sensitive validation (default: true) |
| `type` | string | ❌ | Validation type: 'text', 'numeric' (default: 'text') |
| `difficulty` | string | ❌ | Badge display: 'Beginner', 'Intermediate', 'Advanced' |
| `placeholder` | string | ❌ | Textarea placeholder text |
| `hints` | array | ❌ | Progressive hints (max 3 recommended) |
| `successMessage` | string | ❌ | Custom success message |

## Validation Logic

### Implementation (Simulation.jsx)

```javascript
const validateInput = (input, expected) => {
  const normalizedInput = input.trim();
  const normalizedExpected = expected.trim();

  // Case-insensitive comparison
  if (taskData.caseSensitive === false) {
    return normalizedInput.toLowerCase() === normalizedExpected.toLowerCase();
  }

  // Numeric comparison
  if (taskData.type === 'numeric') {
    const inputNum = parseFloat(normalizedInput);
    const expectedNum = parseFloat(normalizedExpected);
    return Math.abs(inputNum - expectedNum) < 0.001;
  }

  // Exact match (default)
  return normalizedInput === normalizedExpected;
};
```

### Adding Custom Validation

To add new validation types, modify the `validateInput` function:

```javascript
// Example: Array validation
if (taskData.type === 'array') {
  const inputArray = JSON.parse(normalizedInput);
  const expectedArray = JSON.parse(normalizedExpected);
  return JSON.stringify(inputArray) === JSON.stringify(expectedArray);
}

// Example: Pattern matching
if (taskData.type === 'pattern') {
  const pattern = new RegExp(taskData.pattern);
  return pattern.test(normalizedInput);
}
```

## Hint System

### How It Works

1. **Progressive Hints**: Different hints based on attempt count
2. **Contextual Hints**: Generic hints for common errors
3. **No Solutions**: Hints guide without revealing answers

### Implementation

```javascript
const getHint = (attemptCount, userOutput) => {
  const hints = taskData.hints || [];
  
  // Progressive hints
  if (attemptCount === 1 && hints[0]) return hints[0];
  if (attemptCount === 2 && hints[1]) return hints[1];
  if (attemptCount >= 3 && hints[2]) return hints[2];

  // Generic hints for common errors
  if (!userOutput || userOutput.trim() === '') {
    return "Try entering some output...";
  }

  if (userOutput.length < expectedOutput.length / 2) {
    return "Your output seems shorter than expected...";
  }

  return "Review the task requirements carefully.";
};
```

### Hint Best Practices

✅ **Good Hints** (Question-based, guiding)
- "Is there a space between the words?"
- "What is the capitalization of the first letter?"
- "Did you include the semicolon at the end?"
- "How many words are in the expected output?"

❌ **Bad Hints** (Solution-revealing)
- "Type: Hello World"
- "The answer is X"
- "Copy this: [solution]"

## State Management

### Component State

```javascript
const [userInput, setUserInput] = useState('');       // User's typed solution
const [output, setOutput] = useState('');             // Simulated output
const [status, setStatus] = useState(null);           // 'correct', 'incorrect', null
const [attempts, setAttempts] = useState(0);          // Number of attempts
const [hint, setHint] = useState('');                 // Current hint
const [isPassed, setIsPassed] = useState(false);      // Pass status
```

### localStorage Persistence

**Key Format**: `simulation_{taskId}`

**Data Structure**:
```javascript
{
  passed: true,
  attempts: 3,
  lastOutput: "Hello World",
  timestamp: "2026-02-08T10:30:00.000Z"
}
```

**Usage**:
```javascript
// Save progress
localStorage.setItem(`simulation_${taskId}`, JSON.stringify(progress));

// Load progress
const saved = localStorage.getItem(`simulation_${taskId}`);
const progress = JSON.parse(saved);
```

## Lesson Integration

### Modified Lesson.jsx

1. **Import Simulation**:
```javascript
import Simulation from '../components/Simulation';
```

2. **Add State**:
```javascript
const [simulationPassed, setSimulationPassed] = useState(false);
const [showSimulation, setShowSimulation] = useState(false);
```

3. **Update Requirements**:
```javascript
const canProceedToSimulation = allSlidesViewed && videoPlayed;
const canCompleteLesson = canProceedToSimulation && simulationPassed;
```

4. **Add Handler**:
```javascript
const handleSimulationComplete = (passed) => {
  if (passed) {
    setSimulationPassed(true);
  }
};

const handleGoToPractice = () => {
  setShowSimulation(true);
  setTimeout(() => {
    simulationRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, 100);
};
```

5. **Render Simulation**:
```javascript
{(showSimulation || simulationPassed) && canProceedToSimulation && (
  <div ref={simulationRef}>
    <Simulation
      taskId={simulationTask.id}
      taskData={simulationTask}
      onComplete={handleSimulationComplete}
    />
  </div>
)}
```

## Example Tasks

### Example 1: HTML Output
```javascript
{
  id: 'html_heading',
  description: 'Create a heading that displays: Welcome to HTML',
  requirements: [
    'Output must be exactly "Welcome to HTML"',
    'Check spelling and capitalization'
  ],
  expectedOutput: 'Welcome to HTML',
  caseSensitive: true,
  type: 'text',
  difficulty: 'Beginner',
  hints: [
    'Make sure "Welcome" starts with capital W.',
    'Check spaces between words.',
    'Verify exact spelling of all words.'
  ]
}
```

### Example 2: CSS Property
```javascript
{
  id: 'css_property',
  description: 'Write a CSS property to set text color to red',
  requirements: [
    'Use property name "color"',
    'Include colon and semicolon',
    'Set value to "red"'
  ],
  expectedOutput: 'color: red;',
  caseSensitive: false,
  type: 'text',
  difficulty: 'Beginner',
  hints: [
    'CSS properties follow: property: value;',
    'Don\'t forget the colon after the property name.',
    'End with a semicolon.'
  ]
}
```

### Example 3: JavaScript Math
```javascript
{
  id: 'js_calculation',
  description: 'Calculate: 10 * 5',
  requirements: [
    'Perform multiplication',
    'Enter only the numeric result'
  ],
  expectedOutput: '50',
  caseSensitive: false,
  type: 'numeric',
  difficulty: 'Beginner',
  hints: [
    'What is 10 multiplied by 5?',
    'Use basic arithmetic.',
    'Enter just the number.'
  ]
}
```

### Example 4: Python Output
```javascript
{
  id: 'python_print',
  description: 'Output the string: Python is awesome!',
  requirements: [
    'Exact text match required',
    'Include exclamation mark'
  ],
  expectedOutput: 'Python is awesome!',
  caseSensitive: true,
  type: 'text',
  difficulty: 'Beginner',
  hints: [
    'Check the capitalization of "Python".',
    'Did you include the exclamation mark?',
    'Verify spelling of each word.'
  ]
}
```

## User Experience Flow

### 1. Before Simulation Unlocked
```
📋 Lesson Requirements
✓ View All Slides (5/5)
✓ Watch Video
○ Complete Practice Simulation (locked)

[Complete slides and video first]
```

### 2. Simulation Unlocked
```
💻 Ready for Practice!
✓ View All Slides
✓ Watch Video
3 Complete Practice Simulation (unlocked!)

[Go to Practice Simulation →]
```

### 3. During Practice
```
💻 Practice Simulation
📝 Attempts: 2

Task: Create output that displays: Hello World
[textarea with user input]
[▶ Run] [↻ Reset]

Output: Hello world

✗ Not Quite Right
The output doesn't match what's expected.

💡 Hint: Make sure "World" is capitalized.
```

### 4. After Passing
```
💻 Practice Simulation
✓ Passed

[textarea - disabled]

✓ Correct!
Excellent work! Your solution is correct.

🎉 Great job! You completed the task!
```

### 5. Lesson Complete
```
🎉 Lesson Complete!
✓ View All Slides
✓ Watch Video
✓ Complete Practice Simulation

[Mark Lesson as Complete ✓]
```

## Customization

### Adding New Task Types

1. **Define validation logic** in `Simulation.jsx`:
```javascript
if (taskData.type === 'custom') {
  // Your validation logic
  return customValidation(input, expected);
}
```

2. **Add task data** in `mockCourseData.js`:
```javascript
simulation: {
  type: 'custom',
  expectedOutput: 'expected result',
  // Custom fields...
}
```

### Styling Customization

All styles use Tailwind CSS. Key classes:
- Success: `bg-green-50`, `border-green-200`, `text-green-700`
- Error: `bg-red-50`, `border-red-200`, `text-red-700`
- Hint: `bg-yellow-50`, `border-yellow-200`, `text-yellow-800`
- Primary: `bg-primary-600`, `hover:bg-primary-700`

### Adding Multiple Choice

To add multiple choice questions:

```javascript
{
  type: 'multiple-choice',
  description: 'What is the correct HTML tag for headings?',
  options: ['<head>', '<h1>', '<header>', '<heading>'],
  expectedOutput: '<h1>',
  // Modify Simulation.jsx to render radio buttons
}
```

## Testing

### Manual Testing Checklist

- [ ] Slides and video requirements work
- [ ] Simulation unlocks after requirements met
- [ ] "Go to Practice" scrolls to simulation
- [ ] Textarea accepts input
- [ ] Run button validates correctly
- [ ] Correct answer shows success message
- [ ] Incorrect answer shows error + hint
- [ ] Progressive hints work (attempt 1, 2, 3)
- [ ] Reset button clears input
- [ ] Passed status persists in localStorage
- [ ] Once passed, cannot re-run
- [ ] Lesson completion button only enables after simulation
- [ ] Completed lessons save to user profile

### Test Cases

```javascript
// Test 1: Exact match
input: "Hello World"
expected: "Hello World"
result: ✓ Pass

// Test 2: Case mismatch (case-sensitive)
input: "hello world"
expected: "Hello World"
result: ✗ Fail

// Test 3: Extra spaces
input: "Hello  World"
expected: "Hello World"
result: ✗ Fail (after trim, still has double space)

// Test 4: Numeric match
input: "42"
expected: "42"
type: numeric
result: ✓ Pass

// Test 5: Case-insensitive CSS
input: "COLOR: BLUE;"
expected: "color: blue;"
caseSensitive: false
result: ✓ Pass
```

## Future Enhancements

### Potential Features

1. **Code Syntax Highlighting**: Add syntax highlighting to textarea
2. **Multi-step Tasks**: Support multiple validation steps
3. **Unit Tests**: Add automated testing to validation
4. **Run Button States**: Show loading state while validating
5. **Time Tracking**: Track time spent on each task
6. **Leaderboard**: Compare attempts with other learners
7. **Solution View**: Show solution after X failed attempts (opt-in)
8. **Video Hints**: Link to specific video timestamps
9. **Code Templates**: Provide starter code
10. **Regex Support**: Pattern-based validation

## Troubleshooting

### Simulation Not Showing
- Check that slides and video requirements are met
- Verify `canProceedToSimulation` is true
- Check console for errors

### Validation Not Working
- Ensure `expectedOutput` is correctly formatted
- Check `type` field matches validation logic
- Verify spaces and special characters

### Hints Not Displaying
- Check `hints` array is populated
- Verify attempt count is incrementing
- Check hint display logic in component

### Progress Not Saving
- Verify localStorage is enabled
- Check task ID is consistent
- Inspect Application > localStorage in DevTools

## Support

For issues or questions:
1. Check browser console for errors
2. Verify task data structure
3. Test validation logic manually
4. Review localStorage data
5. Check component state in React DevTools
