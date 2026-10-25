import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  findVisualExplanationForTopic,
  listVisualTopics,
} from '../visual/visualCatalog.mjs';
import { selectVisualStrategy } from '../visual/topicAnalysis.mjs';
import VisualLearningHomeView from '../components/visual/VisualLearningHomeView';

const VisualLearning = () => {
  const navigate = useNavigate();
  const [topics] = useState(() => listVisualTopics());
  const [analysis, setAnalysis] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [searchedTopic, setSearchedTopic] = useState('');

  const handleAnalyze = (topic) => {
    const result = findVisualExplanationForTopic(topic);

    if (!result.ok) {
      setAnalysis(null);
      setStrategy(null);
      setSearchedTopic('');
      return { ok: false, errors: result.errors };
    }

    if (result.explanation) {
      navigate(`/visual/${result.explanation.id}`);
      return { ok: true, matched: true };
    }

    setAnalysis(result.analysis);
    setStrategy(selectVisualStrategy(result.analysis));
    setSearchedTopic(result.analysis.topic);
    return { ok: true, matched: false };
  };

  return (
    <VisualLearningHomeView
      topics={topics}
      analysis={analysis}
      strategy={strategy}
      searchedTopic={searchedTopic}
      onAnalyze={handleAnalyze}
    />
  );
};

export default VisualLearning;
