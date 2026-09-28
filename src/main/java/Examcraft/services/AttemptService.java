package Examcraft.services;

import Examcraft.dto.AnswerRequest;
import Examcraft.dto.AttemptResponseDTO;
import Examcraft.dto.SubmitAttemptRequest;
import Examcraft.dto.TestQuestionDTO;
import Examcraft.entity.Attempt;
import Examcraft.entity.Question;
import Examcraft.repository.AttemptRepository;
import Examcraft.repository.QuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

@Service
public class AttemptService {

    private final AttemptRepository attemptRepository;
    private final QuestionRepository questionRepository;

    public AttemptService(
            AttemptRepository attemptRepository,
            QuestionRepository questionRepository) {

        this.attemptRepository = attemptRepository;
        this.questionRepository = questionRepository;
    }

    public Attempt createAttempt(List<Long> questionIds) {

        List<Question> questions =
                questionRepository.findAllById(questionIds);

        if (questions.size() != questionIds.size()) {
            throw new RuntimeException("One or more questions not found");
        }

        Attempt attempt = new Attempt();

        attempt.setQuestions(questions);
        attempt.setTotalQuestions(questions.size());
        attempt.setScore(0);
        attempt.setPercentage(0);
        attempt.setResult("NOT_SUBMITTED");

        return attemptRepository.save(attempt);
    }

    public AttemptResponseDTO getAttempt(Long id) {

        Attempt attempt = attemptRepository.findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Attempt not found"));

        List<TestQuestionDTO> questionDTOs = new ArrayList<>();

        for (Question question : attempt.getQuestions()) {

            List<String> options = new ArrayList<>(Arrays.asList(
                    question.getOptionA(),
                    question.getOptionB(),
                    question.getOptionC(),
                    question.getOptionD()
            ));

            options.removeIf(Objects::isNull);

            TestQuestionDTO dto = new TestQuestionDTO(
                    question.getId(),
                    question.getQuestionText(),
                    question.getSkill(),
                    question.getTopic(),
                    question.getDifficulty(),
                    question.getQuestionType(),
                    options
            );

            questionDTOs.add(dto);
        }

        return new AttemptResponseDTO(
                attempt.getId(),
                attempt.getTotalQuestions(),
                attempt.getScore(),
                attempt.getPercentage(),
                attempt.getResult(),
                questionDTOs
        );
    }

    @Transactional
    public Attempt submitAttempt(
            Long attemptId,
            SubmitAttemptRequest request) {

        Attempt attempt = attemptRepository.findById(attemptId)
                .orElseThrow(() ->
                        new RuntimeException("Attempt not found"));

        int score = 0;

        for (AnswerRequest answer : request.getAnswers()) {

            for (Question question : attempt.getQuestions()) {

                if (question.getId().equals(answer.getQuestionId())) {

                    if (question.getCorrectAnswer()
                            .equalsIgnoreCase(answer.getAnswer())) {

                        score++;
                    }

                    break;
                }
            }
        }

        double percentage =
                ((double) score / attempt.getTotalQuestions()) * 100;

        attempt.setScore(score);
        attempt.setPercentage(percentage);

        if (percentage >= 40) {
            attempt.setResult("PASS");
        } else {
            attempt.setResult("FAIL");
        }

        return attemptRepository.save(attempt);
    }
}