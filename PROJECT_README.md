# CrushLearn AI - EdTech Platform

A modern, AI-powered educational platform built with React, Vite, and Tailwind CSS.

## 🚀 Features

- **AI-Powered Learning Guidance**: Get personalized recommendations and hints as you learn
- **Course Management**: Browse and enroll in various courses
- **Progress Tracking**: Monitor your learning journey with detailed progress indicators
- **Skill Passport**: Showcase your acquired skills and earned certificates
- **Interactive Lessons**: Video lessons and hands-on projects
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## 🛠️ Tech Stack

- **React 18** - Modern UI library
- **Vite** - Fast build tool and dev server
- **React Router** - Client-side routing
- **Tailwind CSS** - Utility-first CSS framework
- **LocalStorage** - Simple authentication and data persistence

## 📦 Installation

1. **Clone or navigate to the project directory**:
   ```bash
   cd "e:\crushlearn ai"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser** and visit `http://localhost:5173`

## 🎯 Usage

### Login
- Use any email and password to log in (fake authentication for demo)
- Or click "Try Demo Account" for instant access

### Dashboard
- View enrolled courses and overall progress
- Get AI-powered learning recommendations
- Browse and explore available courses

### Course Pages
- View course details and lesson list
- Track your progress through each course
- Navigate between lessons

### Lessons
- Watch video content or work on projects
- Get AI hints to help you learn
- Mark lessons as complete

### Skill Passport
- View all your acquired skills
- Track certificates earned
- Monitor your learning journey

## 📁 Project Structure

```
src/
├── pages/
│   ├── Login.jsx              # Login page with fake auth
│   ├── Dashboard.jsx          # Main dashboard with courses
│   ├── Course.jsx             # Course details and lessons
│   ├── Lesson.jsx             # Individual lesson view
│   ├── SkillPassport.jsx      # Skills and certificates
│   └── Certificate.jsx        # Certificate display page
├── components/
│   ├── Navbar.jsx             # Top navigation bar
│   ├── Sidebar.jsx            # Left sidebar navigation
│   ├── ProtectedRoute.jsx     # Route protection wrapper
│   └── ProgressBar.jsx        # Reusable progress indicator
├── data/
│   └── mockCourseData.js      # Mock course data
├── ai/
│   └── guidanceEngine.js      # AI guidance simulation
├── utils/
│   └── auth.js                # Authentication utilities
├── App.jsx                    # Main app component with routing
├── main.jsx                   # App entry point
└── index.css                  # Global styles with Tailwind
```

## 🎨 Key Components

### Authentication
- Fake authentication using localStorage
- Protected routes for authenticated users only
- User data persistence across sessions

### AI Guidance Engine
- Personalized learning path recommendations
- Contextual hints for each lesson
- Progress analysis and motivation

### Course System
- Multiple courses with lessons
- Progress tracking per course
- Video and project-based lessons

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## 🎓 Demo Account

Click "Try Demo Account" on the login page or use:
- Email: Any email address
- Password: Any password

## 📱 Responsive Design

The app is fully responsive and works on:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (< 768px)

## 🚧 Future Enhancements

- Real backend integration
- Actual AI/ML integration for personalized learning
- Video streaming support
- Real-time progress synchronization
- Social features (discussions, peer learning)
- Advanced analytics dashboard

## 📄 License

This is a demo project for educational purposes.

## 👥 Author

Built as a demonstration of modern React development practices.
