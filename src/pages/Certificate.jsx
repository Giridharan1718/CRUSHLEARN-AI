import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthService } from '../utils/auth';
import { getCourseById } from '../data/mockCourseData';

const RESULT_KEY = 'final_skill_check_result';

const Certificate = () => {
  const { certificateId } = useParams();
  const user = AuthService.getCurrentUser();

  const result = useMemo(() => {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  }, []);

  const hasPassed = Boolean(result?.passed);
  const enrolledCourseId = user?.enrolledCourses?.[0];
  const course = enrolledCourseId ? getCourseById(enrolledCourseId) : null;
  const courseName = course?.title || 'Course';
  const learnerName = user?.name || 'Learner';
  const completionDate = result?.submittedAt
    ? new Date(result.submittedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Pending';
  const certificateNumber = certificateId || `CLA-${new Date().getFullYear()}-${(user?.id || '000000').slice(-6)}`;

  const handleDownload = () => {
    alert('Download PDF is a demo in this build.');
  };

  const handlePrint = () => {
    window.print();
  };

  if (!hasPassed) {
    return (
      <div className="min-h-screen bg-line-subtle py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 print:hidden">
            <Link
              to="/skill-passport"
              className="text-ink-muted font-medium"
            >
              Back to Skill Passport
            </Link>
          </div>

          <div className="bg-surface border border-line rounded-xl p-8 text-center">
            <h1 className="text-2xl font-bold text-ink mb-3">
              Certificate Locked
            </h1>
            <p className="text-ink-muted">
              Complete the Final Skill Check to unlock your certificate.
            </p>
            <p className="text-xs text-ink-subtle mt-4">
              Integrity notice: Certificates are issued only after a verified Final Skill Check.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-line-subtle py-12 px-4 print:bg-surface">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 print:hidden">
          <Link
            to="/skill-passport"
            className="text-ink-muted font-medium"
          >
            Back to Skill Passport
          </Link>
        </div>

        <div className="bg-surface border border-line rounded-xl p-10 shadow-sm print:shadow-none print:border-line">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-ink">CrushLearn AI</h1>
            <p className="text-ink-muted text-sm">Certificate of Completion</p>
          </div>

          <div className="border-t border-line my-6"></div>

          <div className="text-center space-y-5">
            <p className="text-ink-muted">This certificate is awarded to</p>
            <h2 className="text-4xl font-bold text-ink">{learnerName}</h2>
            <p className="text-ink-muted">for successful completion of</p>
            <h3 className="text-2xl font-semibold text-ink">{courseName}</h3>
            <p className="text-ink-muted">
              This certificate verifies successful completion of practical skill checks.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
            <div>
              <p className="text-ink font-semibold">{completionDate}</p>
              <p className="text-ink-subtle text-sm">Completion Date</p>
            </div>
            <div>
              <p className="text-ink font-semibold">{certificateNumber}</p>
              <p className="text-ink-subtle text-sm">Certificate ID</p>
            </div>
          </div>
        </div>

        <div className="mt-4 text-center print:mt-2">
          <p className="text-xs text-ink-subtle">
            Integrity notice: Certificates reflect completed practical skill checks only.
          </p>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 print:hidden">
          <button
            onClick={handleDownload}
            className="px-5 py-2.5 bg-ink text-ink-inverse rounded-md text-sm font-semibold"
          >
            Download PDF
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2.5 border border-line text-ink-muted rounded-md text-sm font-semibold"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
};

export default Certificate;
