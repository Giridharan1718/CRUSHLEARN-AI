# CrushLearn AI - Authentication & User Management

## Overview
This document describes the authentication system and user management features in CrushLearn AI.

## Pages

### 1. Login Page (`/`)
- **Location**: `src/pages/Login.jsx`
- **Purpose**: User authentication and access to the platform
- **Features**:
  - Email and password input
  - Form validation
  - Demo login button for quick access
  - "Forgot Password" link
  - "Sign Up" link to registration
  - Responsive design with gradient background

**Demo Credentials**:
Any email and password combination works for demonstration purposes.

### 2. Registration Page (`/register`)
- **Location**: `src/pages/Register.jsx`
- **Purpose**: New user account creation
- **Features**:
  - Full name input
  - Email address input
  - Password with confirmation
  - Password strength requirements (minimum 6 characters)
  - Password match validation
  - Success message and auto-redirect to dashboard
  - Link back to login page
  - Responsive design matching login page

**Registration Process**:
```javascript
AuthService.register(name, email, password)
```

Creates a new user with:
- Unique ID (timestamp-based)
- Empty enrolled courses array
- Learning streak starting at 0
- Current activity date
- Empty skill passport

### 3. Forgot Password Page (`/forgot-password`)
- **Location**: `src/pages/ForgotPassword.jsx`
- **Purpose**: Password recovery workflow
- **Features**:
  - Email input for recovery
  - Success confirmation screen
  - "Try Another Email" option
  - Back to Sign In link
  - Mock email sending (demo purposes)

**Note**: This is a demo feature. No actual emails are sent.

### 4. Profile/Settings Page (`/profile`)
- **Location**: `src/pages/Profile.jsx`
- **Purpose**: User account management and settings
- **Features**:
  - Profile information display
  - Edit mode for updating details
  - Avatar with user initial
  - Account statistics (courses, lessons, streak)
  - Preferences toggles:
    - Email notifications
    - Daily reminders
    - Course recommendations
  - Danger zone with account deletion
  - Form validation
  - Save/cancel functionality

**Editable Fields**:
- Full Name
- Email Address
- Bio (optional)
- Learning Goal (optional)

**Statistics Displayed**:
- Courses Enrolled
- Lessons Completed
- Day Streak

## Authentication Service

### Location
`src/utils/auth.js`

### Methods

#### `isAuthenticated()`
Checks if user is currently logged in.
```javascript
AuthService.isAuthenticated() // Returns boolean
```

#### `login(email, password)`
Authenticates user and creates session.
```javascript
const result = AuthService.login('user@example.com', 'password123');
// Returns: { success: true, user: {...} } or { success: false, error: 'message' }
```

#### `register(name, email, password)`
Creates new user account.
```javascript
const result = AuthService.register('John Doe', 'john@example.com', 'password123');
// Returns: { success: true, user: {...} } or { success: false, error: 'message' }
```

#### `logout()`
Ends user session and removes data.
```javascript
AuthService.logout();
```

#### `getCurrentUser()`
Retrieves currently logged-in user data.
```javascript
const user = AuthService.getCurrentUser();
// Returns: user object or null
```

#### `updateUser(userData)`
Updates current user's information.
```javascript
AuthService.updateUser({ name: 'New Name', bio: 'My bio' });
// Returns: updated user object or null
```

## User Object Structure

```javascript
{
  id: '1234567890',
  name: 'John Doe',
  email: 'john@example.com',
  bio: 'Optional bio text',
  learningGoal: 'Optional learning goal',
  enrolledCourses: ['course-id-1', 'course-id-2'],
  completedLessons: ['lesson-id-1', 'lesson-id-2'],
  learningStreak: 5,
  lastActivityDate: '2026-02-08T12:00:00.000Z',
  skillPassport: {
    skills: ['HTML', 'CSS', 'JavaScript'],
    certificates: []
  }
}
```

## Routing

### Public Routes (No Authentication Required)
- `/` - Login page
- `/register` - Registration page
- `/forgot-password` - Password recovery

