# Lesson Media Guide - CrushLearn AI

## Overview
This guide explains how to add slides and videos to lessons in the CrushLearn AI platform.

## Slide Data Structure

### Adding Slides to Lessons

Slides are defined in the lesson object within `src/data/mockCourseData.js`. Add a `slides` array to any lesson:

```javascript
{
  id: 'lesson-1',
  title: 'Introduction to HTML',
  content: 'Learn the basics of HTML markup',
  duration: '15 min',
  type: 'video',
  // Add slides array here
  slides: [
    'https://example.com/slides/slide1.jpg',
    'https://example.com/slides/slide2.jpg',
    'https://example.com/slides/slide3.jpg',
    'https://example.com/slides/slide4.jpg',
    'https://example.com/slides/slide5.jpg',
  ],
  // Add video URL here
  videoUrl: 'https://example.com/videos/intro-html.mp4'
}
```

### Slide Format Requirements

**Image Specifications:**
- **Format**: JPG, PNG, or WebP
- **Recommended Size**: 1920x1080 (16:9 aspect ratio)
- **File Size**: Under 500KB per slide for optimal loading
- **Naming Convention**: `lesson-{id}-slide-{number}.jpg`

Example: `lesson-1-slide-1.jpg`, `lesson-1-slide-2.jpg`, etc.

## Video Data Structure

### Adding Videos to Lessons

Add a `videoUrl` property to the lesson object:

```javascript
{
  id: 'lesson-1',
  title: 'Introduction to HTML',
  videoUrl: '/videos/html-intro.mp4',
  // or use external URL
  videoUrl: 'https://cdn.example.com/videos/html-intro.mp4'
}
```

### Video Format Requirements

**Video Specifications:**
- **Format**: MP4 (H.264 codec)
- **Resolution**: 1920x1080 or 1280x720
- **Frame Rate**: 30fps
- **Bitrate**: 2-5 Mbps
- **Audio**: AAC codec, 128kbps
- **Max Duration**: 20 minutes per video

## Media File Placement

### Directory Structure

```
crushlearn-ai/
├── public/
│   ├── slides/
│   │   ├── web-dev-101/
│   │   │   ├── lesson-1-slide-1.jpg
│   │   │   ├── lesson-1-slide-2.jpg
│   │   │   └── ...
│   │   ├── python-basics/
│   │   │   └── ...
│   │   └── react-advanced/
│   │       └── ...
│   └── videos/
│       ├── web-dev-101/
│       │   ├── lesson-1.mp4
│       │   └── ...
│       ├── python-basics/
│       │   └── ...
│       └── react-advanced/
│           └── ...
```

### Using Local Files

**Option 1: Public Folder (Recommended for Development)**

1. Create directories:
```bash
mkdir -p public/slides/web-dev-101
mkdir -p public/videos/web-dev-101
```

2. Add your media files to these directories

3. Reference in mockCourseData.js:
```javascript
slides: [
  '/slides/web-dev-101/lesson-1-slide-1.jpg',
  '/slides/web-dev-101/lesson-1-slide-2.jpg',
],
videoUrl: '/videos/web-dev-101/lesson-1.mp4'
```

**Option 2: Assets Folder (Build-time)**

1. Create directories:
```bash
mkdir -p src/assets/slides
mkdir -p src/assets/videos
```

2. Import in mockCourseData.js:
```javascript
import slide1 from '../assets/slides/web-dev-101/lesson-1-slide-1.jpg';
import slide2 from '../assets/slides/web-dev-101/lesson-1-slide-2.jpg';
import video1 from '../assets/videos/web-dev-101/lesson-1.mp4';

// Then use in lesson object
slides: [slide1, slide2],
videoUrl: video1
```

**Option 3: CDN/External Hosting (Production)**

Use full URLs from cloud storage or CDN:
```javascript
slides: [
  'https://cdn.crushlearn.ai/slides/web-dev-101/lesson-1-slide-1.jpg',
  'https://cdn.crushlearn.ai/slides/web-dev-101/lesson-1-slide-2.jpg',
],
videoUrl: 'https://cdn.crushlearn.ai/videos/web-dev-101/lesson-1.mp4'
```

## Creating Slides from PowerPoint

### Method 1: Export as Images

1. Open your PowerPoint file
2. Go to **File → Export → Change File Type**
3. Select **JPEG or PNG Image**
4. Click **Save As**
5. Choose "All Slides" option
6. PowerPoint will create a folder with all slides as images

### Method 2: Using Online Tools

