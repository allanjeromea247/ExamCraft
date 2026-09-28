package Examcraft.dto;

import java.util.List;

public class TestQuestionDTO {

    private Long id;
    private String questionText;
    private String skill;
    private String topic;
    private String difficulty;
    private String questionType;
    private List<String> options;

    public TestQuestionDTO(
            Long id,
            String questionText,
            String skill,
            String topic,
            String difficulty,
            String questionType,
            List<String> options) {

        this.id = id;
        this.questionText = questionText;
        this.skill = skill;
        this.topic = topic;
        this.difficulty = difficulty;
        this.questionType = questionType;
        this.options = options;
    }

    public Long getId() {
        return id;
    }

    public String getQuestionText() {
        return questionText;
    }

    public String getSkill() {
        return skill;
    }

    public String getTopic() {
        return topic;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public String getQuestionType() {
        return questionType;
    }

    public List<String> getOptions() {
        return options;
    }
}