### Protected Routes (Authentication Required)
- `/dashboard` - Main dashboard
- `/profile` - User profile and settings
- `/course/:courseId` - Course view
- `/course/:courseId/lesson/:lessonId` - Lesson view
- `/skill-passport` - Skill passport
- `/certificate/:certificateId` - Certificate view

### Route Protection
Protected routes use the `ProtectedRoute` component:
```jsx
<ProtectedRoute>
  <YourComponent />
</ProtectedRoute>
```

## Navigation Updates

### Navbar
- Logo links to dashboard
- User avatar and name are now clickable
- Clicking profile section navigates to `/profile`
- Logout button remains in navbar

### Sidebar
- Added "Profile" menu item with 👤 icon
- Located under "Skill Passport"
- Highlights when active

## Storage

### localStorage Keys
- `crushlearn_user` - Current user data

### Security Note
⚠️ **Demo Only**: This authentication system uses localStorage and is intended for demonstration purposes only. In a production environment, you would need:
- Secure backend API
- JWT tokens or session management
- Password encryption
- Email verification
- HTTPS connections
- CSRF protection
- Rate limiting

## Customization

### Styling
All pages use Tailwind CSS with the primary color scheme:
- `primary-50` through `primary-900`
- Gradient backgrounds
- Consistent form styling
- Responsive design

### Adding New Fields
To add fields to user profile:

1. Update the form in `Profile.jsx`:
```jsx
<input
  type="text"
  name="newField"
  value={formData.newField}
  onChange={handleChange}
  disabled={!isEditing}
/>
```

2. Add to user object in `auth.js`:
```javascript
const user = {
  // ... existing fields
  newField: '',
};
```

### Preferences
Toggle switches in Profile page are currently UI-only. To make them functional:

1. Add state management in Profile component
2. Update user object with preferences
3. Use preferences throughout app

## Best Practices

### Form Validation
- Always validate on both client and server (when backend exists)
- Provide clear error messages
- Show success feedback
- Disable submit during processing

### User Experience
- Auto-redirect after successful actions
- Show loading states
- Preserve form data when possible
- Clear sensitive data after logout

### Security
- Never store passwords in localStorage
- Validate all inputs
- Sanitize user-generated content
- Implement rate limiting
- Use secure password requirements

## Future Enhancements

### Recommended Features
1. **Social Authentication**
   - Google Sign-In
   - GitHub OAuth
   - Microsoft Account

2. **Two-Factor Authentication**
   - SMS verification
   - Authenticator app support
   - Backup codes

3. **Email Verification**
   - Send verification email on registration
   - Require verification before full access

4. **Password Management**
   - Actual password reset functionality
   - Change password in profile
   - Password strength meter
   - Password history

5. **Profile Enhancements**
   - Profile photo upload
   - Cover image
   - Social media links
   - Privacy settings
   - Theme preferences (dark mode)

6. **Account Management**
   - Export user data
   - Account suspension (instead of deletion)
   - Activity log
   - Connected devices

## Testing Scenarios

### Registration Flow
1. Navigate to `/register`
2. Fill in all fields
3. Submit form
4. Verify redirect to dashboard
5. Check user data in localStorage

### Login Flow
1. Navigate to `/`
2. Enter credentials
3. Submit form
4. Verify redirect to dashboard
5. Check authentication state

### Profile Update
1. Navigate to `/profile`
2. Click "Edit Profile"
3. Modify fields
4. Click "Save Changes"
5. Verify update success
6. Check localStorage for updated data

### Logout
1. Click logout in navbar
2. Verify redirect to login page
3. Verify localStorage cleared
4. Try accessing protected route
5. Should redirect to login

## Troubleshooting

### Common Issues

**Issue**: User data not persisting
- Check browser's localStorage
- Verify no errors in console
- Clear localStorage and try again

**Issue**: Redirect not working after login
- Check `react-router-dom` configuration
- Verify `navigate` is being called
- Check for JavaScript errors

**Issue**: Profile changes not saving
- Verify `AuthService.updateUser()` is called
- Check for validation errors
- Inspect localStorage after save

## Support

For additional help or questions:
1. Check browser console for errors
2. Review this documentation
3. Inspect localStorage data
4. Check routing configuration in `App.jsx`
