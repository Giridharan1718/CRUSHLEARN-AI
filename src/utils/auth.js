// Simple authentication utilities using localStorage

export const AuthService = {
  // Check if user is logged in
  isAuthenticated: () => {
    return localStorage.getItem('crushlearn_user') !== null;
  },

  // Register new user
  register: (name, email, password) => {
    // Check if user already exists (simple check for demo)
    const existingUser = localStorage.getItem('crushlearn_user');
    if (existingUser) {
      const parsedUser = JSON.parse(existingUser);
      if (parsedUser.email === email) {
        return { success: false, error: 'Email already registered' };
      }
    }

    // Create new user with starter courses
    if (name && email && password) {
      const user = {
        id: Date.now().toString(),
        name: name,
        email: email,
        enrolledCourses: ['web-dev-101', 'python-basics'], // Starter courses
        completedLessons: [],
        learningStreak: 0,
        lastActivityDate: new Date().toISOString(),
        skillPassport: {
          skills: [],
          certificates: [],
        },
      };
      
      localStorage.setItem('crushlearn_user', JSON.stringify(user));
      return { success: true, user };
    }
    
    return { success: false, error: 'Please provide all required information' };
  },

  // Login user with fake credentials
  login: (email, password) => {
    // Simple validation - accept any email/password for demo
    if (email && password) {
      const user = {
        id: '1',
        name: email.split('@')[0],
        email: email,
        enrolledCourses: ['web-dev-101', 'python-basics'],
        completedLessons: ['lesson-1', 'lesson-2'],
        learningStreak: 7, // Mock streak - in real app, calculate from activity
        lastActivityDate: new Date().toISOString(),
        skillPassport: {
          skills: ['HTML', 'CSS', 'JavaScript Basics'],
          certificates: [],
        },
      };
      
      localStorage.setItem('crushlearn_user', JSON.stringify(user));
      return { success: true, user };
    }
    
    return { success: false, error: 'Please enter valid credentials' };
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('crushlearn_user');
  },

  // Get current user
  getCurrentUser: () => {
    const userStr = localStorage.getItem('crushlearn_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  // Update user data
  updateUser: (userData) => {
    const currentUser = AuthService.getCurrentUser();
    if (currentUser) {
      const updatedUser = { ...currentUser, ...userData };
      localStorage.setItem('crushlearn_user', JSON.stringify(updatedUser));
      return updatedUser;
    }
    return null;
  },
};
