package Examcraft.dto;

import java.util.List;

public class AttemptResponseDTO {

    private Long id;
    private int totalQuestions;
    private int score;
    private double percentage;
    private String result;
    private List<TestQuestionDTO> questions;

    public AttemptResponseDTO(
            Long id,
            int totalQuestions,
            int score,
            double percentage,
            String result,
            List<TestQuestionDTO> questions) {

        this.id = id;
        this.totalQuestions = totalQuestions;
        this.score = score;
        this.percentage = percentage;
        this.result = result;
        this.questions = questions;
    }

    public Long getId() {
        return id;
    }

    public int getTotalQuestions() {
        return totalQuestions;
    }

    public int getScore() {
        return score;
    }

    public double getPercentage() {
        return percentage;
    }

    public String getResult() {
        return result;
    }

    public List<TestQuestionDTO> getQuestions() {
        return questions;
    }
}