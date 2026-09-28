package Examcraft.controller;

import Examcraft.dto.AttemptResponseDTO;
import Examcraft.dto.SubmitAttemptRequest;
import Examcraft.entity.Attempt;
import Examcraft.services.AttemptService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/attempts")
public class AttemptController {

    private final AttemptService attemptService;

    public AttemptController(AttemptService attemptService) {
        this.attemptService = attemptService;
    }

    @PostMapping
    public AttemptResponseDTO createAttempt(
            @RequestBody List<Long> questionIds) {

        Attempt attempt =
                attemptService.createAttempt(questionIds);

        return attemptService.getAttempt(attempt.getId());
    }

    @GetMapping("/{id}")
    public AttemptResponseDTO getAttempt(
            @PathVariable Long id) {

        return attemptService.getAttempt(id);
    }

    @PostMapping("/{id}/submit")
    public AttemptResponseDTO submitAttempt(
            @PathVariable Long id,
            @RequestBody SubmitAttemptRequest request) {

        attemptService.submitAttempt(id, request);

        return attemptService.getAttempt(id);
    }
}