# Dashboard Mock Data Reference

## Quick Reference for Dashboard Data Structures

---

## 📊 User Object (localStorage)

```javascript
{
  id: '1',
  name: 'username',                    // From email (before @)
  email: 'user@example.com',
  
  // Course enrollment
  enrolledCourses: [
    'web-dev-101',
    'python-basics'
  ],
  
  // Progress tracking
  completedLessons: [],                // Array of lesson IDs
  learningStreak: 5,                   // Days of consecutive learning
  lastActivityDate: '2026-02-08T...',  // ISO date string
  
  // Skills and achievements
  skillPassport: {
    skills: [
      'HTML',
      'CSS',
      'JavaScript Basics'
    ],
    certificates: []
  }
}
```

---

## 📚 Course Data Structure

```javascript
{
  id: 'web-dev-101',
  title: 'Web Development Fundamentals',
  description: 'Learn the basics of web development...',
  instructor: 'Dr. Sarah Mitchell',
  duration: '8 weeks',
  level: 'Beginner',
  thumbnail: 'https://...',
  enrolled: 1234,
  rating: 4.8,
  
  lessons: [
    {
      id: 'lesson-1',
      title: 'Introduction to HTML',
      duration: '45 min',
      type: 'video',              // or 'project'
      completed: false,
      content: 'Learn fundamentals...'
    }
    // ... more lessons
  ]
}
```

---

## 🎯 Skill Data Structure

```javascript
{
  name: 'HTML5',                    // Skill name
  status: 'completed',              // 'completed' | 'in-progress' | 'not-started'
  course: 'Web Development...',     // Associated course title
  lessonThreshold: 1                // Lessons needed to complete
}
```

---

## 📈 Progress Data

### Overall Progress
```javascript
{
  totalLessons: 10,           // Sum of all lessons in enrolled courses
  completedCount: 3,          // Number of completed lessons
  percentage: 30              // (completedCount / totalLessons) * 100
}
```

### Course Progress
```javascript
// Calculated per course
progress = (completedLessonsInCourse / totalCourseLessons) * 100
```

### Weekly Stats
```javascript
{
  lessonsCompleted: 3,        // Lessons done this week
  timeSpent: 135,             // Minutes (mock: 45 min per lesson)
  coursesActive: 2            // Number of enrolled courses
}
```

---

## 🎓 Today's Lesson Object

```javascript
{
  lesson: {
    id: 'lesson-1',
    title: 'Introduction to HTML',
    duration: '45 min',
    type: 'video',
    content: 'Learn fundamentals...'
  },
  course: {
    id: 'web-dev-101',
    title: 'Web Development Fundamentals',
    // ... rest of course data
  }
}
```

Returns `null` if all lessons completed.

---

## 🔥 Learning Streak

```javascript
learningStreak: 5               // Integer (days)
```

**How it works:**
- Stored in user object
- Incremented daily when user is active
- Reset to 0 after missing a day
- Mock value: 5 (for demo)

**In production:**
- Track `lastActivityDate`
- Compare with current date
- Increment if consecutive, reset if not

---

## 🎨 Skill Status Mapping

### Status Types:

1. **'completed'** 
   - Color: Green
   - Icon: ✓
   - Badge: 'Completed'
   - Condition: `completedLessons >= threshold`

2. **'in-progress'**
   - Color: Blue
   - Icon: ⏳
   - Badge: 'In Progress'
   - Condition: `completedLessons > 0 && < threshold`

3. **'not-started'**
   - Color: Gray
   - Icon: ○
   - Badge: 'Not Started'
   - Condition: `completedLessons === 0`

---

## 📦 Skills Map (by Course)

```javascript
const skillsMap = {
  'web-dev-101': [
    { name: 'HTML5', lessonThreshold: 1 },
    { name: 'CSS3', lessonThreshold: 2 },
    { name: 'JavaScript', lessonThreshold: 3 },
    { name: 'Responsive Design', lessonThreshold: 4 }
  ],
  
  'python-basics': [
    { name: 'Python Syntax', lessonThreshold: 1 },
    { name: 'Control Flow', lessonThreshold: 2 },
    { name: 'Data Structures', lessonThreshold: 3 }
  ],
  
  'react-advanced': [
    { name: 'Custom Hooks', lessonThreshold: 1 },
    { name: 'Performance Optimization', lessonThreshold: 2 }
  ]
};
```

---

## 🔄 State Update Examples

### Completing a Lesson

```javascript
// Before
user.completedLessons = []

// User completes lesson-1
AuthService.updateUser({
  completedLessons: ['lesson-1']
})

// After
user.completedLessons = ['lesson-1']
```