**Recommended Tools:**
- [Slides.com](https://slides.com) - Export to images
- [Google Slides](https://slides.google.com) - Download → JPEG/PNG
- [Canva](https://canva.com) - Design slides, download as images

### Method 3: Screenshot Tool

For quick conversion:
1. Open PowerPoint in Slide Show mode
2. Use screenshot tool to capture each slide
3. Save as individual image files

## Sample Lesson Configuration

```javascript
{
  id: 'html-basics-1',
  title: 'HTML Fundamentals',
  content: 'Learn HTML structure, tags, and basic elements',
  duration: '25 min',
  type: 'video',
  
  // Slides array
  slides: [
    '/slides/web-dev-101/html-basics-1-intro.jpg',
    '/slides/web-dev-101/html-basics-2-structure.jpg',
    '/slides/web-dev-101/html-basics-3-tags.jpg',
    '/slides/web-dev-101/html-basics-4-elements.jpg',
    '/slides/web-dev-101/html-basics-5-attributes.jpg',
    '/slides/web-dev-101/html-basics-6-summary.jpg',
  ],
  
  // Video URL
  videoUrl: '/videos/web-dev-101/html-basics-tutorial.mp4',
  
  // Optional: Thumbnail for video
  thumbnail: '/slides/web-dev-101/html-basics-thumbnail.jpg',
}
```

## Progress Tracking

### How It Works

The lesson component automatically tracks:
1. **Viewed Slides**: Stored in `viewedSlides` Set
2. **Video Status**: Boolean flag for video play
3. **localStorage Key**: `lesson_{lessonId}_progress`

### Data Stored in localStorage

```javascript
{
  viewedSlides: [0, 1, 2, 3, 4, 5], // Array of viewed slide indices
  videoPlayed: true                 // Boolean for video status
}
```

### Completion Requirements

To enable "Go to Practice" button, learner must:
1. ✓ View all slides (every slide index in viewedSlides)
2. ✓ Start the video (videoPlayed = true)

## Media Optimization Tips

### For Slides

1. **Compress Images**: Use tools like TinyPNG or ImageOptim
2. **Optimize Resolution**: Don't exceed 1920x1080
3. **Lazy Loading**: Images load when needed (automatic)
4. **Use WebP**: Modern browsers support WebP for smaller files

### For Videos

1. **Compress Videos**: Use HandBrake or FFmpeg
   ```bash
   ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 22 -c:a aac -b:a 128k output.mp4
   ```

2. **Create Multiple Qualities**: 1080p, 720p, 480p for adaptive streaming

3. **Add Captions**: Include .vrt files for accessibility

4. **Generate Thumbnails**: Use video poster attribute
   ```jsx
   <video poster="/thumbnails/lesson-1.jpg" />
   ```

## Updating Mock Data

### Step-by-Step Guide

1. **Open mockCourseData.js**:
```javascript
// src/data/mockCourseData.js
export const courses = [
  {
    id: 'web-dev-101',
    title: 'Web Development 101',
    lessons: [
      {
        id: 'lesson-1',
        title: 'Introduction to HTML',
        
        // Add these properties:
        slides: [
          '/slides/web-dev-101/lesson-1-slide-1.jpg',
          '/slides/web-dev-101/lesson-1-slide-2.jpg',
          // ... more slides
        ],
        videoUrl: '/videos/web-dev-101/lesson-1.mp4',
      },
      // ... more lessons
    ],
  },
  // ... more courses
];
```

2. **Add media files** to `public/` directories

3. **Test in browser** - navigate to lesson page

4. **Verify tracking** - check localStorage in DevTools

## Free Media Resources

### Placeholder Slides
- [Placeholder.com](https://placeholder.com)
- [Via Placeholder](https://via.placeholder.com)
- [DummyImage](https://dummyimage.com)

### Sample Videos (for testing)
- [Big Buck Bunny](https://commonsware.com/misc/big-buck-bunny.mp4)
- [Elephants Dream](https://archive.org/details/ElephantsDream)
- [Sample Videos](https://sample-videos.com)

### Design Templates
- [Canva Education Templates](https://canva.com/education)
- [Google Slides Templates](https://docs.google.com/presentation/u/0/?tgif=d)
- [Slidesgo](https://slidesgo.com)

## Troubleshooting

### Slides Not Displaying

1. **Check file path**: Ensure path starts with `/` for public folder
2. **Verify file exists**: Check `public/slides/` directory
3. **Check image format**: Only JPG, PNG, WebP supported
4. **Browser console**: Look for 404 errors

### Video Not Playing

1. **Check format**: Must be MP4 with H.264 codec
2. **File size**: Large files may timeout
3. **CORS issues**: For external URLs, check CORS headers
4. **Browser support**: Test in Chrome/Firefox

### Progress Not Saving

1. **localStorage enabled**: Check browser settings
2. **Private/Incognito mode**: localStorage may be disabled
3. **Quota exceeded**: Clear old lesson progress data

## Future Enhancements

Potential improvements to consider:

1. **PDF Support**: Convert PDF slides on-the-fly
2. **Video Chapters**: Skip to specific sections
3. **Interactive Slides**: Add quizzes within slides
4. **Download Option**: Allow offline slide downloads
5. **Note Taking**: Add annotations to slides
6. **Speed Reading**: Auto-advance slides
7. **Accessibility**: Screen reader support
8. **Analytics**: Track time spent per slide

## Support

For questions or issues:
1. Check browser console for errors
2. Verify media file paths
3. Test with sample URLs first
4. Review lesson component state in React DevTools
