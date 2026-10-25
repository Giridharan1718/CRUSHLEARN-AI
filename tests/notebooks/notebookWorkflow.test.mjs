import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from './memoryStorage.mjs';
import { createNotebookRepository } from '../../src/notebooks/notebookRepository.mjs';
import { ingestPastedSource } from '../../src/notebooks/sourceIngestion.mjs';
import { answerFromNotebookSources } from '../../src/notebooks/sourceAnswers.mjs';
import {
  buildStudyKit,
  checkQuizAnswer,
  formatStudyKitForStorage,
} from '../../src/notebooks/studyTools.mjs';
import { validateCitation } from '../../src/notebooks/citations.mjs';
import { findVisualExplanationForTopic } from '../../src/visual/visualCatalog.mjs';

test('the complete local notebook workflow stays source-grounded and persisted', () => {
  const userId = 'workflow-user';
  const storage = new MemoryStorage();
  const repository = createNotebookRepository(storage);
  const notebook = repository.createNotebook(userId, {
    title: 'Science notebook',
    description: 'A local workflow test.',
  });

  assert.match(notebook.id, /^notebook_/);

  const biology = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Photosynthesis notes',
    text:
      'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs light in the visible spectrum.',
    now: '2026-10-20T10:00:00.000Z',
  });
  const electricity = ingestPastedSource({
    notebookId: notebook.id,
    title: 'Electricity notes',
    text:
      'Electricity flows through a closed circuit when a battery creates a potential difference. A lamp converts electrical energy into light.',
    now: '2026-10-20T10:01:00.000Z',
  });

  assert.equal(biology.ok, true);
  assert.equal(electricity.ok, true);

  repository.addSource(userId, notebook.id, {
    source: biology.source,
    content: biology.content,
  });
  repository.addSource(userId, notebook.id, {
    source: electricity.source,
    content: electricity.content,
  });

  const sources = repository.listSources(userId, notebook.id);
  const sourceContents = repository.listSourceContents(userId, notebook.id);
  assert.equal(sources.length, 2);
  assert.equal(Object.keys(sourceContents).length, 2);

  const answer = answerFromNotebookSources({
    sources,
    sourceContents,
    question: 'What does chlorophyll absorb?',
  });

  assert.equal(answer.ok, true);
  assert.equal(answer.answered, true);
  assert.equal(
    answer.answer,
    'Chlorophyll absorbs light in the visible spectrum.'
  );
  assert.equal(answer.sourceTitle, 'Photosynthesis notes');
  assert.equal(answer.generator, 'local_extractive');
  assert.match(answer.note, /not an AI-generated explanation/);

  const sourceTexts = Object.fromEntries(
    sources.map((source) => [source.id, sourceContents[source.id].text])
  );
  const revalidatedAnswer = validateCitation(answer.citation, {
    sourceIds: sources.map((source) => source.id),
    sourceTexts,
    requireSourceText: true,
  });
  assert.equal(revalidatedAnswer.ok, true);

  const visualQuestion =
    'How does electricity flow through a simple circuit?';
  const visualAnswer = answerFromNotebookSources({
    sources,
    sourceContents,
    question: visualQuestion,
  });
  assert.equal(visualAnswer.answered, true);
  assert.match(visualAnswer.answer, /closed circuit/i);

  const visual = findVisualExplanationForTopic(visualQuestion);
  assert.equal(visual.ok, true);
  assert.equal(visual.explanation.id, 'electricity-circuit');
  assert.equal(visual.explanation.visualType, 'process');

  const kitResult = buildStudyKit({
    sources,
    sourceContents,
    now: '2026-10-20T10:02:00.000Z',
  });
  assert.equal(kitResult.ok, true);
  assert.equal(kitResult.kit.generator, 'local_extractive');
  assert.ok(kitResult.kit.quiz.length > 0);
  assert.ok(
    checkQuizAnswer(
      kitResult.kit.quiz[0],
      kitResult.kit.quiz[0].answer
    )
  );

  const saved = repository.saveStudyMaterials(
    userId,
    notebook.id,
    [
      {
        title: 'Source study kit (2 sources)',
        kind: 'Study Kit',
        body: formatStudyKitForStorage(kitResult.kit),
        citations: kitResult.kit.citations,
        generator: kitResult.kit.generator,
      },
    ],
    '2026-10-20T10:03:00.000Z'
  );

  assert.equal(saved.length, 1);
  assert.match(saved[0].id, /^material_/);
  assert.equal(saved[0].generator, 'local_extractive');
  assert.ok(saved[0].citations.length > 0);
  assert.match(saved[0].body, /LOCAL EXTRACTIVE STUDY KIT/);
  assert.match(saved[0].body, /not AI-generated/);

  const reloadedMaterials = repository.listStudyMaterials(
    userId,
    notebook.id
  );
  assert.equal(reloadedMaterials.length, 1);

  const reloadedSourceTexts = repository.listSourceContents(
    userId,
    notebook.id
  );
  const allCitationsValid = reloadedMaterials[0].citations.every((citation) =>
    validateCitation(citation, {
      sourceIds: sources.map((source) => source.id),
      sourceTexts: Object.fromEntries(
        sources.map((source) => [
          source.id,
          reloadedSourceTexts[source.id]?.text || '',
        ])
      ),
      requireSourceText: true,
    }).ok
  );

  assert.equal(allCitationsValid, true);
  assert.equal(
    repository.getSourceContent(userId, notebook.id, biology.source.id).text,
    biology.content.text
  );
});