**Effects:**
- Progress bars update
- "Today's Lesson" changes to next lesson
- Skill status may change (if threshold met)
- Weekly stats increment

### Updating Learning Streak

```javascript
// Current
user.learningStreak = 5

// User active today
AuthService.updateUser({
  learningStreak: 6,
  lastActivityDate: new Date().toISOString()
})

// Result
user.learningStreak = 6
```

---

## 🎯 Sample Data States

### New User (Just Logged In)
```javascript
{
  enrolledCourses: ['web-dev-101', 'python-basics'],
  completedLessons: [],
  learningStreak: 5,
  // Skills: All 'not-started'
  // Progress: 0%
  // Today's Lesson: First lesson from web-dev-101
}
```

### Active User (Some Progress)
```javascript
{
  enrolledCourses: ['web-dev-101', 'python-basics'],
  completedLessons: ['lesson-1', 'lesson-2'],
  learningStreak: 12,
  // Skills: HTML5 (completed), CSS3 (completed), rest in-progress/not-started
  // Progress: 20% (2 of 10 lessons)
  // Today's Lesson: lesson-3
}
```

### Advanced User (High Progress)
```javascript
{
  enrolledCourses: ['web-dev-101', 'python-basics', 'react-advanced'],
  completedLessons: ['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4', ...],
  learningStreak: 45,
  // Skills: Most completed, some in-progress
  // Progress: 70%
  // Today's Lesson: Advanced lesson
}
```

---

## 🛠️ Helper Function Usage

### Get Today's Lesson
```javascript
import { getTodaysLesson } from '../utils/dashboardHelpers';

const todaysLesson = getTodaysLesson(user, courses);

if (todaysLesson) {
  console.log(todaysLesson.lesson.title);  // "Introduction to HTML"
  console.log(todaysLesson.course.title);  // "Web Development Fundamentals"
}
```

### Calculate Progress
```javascript
import { calculateOverallProgress } from '../utils/dashboardHelpers';

const progress = calculateOverallProgress(user, courses);

console.log(progress.completedCount);     // 3
console.log(progress.totalLessons);       // 10
console.log(progress.percentage);         // 30
```

### Get User Skills
```javascript
import { getUserSkills } from '../utils/dashboardHelpers';

const skills = getUserSkills(user, courses);

skills.forEach(skill => {
  console.log(`${skill.name}: ${skill.status}`);
  // "HTML5: completed"
  // "CSS3: in-progress"
  // etc.
});
```

---

## 📝 Data Validation

### Required Fields

**User:**
- `id`, `name`, `email` (string)
- `enrolledCourses` (array)
- `completedLessons` (array)
- `learningStreak` (number)

**Course:**
- `id`, `title`, `description` (string)
- `lessons` (array with at least 1 lesson)

**Lesson:**
- `id`, `title`, `duration`, `type`, `content` (string)

---

## 🎨 UI Color Mapping

```javascript
// Status → Tailwind Classes
const statusClasses = {
  completed: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-200 text-green-800',
    icon: '✓'
  },
  'in-progress': {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-200 text-blue-800',
    icon: '⏳'
  },
  'not-started': {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    badge: 'bg-gray-200 text-gray-600',
    icon: '○'
  }
};
```

---

## 🔧 localStorage Operations

### Save User
```javascript
localStorage.setItem('crushlearn_user', JSON.stringify(user));
```

### Load User
```javascript
const userStr = localStorage.getItem('crushlearn_user');
const user = userStr ? JSON.parse(userStr) : null;
```

### Update User
```javascript
const currentUser = JSON.parse(localStorage.getItem('crushlearn_user'));
const updatedUser = { ...currentUser, completedLessons: [...] };
localStorage.setItem('crushlearn_user', JSON.stringify(updatedUser));
```

### Clear User (Logout)
```javascript
localStorage.removeItem('crushlearn_user');
```

---

## 📊 Sample API Response Format (Future)

```javascript
// GET /api/user/progress
{
  success: true,
  data: {
    overallProgress: 30,
    weeklyStats: {
      lessonsCompleted: 3,
      timeSpent: 135,
      coursesActive: 2
    },
    todaysLesson: {
      lessonId: 'lesson-3',
      courseId: 'web-dev-101',
      title: 'JavaScript Essentials'
    },
    learningStreak: 5
  }
}
```

---

**Use this reference when:**
- Adding new features
- Debugging data issues
- Understanding state flow
- Creating test cases
- Extending functionality

---

**All mock data is in:** `src/data/mockCourseData.js`  
**User data managed by:** `src/utils/auth.js`  
**Helper functions in:** `src/utils/dashboardHelpers.js`
