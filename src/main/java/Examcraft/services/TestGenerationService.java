package Examcraft.services;

import Examcraft.entity.Question;
import Examcraft.repository.QuestionRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
public class TestGenerationService {

    private final QuestionRepository questionRepository;

    public TestGenerationService(QuestionRepository questionRepository) {
        this.questionRepository = questionRepository;
    }

    public List<Question> generateTest(
            int totalQuestions,
            int easyPercent,
            int mediumPercent,
            int hardPercent) {

        if (totalQuestions <= 0) {
            throw new RuntimeException(
                    "Total questions must be greater than 0"
            );
        }

        if (easyPercent < 0 ||
                mediumPercent < 0 ||
                hardPercent < 0) {

            throw new RuntimeException(
                    "Difficulty percentages cannot be negative"
            );
        }

        if (easyPercent + mediumPercent + hardPercent != 100) {
            throw new RuntimeException(
                    "Difficulty percentages must add up to 100"
            );
        }

        int easyCount =
                totalQuestions * easyPercent / 100;

        int mediumCount =
                totalQuestions * mediumPercent / 100;

        int hardCount =
                totalQuestions - easyCount - mediumCount;

        List<Question> easyQuestions =
                new ArrayList<>(
                        questionRepository
                                .findByDifficultyAndStatus(
                                        "Easy",
                                        "APPROVED"
                                )
                );

        List<Question> mediumQuestions =
                new ArrayList<>(
                        questionRepository
                                .findByDifficultyAndStatus(
                                        "Medium",
                                        "APPROVED"
                                )
                );

        List<Question> hardQuestions =
                new ArrayList<>(
                        questionRepository
                                .findByDifficultyAndStatus(
                                        "Hard",
                                        "APPROVED"
                                )
                );

        if (easyQuestions.size() < easyCount) {
            throw new RuntimeException(
                    "Not enough Easy questions"
            );
        }

        if (mediumQuestions.size() < mediumCount) {
            throw new RuntimeException(
                    "Not enough Medium questions"
            );
        }

        if (hardQuestions.size() < hardCount) {
            throw new RuntimeException(
                    "Not enough Hard questions"
            );
        }

        Collections.shuffle(easyQuestions);
        Collections.shuffle(mediumQuestions);
        Collections.shuffle(hardQuestions);

        List<Question> test = new ArrayList<>();

        test.addAll(
                easyQuestions.subList(0, easyCount)
        );

        test.addAll(
                mediumQuestions.subList(0, mediumCount)
        );

        test.addAll(
                hardQuestions.subList(0, hardCount)
        );

        Collections.shuffle(test);

        for (Question question : test) {

            question.setUsageCount(
                    question.getUsageCount() + 1
            );

            questionRepository.save(question);
        }

        return test;
    }
}