import { useEffect, useState } from 'react';

const ReadAloudButton = ({
  text = '',
  label = 'Read aloud',
  className = '',
}) => {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    const available =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
    setSupported(available);

    return () => {
      if (available) window.speechSynthesis.cancel();
    };
  }, []);

  if (!String(text).trim()) return null;

  const handleClick = () => {
    if (!supported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(String(text));
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!supported}
      title={
        supported
          ? `${label} using this browser's speech voice`
          : 'Read-aloud is not available in this browser'
      }
      className={`rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-line-subtle disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {speaking ? 'Stop reading' : label}
    </button>
  );
};

export default ReadAloudButton;
