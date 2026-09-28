package Examcraft.dto;

import java.util.List;

public class SubmitAttemptRequest {

    private List<AnswerRequest> answers;

    public SubmitAttemptRequest() {
    }

    public List<AnswerRequest> getAnswers() {
        return answers;
    }

    public void setAnswers(List<AnswerRequest> answers) {
        this.answers = answers;
    }
}