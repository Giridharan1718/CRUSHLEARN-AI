// Dashboard helper utilities

/**
 * Calculate learning streak based on user activity
 * In production, this would query actual user activity dates
 */
export const calculateLearningStreak = (user) => {
  // Mock implementation - returns random streak between 1-30 days
  // In real app, calculate from user.lastActivityDates array
  return user.learningStreak || 5;
};

/**
 * Get today's recommended lesson for the user
 * Returns the first incomplete lesson from enrolled courses
 */
export const getTodaysLesson = (user, courses) => {
  for (const courseId of user.enrolledCourses || []) {
    const course = courses.find((c) => c.id === courseId);
    if (!course) continue;
    
    const nextLesson = course.lessons.find(
      (lesson) => !(user.completedLessons || []).includes(lesson.id)
    );
    
    if (nextLesson) {
      return { lesson: nextLesson, course };
    }
  }
  return null;
};

/**
 * Calculate overall progress across all enrolled courses
 */
export const calculateOverallProgress = (user, courses) => {
  const totalLessons = (user.enrolledCourses || []).reduce((total, courseId) => {
    const course = courses.find((c) => c.id === courseId);
    return total + (course?.lessons.length || 0);
  }, 0);
  
  const completedCount = (user.completedLessons || []).length;
  
  return {
    totalLessons,
    completedCount,
    percentage: totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0,
  };
};

/**
 * Calculate progress for a specific course
 */
export const getCourseProgress = (user, courseId, courses) => {
  const course = courses.find((c) => c.id === courseId);
  if (!course) return 0;
  
  const completedLessons = (user.completedLessons || []).filter((id) =>
    course.lessons.some((lesson) => lesson.id === id)
  );
  
  return (completedLessons.length / course.lessons.length) * 100;
};

/**
 * Get skills with status based on user's progress
 * Maps courses to skills and determines status
 */
export const getUserSkills = (user, courses) => {
  // Skill mapping for each course
  const skillsMap = {
    'web-dev-101': [
      { name: 'HTML5', lessonThreshold: 1 },
      { name: 'CSS3', lessonThreshold: 2 },
      { name: 'JavaScript', lessonThreshold: 3 },
      { name: 'Responsive Design', lessonThreshold: 4 },
    ],
    'python-basics': [
      { name: 'Python Syntax', lessonThreshold: 1 },
      { name: 'Control Flow', lessonThreshold: 2 },
      { name: 'Data Structures', lessonThreshold: 3 },
    ],
    'react-advanced': [
      { name: 'Custom Hooks', lessonThreshold: 1 },
      { name: 'Performance Optimization', lessonThreshold: 2 },
    ],
  };

  const skills = [];

  (user.enrolledCourses || []).forEach((courseId) => {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;

    const courseSkills = skillsMap[courseId] || [];
    const completedLessons = (user.completedLessons || []).filter((id) =>
      course.lessons.some((lesson) => lesson.id === id)
    );

    courseSkills.forEach((skill) => {
      let status = 'not-started';
      
      if (completedLessons.length >= skill.lessonThreshold) {
        status = 'completed';
      } else if (completedLessons.length > 0) {
        status = 'in-progress';
      }

      skills.push({
        name: skill.name,
        status,
        course: course.title,
      });
    });
  });

  return skills;
};

/**
 * Get weekly stats for the dashboard
 */
export const getWeeklyStats = (user) => {
  // In production, filter by date range
  const completedThisWeek = (user.completedLessons || []).length;
  const timeSpentMinutes = completedThisWeek * 45; // Mock: average 45 min per lesson
  
  return {
    lessonsCompleted: completedThisWeek,
    timeSpent: timeSpentMinutes,
    coursesActive: (user.enrolledCourses || []).length,
  };
};

/**
 * Mark a lesson as complete
 */
export const completeLesson = (user, lessonId) => {
  const completedLessons = user.completedLessons || [];
  
  if (!completedLessons.includes(lessonId)) {
    return {
      ...user,
      completedLessons: [...completedLessons, lessonId],
    };
  }
  
  return user;
};

/**
 * Update learning streak based on activity
 */
export const updateLearningStreak = (user) => {
  // In production, check if user was active yesterday
  // For mock: increment streak
  return {
    ...user,
    learningStreak: (user.learningStreak || 0) + 1,
  };
};
