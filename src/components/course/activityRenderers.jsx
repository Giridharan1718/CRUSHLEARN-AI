import { registerActivityRenderer } from './activityRegistry';
import QuizActivity from './QuizActivity';
import ExerciseActivity from './ExerciseActivity';
import SimulationActivity from './SimulationActivity';
import ProjectActivity from './ProjectActivity';

// Subject-specific renderers register themselves. This side-effect import is
// the only hook needed when a new subject extension module is added.
import './subjectExtensions';

// Core activity types are available to every course and subject.
registerActivityRenderer('quiz', QuizActivity);
registerActivityRenderer('exercise', ExerciseActivity);
registerActivityRenderer('simulation', SimulationActivity);
registerActivityRenderer('project', ProjectActivity);
