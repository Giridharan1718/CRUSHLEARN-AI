const About = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="space-y-10">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">About CrushLearn AI</h1>
          <p className="text-gray-600">
            CrushLearn AI is a demo learning platform built around practice, clarity, and honest skill verification.
          </p>
        </header>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Platform Purpose</h2>
          <p className="text-gray-700">
            We focus on learning by doing, not memorization. Each lesson emphasizes practical output and repeatable habits.
          </p>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">How AI Helps</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-2">
            <li>AI guides thinking with prompts and reflection questions.</li>
            <li>AI does not give direct answers or complete solutions.</li>
            <li>No real AI APIs are used in this demo build.</li>
          </ul>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">How Skills Are Verified</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-2">
            <li>Simulations provide hands-on practice and feedback.</li>
            <li>The Final Skill Check is timed and requires exact output.</li>
          </ul>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">What Certificates Mean</h2>
          <ul className="list-disc list-inside text-gray-700 space-y-2">
            <li>They confirm completion of practical tasks and skill checks.</li>
            <li>They do not guarantee employment or job readiness.</li>
          </ul>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Offline Mode Disclaimer</h2>
          <p className="text-gray-700">
            Offline Mode is a demo-only toggle with limited functionality. It does not cache content or sync results.
          </p>
        </section>
      </div>
    </div>
  );
};

export default About;
