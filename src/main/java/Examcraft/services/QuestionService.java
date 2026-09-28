package Examcraft.services;

import Examcraft.entity.Question;
import Examcraft.repository.QuestionRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class QuestionService {

    private final QuestionRepository questionRepository;

    public QuestionService(QuestionRepository questionRepository) {
        this.questionRepository = questionRepository;
    }

    public Question createQuestion(Question question) {

        validateQuestion(question);

        if (question.getStatus() == null ||
                question.getStatus().isBlank()) {

            question.setStatus("APPROVED");
        }

        return questionRepository.save(question);
    }

    public List<Question> getAllQuestions() {
        return questionRepository.findAll();
    }

    public Question getQuestionById(Long id) {

        return questionRepository.findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Question not found"));
    }

    public Question updateQuestion(
            Long id,
            Question updatedQuestion) {

        Question question =
                questionRepository.findById(id)
                        .orElseThrow(() ->
                                new RuntimeException("Question not found"));

        validateQuestion(updatedQuestion);

        question.setQuestionText(updatedQuestion.getQuestionText());
        question.setSkill(updatedQuestion.getSkill());
        question.setTopic(updatedQuestion.getTopic());
        question.setDifficulty(updatedQuestion.getDifficulty());
        question.setQuestionType(updatedQuestion.getQuestionType());

        question.setOptionA(updatedQuestion.getOptionA());
        question.setOptionB(updatedQuestion.getOptionB());
        question.setOptionC(updatedQuestion.getOptionC());
        question.setOptionD(updatedQuestion.getOptionD());

        question.setCorrectAnswer(updatedQuestion.getCorrectAnswer());
        question.setExplanation(updatedQuestion.getExplanation());
        question.setStatus(updatedQuestion.getStatus());
        question.setTags(updatedQuestion.getTags());
        question.setSource(updatedQuestion.getSource());

        question.setStarterCode(updatedQuestion.getStarterCode());
        question.setLanguage(updatedQuestion.getLanguage());
        question.setTestCases(updatedQuestion.getTestCases());
        question.setExpectedOutput(updatedQuestion.getExpectedOutput());
        question.setConstraints(updatedQuestion.getConstraints());
        question.setEvaluationType(updatedQuestion.getEvaluationType());

        question.setUnit(updatedQuestion.getUnit());

        return questionRepository.save(question);
    }

    public void deleteQuestion(Long id) {

        Question question =
                questionRepository.findById(id)
                        .orElseThrow(() ->
                                new RuntimeException("Question not found"));

        question.setStatus("DELETED");

        questionRepository.save(question);
    }

    public List<Question> getQuestionUsage() {
        return questionRepository
                .findAllByOrderByUsageCountDesc();
    }

    private void validateQuestion(Question question) {

        if (question.getQuestionText() == null ||
                question.getQuestionText().isBlank()) {

            throw new RuntimeException(
                    "Question text is required");
        }

        if (question.getSkill() == null ||
                question.getSkill().isBlank()) {

            throw new RuntimeException(
                    "Skill is required");
        }

        if (question.getDifficulty() == null ||
                question.getDifficulty().isBlank()) {

            throw new RuntimeException(
                    "Difficulty is required");
        }

        if (!question.getDifficulty().equals("Easy") &&
                !question.getDifficulty().equals("Medium") &&
                !question.getDifficulty().equals("Hard")) {

            throw new RuntimeException(
                    "Difficulty must be Easy, Medium, or Hard");
        }

        if (question.getQuestionType() == null ||
                question.getQuestionType().isBlank()) {

            throw new RuntimeException(
                    "Question type is required");
        }

        if (!question.getQuestionType().equalsIgnoreCase("MCQ") &&
                !question.getQuestionType().equalsIgnoreCase("OBJECTIVE") &&
                !question.getQuestionType().equalsIgnoreCase("PRACTICAL") &&
                !question.getQuestionType().equalsIgnoreCase("CODING") &&
                !question.getQuestionType().equalsIgnoreCase("SCENARIO") &&
                !question.getQuestionType().equalsIgnoreCase("REASONING")) {

            throw new RuntimeException(
                    "Invalid question type");
        }

        if (question.getQuestionType().equalsIgnoreCase("MCQ") ||
                question.getQuestionType().equalsIgnoreCase("OBJECTIVE")) {

            if (question.getOptionA() == null ||
                    question.getOptionB() == null ||
                    question.getOptionC() == null ||
                    question.getOptionD() == null) {

                throw new RuntimeException(
                        "MCQ questions require four options");
            }

            if (question.getCorrectAnswer() == null ||
                    question.getCorrectAnswer().isBlank()) {

                throw new RuntimeException(
                        "MCQ questions require a correct answer");
            }
        }

        if (question.getQuestionType().equalsIgnoreCase("CODING") ||
                question.getQuestionType().equalsIgnoreCase("PRACTICAL")) {

            if (question.getLanguage() == null ||
                    question.getLanguage().isBlank()) {

                throw new RuntimeException(
                        "Coding questions require a programming language");
            }

            if (question.getTestCases() == null ||
                    question.getTestCases().isBlank()) {

                throw new RuntimeException(
                        "Coding questions require test cases");
            }
        }

        if (question.getQuestionType().equalsIgnoreCase("SCENARIO") ||
                question.getQuestionType().equalsIgnoreCase("REASONING")) {

            if (question.getCorrectAnswer() == null ||
                    question.getCorrectAnswer().isBlank()) {

                throw new RuntimeException(
                        "Scenario questions require a correct answer");
            }
        }
    }
}