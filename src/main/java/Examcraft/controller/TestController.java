package Examcraft.controller;

import Examcraft.dto.TestQuestionDTO;
import Examcraft.entity.Question;
import Examcraft.services.TestGenerationService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/tests")
public class TestController {

    private final TestGenerationService testGenerationService;

    public TestController(TestGenerationService testGenerationService) {
        this.testGenerationService = testGenerationService;
    }

    @GetMapping("/generate")
    public List<TestQuestionDTO> generateTest(
            @RequestParam int totalQuestions,
            @RequestParam int easyPercent,
            @RequestParam int mediumPercent,
            @RequestParam int hardPercent) {

        List<Question> questions =
                testGenerationService.generateTest(
                        totalQuestions,
                        easyPercent,
                        mediumPercent,
                        hardPercent
                );

        List<TestQuestionDTO> result = new ArrayList<>();

        for (Question question : questions) {

            List<String> options = new ArrayList<>(Arrays.asList(
                    question.getOptionA(),
                    question.getOptionB(),
                    question.getOptionC(),
                    question.getOptionD()
            ));

            Collections.shuffle(options);

            TestQuestionDTO dto = new TestQuestionDTO(
                    question.getId(),
                    question.getQuestionText(),
                    question.getSkill(),
                    question.getTopic(),
                    question.getDifficulty(),
                    question.getQuestionType(),
                    options
            );

            result.add(dto);
        }

        return result;
    }
}